import os
from pathlib import Path
from django.core.management.base import BaseCommand
from jobs.models import JobRequest
from recruitment.models import CandidateResume
from recruitment.services.resume_extractor import extract_text_from_file, extract_with_ollama, _is_valid_name
from recruitment.services.resume_matcher import match_resume

class Command(BaseCommand):
    help = 'Recursively bulk ingest resumes from a local folder and its subfolders into a specific job request'

    def add_arguments(self, parser):
        parser.add_argument('--folder', type=str, help='Path to the main folder containing PDFs')
        parser.add_argument('--job_id', type=int, help='ID of the JobRequest to attach resumes to')

    def handle(self, *args, **options):
        folder_path = options['folder']
        job_id = options['job_id']

        if not folder_path or not job_id:
            self.stdout.write(self.style.ERROR("Please provide both --folder and --job_id"))
            return

        try:
            job_request = JobRequest.objects.get(id=job_id, status="APPROVED")
        except JobRequest.DoesNotExist:
            self.stdout.write(self.style.ERROR(f"Approved JobRequest with ID {job_id} not found."))
            return

        # ✅ CHANGED: Use pathlib.Path to recursively find ALL PDFs in all subfolders
        base_dir = Path(folder_path)
        if not base_dir.is_dir():
            self.stdout.write(self.style.ERROR(f"Folder {folder_path} does not exist."))
            return

        # rglob('*.pdf') will search this folder AND all folders inside it
        pdf_files = list(base_dir.rglob('*.pdf'))
        
        self.stdout.write(self.style.SUCCESS(f"Found {len(pdf_files)} PDFs recursively in {folder_path}. Starting ingestion..."))

        for i, file_path in enumerate(pdf_files):
            filename = file_path.name
            
            # Check if we already processed this file name (basic deduplication)
            if CandidateResume.objects.filter(candidate_name__icontains=filename.replace('.pdf','')).exists():
                self.stdout.write(self.style.WARNING(f"[{i+1}/{len(pdf_files)}] Skipping {filename} (already exists)"))
                continue

            self.stdout.write(self.style.SUCCESS(f"[{i+1}/{len(pdf_files)}] Processing {filename}..."))

            try:
                # 1. Extract text from local file
                resume_text = extract_text_from_file(str(file_path)) # Pass the full path as string
                if not resume_text or len(resume_text.strip()) < 30:
                    self.stdout.write(self.style.WARNING(f"  -> Could not extract text from {filename}"))
                    continue

                # 2. Create DB record (leave resume_url blank since it's local)
                resume = CandidateResume.objects.create(
                    job_request=job_request,
                    uploaded_by=None, # System upload
                    resume_url="", 
                    resume_text=resume_text
                )

                # 3. Run AI extraction and scoring (Same logic as views.py)
                required_skills = job_request.skills_list()
                result = extract_with_ollama(resume_text, required_skills)
                
                extracted_skills = result["skills"] if isinstance(result["skills"], list) else result["skills"].split(",")
                keyword_score = match_resume(extracted_skills, required_skills)
                llm_score = result.get("llm_score", 0)

                # Grounded Hybrid Scoring
                if keyword_score == 0: computed_score = min(float(llm_score), 40.0)
                elif keyword_score <= 30: computed_score = min((keyword_score + llm_score) / 2.0, 65.0)
                else: computed_score = (keyword_score + llm_score) / 2.0

                extracted_name = result.get("name", "")
                if not extracted_name or not _is_valid_name(extracted_name):
                    # Fallback name: use the filename or the folder name it was in
                    extracted_name = filename.replace('.pdf', '').replace('.PDF', '').replace('_', ' ').title()

                resume.candidate_name = extracted_name
                resume.email = result.get("email", "")
                resume.phone = result.get("phone", "")
                resume.experience = float(result.get("experience", 0.0) or 0.0)
                resume.skills = extracted_skills
                resume.match_percentage = computed_score
                resume.is_shortlisted = computed_score >= 65.0
                resume.fit_summary = result.get("fit_summary", "")
                resume.save()

                self.stdout.write(self.style.SUCCESS(f"  -> Scored {computed_score:.1f}% | Shortlisted: {resume.is_shortlisted}"))

            except Exception as e:
                self.stdout.write(self.style.ERROR(f"  -> Error processing {filename}: {e}"))

        self.stdout.write(self.style.SUCCESS("Bulk ingestion complete!"))