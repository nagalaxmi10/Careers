from datetime import datetime

from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.decorators import api_view, permission_classes
from django.shortcuts import redirect
import threading
from pathlib import Path
import os
import requests
from io import BytesIO
from collections import Counter


from .models import CandidateResume, ResumeScreening, Interview, EmailLog
from .serializers import (
    CandidateResumeSerializer,
    ResumeScreeningSerializer,
    InterviewSerializer,
    EmailLogSerializer
)
from jobs.models import JobRequest
from .services.pii_redactor import extract_pii, redact_pii
from .services.resume_matcher import match_resume
from .services.resume_extractor import extract_text_from_file, extract_with_ollama, _is_valid_name
from .email_service import send_interview_email

SHORTLIST_THRESHOLD = 70.0  # default threshold; pool screening lets recruiter override per-run


def _to_list(value):
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        return [s.strip() for s in value.split(",") if s.strip()]
    return []


def _experience_score(candidate_exp, required_exp):
    """Score candidate experience against job requirement (0-100)."""
    try:
        candidate_exp = float(candidate_exp or 0)
        required_exp  = float(required_exp  or 0)
        if required_exp <= 0:
            return 100.0
        ratio = candidate_exp / required_exp
        return 100.0 if ratio >= 1 else round(ratio * 100.0, 2)
    except Exception:
        return 0.0


def _compute_score(keyword_score, llm_score, experience_score=100.0):
    """
    Weighted ATS score:
      50% LLM relevance
      30% keyword match
      20% experience match
    """
    if llm_score == 0:
        return round((0.8 * keyword_score) + (0.2 * experience_score), 2)
    if keyword_score == 0:
        return min(float(llm_score), 40.0)
    elif keyword_score <= 30:
        base = (keyword_score + llm_score) / 2.0
        return round(min(base, 65.0), 2)
    else:
        return round(
            (0.50 * llm_score) +
            (0.30 * keyword_score) +
            (0.20 * experience_score),
            2
        )


def _process_resume(resume, resume_text, job_request, filename="", uploaded_by="", result=None, threshold=SHORTLIST_THRESHOLD):
    required_skills = job_request.skills_list() or []

    pii = extract_pii(resume_text)
    redacted_text = redact_pii(resume_text)

    # ── Quick pre-filter — skip Ollama if no skill overlap at all ──
    if result is None:
        required_lower = [s.lower() for s in required_skills]
        resume_lower = resume_text.lower()
        has_any_skill = any(skill in resume_lower for skill in required_lower)
        if not has_any_skill:
            result = {
                "name": "", "email": "", "phone": "", "experience": 0.0,
                "skills": [], "score": 0.0, "fit_summary": "No relevant skills found.", "llm_score": 0,
            }

    if result is None:
        result = extract_with_ollama(
            redacted_text, required_skills,
            job_context="", past_matches="",
            filename=filename, uploaded_by=str(uploaded_by)
        )

    if not result:
        result = {
            "name": "", "email": "", "phone": "", "experience": 0.0,
            "skills": [], "score": 0.0, "fit_summary": "", "llm_score": 0,
        }


    extracted_skills = _to_list(result["skills"])
    print(f"[DEBUG] _process_resume → extracted_skills: {extracted_skills}")

    keyword_score = match_resume(extracted_skills, required_skills)
    llm_score     = result.get("llm_score", 0)

    try:
        experience = float(result.get("experience", 0.0) or 0.0)
        if experience < 0:
            experience = 0.0
    except (TypeError, ValueError):
        experience = 0.0

    exp_score      = _experience_score(experience, getattr(job_request, "experience_required", 0))
    computed_score = _compute_score(keyword_score, llm_score, exp_score)

    print(f"=== FINAL SCORING ===")
    print(f"Keyword Score:    {keyword_score}")
    print(f"LLM Score:        {llm_score}")
    print(f"Experience Score: {exp_score}")
    print(f"Final Score:      {computed_score}")

    extracted_name = pii["name"] if _is_valid_name(pii["name"]) else ""
    if not extracted_name:
        if pii["email"]:
            extracted_name = pii["email"].split("@")[0].replace(".", " ").replace("_", " ").title()
        elif filename:
            extracted_name = filename.rsplit('.', 1)[0].replace('_', ' ').replace('-', ' ').title()
        else:
            extracted_name = ""

    # Pool-level fields — belong to the resume itself, not any one screening
    resume.resume_text    = resume_text
    resume.candidate_name = extracted_name
    resume.email          = pii["email"]
    resume.phone          = pii["phone"]
    resume.linkedin_url   = pii["linkedin_url"]
    resume.github_url     = pii["github_url"]
    resume.experience     = experience
    resume.skills         = extracted_skills
    resume.save()

    # Screening outcome — scoped to (resume, job_request)
    screening, _ = ResumeScreening.objects.update_or_create(
        resume=resume,
        job_request=job_request,
        defaults={
            "llm_score":      computed_score,
            "threshold_used": threshold,
            "is_shortlisted": computed_score >= threshold,
            "fit_summary":    result.get("fit_summary", ""),
            "matched_skills": extracted_skills,
        }
    )

    return screening


class CandidateResumeViewSet(ModelViewSet):
    """
    The resume POOL. No job filtering by default — a resume exists
    independent of any job. Use ResumeScreeningViewSet to see/filter
    by job-specific results.
    """
    serializer_class = CandidateResumeSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        user = self.request.user
        if user.role in ["ADMIN", "RECRUITER"]:
            return CandidateResume.objects.all()
        if user.role in ["HR", "JUNIOR_HR"]:
            # HR only sees resumes that are shortlisted for AT LEAST one job
            return CandidateResume.objects.filter(screenings__is_shortlisted=True).distinct()
        return CandidateResume.objects.none()

    def perform_create(self, serializer):
        """
        Single URL submission — adds a resume to the POOL only.
        No job, no scoring at upload time. Use the screening endpoint
        to score pool resumes against a job afterward.
        """
        user = self.request.user
        if user.role != "RECRUITER":
            raise PermissionDenied("Only recruiters can add resumes.")

        resume_url = self.request.data.get("resume_url")
        if not resume_url:
            raise PermissionDenied("Resume URL is required.")

        if "drive.google.com" in resume_url and "/uc?export=download" not in resume_url:
            try:
                file_id = resume_url.split('/d/')[1].split('/')[0]
                resume_url = f"https://drive.google.com/uc?export=download&id={file_id}"
            except IndexError:
                pass

        try:
            response = requests.get(resume_url, timeout=15)
            response.raise_for_status()
            in_memory_pdf = BytesIO(response.content)
        except requests.RequestException:
            resume = serializer.save(uploaded_by=user, resume_url=resume_url)
            resume.candidate_name = "Failed to fetch URL"
            resume.save()
            return

        resume = serializer.save(uploaded_by=user, resume_url=resume_url)
        resume_text = extract_text_from_file(in_memory_pdf)

        if not resume_text or len(resume_text.strip()) < 30:
            resume.candidate_name = "Unreadable Resume / Empty PDF"
            resume.resume_text = resume_text or ""
            resume.save()
            return

        pii = extract_pii(resume_text)
        redacted_text = redact_pii(resume_text)

        resume.resume_text    = resume_text
        resume.candidate_name = pii["name"] or "Unknown Candidate"
        resume.email          = pii["email"]
        resume.phone          = pii["phone"]
        resume.linkedin_url   = pii["linkedin_url"]
        resume.github_url     = pii["github_url"]
        resume.save()

        from .services.rag_store import index_resume
        chroma_id = index_resume(
            resume_id=resume.id,
            redacted_text=redacted_text,
            job_request_id=None,
            original_filename=resume_url,
        )
        if chroma_id:
            resume.chroma_id = chroma_id
            resume.save(update_fields=["chroma_id"])

    def perform_destroy(self, instance):
        if self.request.user.role not in ["ADMIN", "RECRUITER"]:
            raise PermissionDenied("Permission denied.")
        instance.delete()


# ── BULK FILE UPLOAD — adds to POOL only, no job, no scoring ──────────────────
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def bulk_upload_resumes(request):
    """
    Bulk upload into the resume POOL. Extracts text, redacts PII,
    embeds into ChromaDB, saves to CandidateResume. Does NOT score
    against any job — use the screening endpoint for that, against
    whichever job(s) the recruiter chooses, whenever they choose.
    """
    if request.user.role != "RECRUITER":
        raise PermissionDenied("Only recruiters can upload resumes.")

    files = request.FILES.getlist("files")
    if not files:
        return Response({"error": "Files are required."}, status=400)

    from .services.rag_store import index_resume

    processed_count = 0
    errors = []

    for f in files:
        fname = f.name
        fname_lower = fname.lower()
        if not (fname_lower.endswith('.pdf') or fname_lower.endswith('.jpg') or
                fname_lower.endswith('.jpeg') or fname_lower.endswith('.png')):
            errors.append(f"{fname}: Unsupported file type")
            continue

        try:
            f.seek(0)
            resume_text = extract_text_from_file(f)
        except Exception as e:
            print(f"[BULK UPLOAD] Extraction error on {fname}: {e}")
            errors.append(f"{fname}: extraction failed — {str(e)}")
            continue

        if not resume_text or len(resume_text.strip()) < 30:
            errors.append(f"{fname}: Unreadable or empty file")
            continue

        try:
            pii = extract_pii(resume_text)
            redacted_text = redact_pii(resume_text)

            f.seek(0)
            resume = CandidateResume.objects.create(
                uploaded_by    = request.user,
                resume_url     = "",
                resume_file    = f,
                resume_text    = resume_text,
                candidate_name = pii["name"] or fname.rsplit('.', 1)[0].replace('_', ' ').title(),
                email          = pii["email"],
                phone          = pii["phone"],
                linkedin_url   = pii["linkedin_url"],
                github_url     = pii["github_url"],
            )

            chroma_id = index_resume(
                resume_id=resume.id,
                redacted_text=redacted_text,
                job_request_id=None,
                original_filename=fname,
            )
            if chroma_id:
                resume.chroma_id = chroma_id
                resume.save(update_fields=["chroma_id"])

            processed_count += 1
            print(f"[BULK UPLOAD] Added to pool: {fname}")

        except Exception as e:
            print(f"[BULK UPLOAD] Error on {fname}: {e}")
            errors.append(f"{fname}: {str(e)}")

    return Response({
        "message":   f"Added {processed_count} of {len(files)} resume(s) to the pool.",
        "processed": processed_count,
        "errors":    errors
    })


# ── SCREEN THE POOL AGAINST A JOB — the new core screening endpoint ───────────
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def screen_pool_for_job(request):
    if request.user.role != "RECRUITER":
        raise PermissionDenied("Only recruiters can run screening.")

    job_request_id = request.data.get("job_request")
    threshold = float(request.data.get("threshold", SHORTLIST_THRESHOLD))

    if not job_request_id:
        return Response({"error": "job_request is required."}, status=400)

    try:
        job_request = JobRequest.objects.get(id=job_request_id, status="APPROVED")
    except JobRequest.DoesNotExist:
        return Response({"error": "Approved job request not found."}, status=404)

    pool = CandidateResume.objects.exclude(resume_text="")
    if not pool.exists():
        return Response({"message": "Resume pool is empty.", "shortlisted": []})

    existing_screenings = {
        s.resume_id: s for s in
        ResumeScreening.objects.filter(job_request=job_request)
    }

    # For threshold changes — just update is_shortlisted, no re-running Ollama
    for resume_id, screening in existing_screenings.items():
        if screening.threshold_used != threshold:
            screening.is_shortlisted = screening.llm_score >= threshold
            screening.threshold_used = threshold
            screening.save(update_fields=["is_shortlisted", "threshold_used"])

    # Only truly new resumes (not yet screened at all) need Ollama
    pending_pool = [
        r for r in pool
        if r.id not in existing_screenings
    ]

    from .services.rag_store import query_similar_resumes
    job_text = f"{job_request.title} {job_request.description or ''} {job_request.skills_required or ''}"
    similar_ids = set(str(i) for i in query_similar_resumes(job_text, top_k=50))
    if similar_ids:
        pending_pool = [r for r in pending_pool if str(r.id) in similar_ids]
        print(f"[VECTOR FILTER] Reduced to {len(pending_pool)} candidates after embedding filter")
    else:
        print("[VECTOR FILTER] No vector matches — processing full pending pool")

    from .services.sharepoint_service import upload_resume_to_sharepoint
    from concurrent.futures import ThreadPoolExecutor, as_completed

    newly_screened_count = 0
    newly_shortlisted_count = 0
    errors = []

    def screen_one(resume):
        try:
            return (resume, _process_resume(
                resume, resume.resume_text, job_request,
                filename=resume.original_filename or resume.candidate_name,
                uploaded_by=str(request.user),
                threshold=threshold,
            ))
        except Exception as e:
            return (resume, e)

    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {executor.submit(screen_one, r): r for r in pending_pool}
        for future in as_completed(futures):
            resume, result = future.result()
            if isinstance(result, Exception):
                print(f"[Screen Pool] Error on resume #{resume.id}: {result}")
                errors.append({"resume_id": resume.id, "error": str(result)})
            else:
                newly_screened_count += 1
                if result.is_shortlisted:
                    newly_shortlisted_count += 1
                    try:
                        if resume.resume_file:
                            resume.resume_file.seek(0)
                            file_bytes = resume.resume_file.read()
                            skillset_str = ", ".join(result.matched_skills) if result.matched_skills else ""
                            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                            sp_filename = f"{timestamp}_{resume.resume_file.name.split('/')[-1]}"
                            upload_resume_to_sharepoint(sp_filename, file_bytes, skillset_str)
                    except Exception as e:
                        print(f"[Screen Pool] SharePoint push failed for resume #{resume.id}: {e}")

    shortlist_qs = ResumeScreening.objects.filter(
        job_request=job_request, is_shortlisted=True
    ).select_related("resume").order_by("-llm_score")

    shortlisted = [
        {
            "screening_id": sc.id,
            "resume_id":    sc.resume_id,
            "candidate":    sc.resume.candidate_name or "Unknown",
            "llm_score":    sc.llm_score,
            "status":       sc.status,
        }
        for sc in shortlist_qs
    ]

    skipped_count = len(existing_screenings)

    return Response({
        "message": (
            f"Screened {newly_screened_count} resume(s) against '{job_request.title}' "
            f"({skipped_count} already screened, skipped). "
            f"{newly_shortlisted_count} newly shortlisted. "
            f"{len(shortlisted)} total shortlisted."
        ),
        "shortlisted": shortlisted,
        "errors": errors,
    })

# ── GET existing shortlist for a job WITHOUT re-screening ────────────────────
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def job_shortlist_view(request, job_id):
    """
    Returns the current shortlist for a job from already-saved
    ResumeScreening rows — no LLM calls, no re-screening.
    """
    try:
        job_request = JobRequest.objects.get(id=job_id, status="APPROVED")
    except JobRequest.DoesNotExist:
        return Response({"error": "Approved job request not found."}, status=404)

    shortlist_qs = ResumeScreening.objects.filter(
        job_request=job_request, is_shortlisted=True
    ).select_related("resume").order_by("-llm_score")

    results = [
        {
            "id":            sc.id,
            "candidate_name": sc.resume.candidate_name or "Unknown",
            "email":         sc.resume.email or "",
            "llm_score":     sc.llm_score,
        }
        for sc in shortlist_qs
    ]

    return Response({"results": results})


class ResumeScreeningViewSet(ModelViewSet):
    """
    Replaces the old ShortlistedCandidateViewSet. Each row is one
    (resume, job_request) screening result.
    """
    serializer_class   = ResumeScreeningSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        queryset = ResumeScreening.objects.all().select_related("resume", "job_request")

        job_request_id = self.request.query_params.get('job_request')
        if job_request_id:
            queryset = queryset.filter(job_request_id=job_request_id)

        if user.role in ["ADMIN", "RECRUITER", "HR", "JUNIOR_HR"]:
            return queryset
        return ResumeScreening.objects.none()

    def perform_update(self, serializer):
        if self.request.user.role not in ["HR", "JUNIOR_HR", "ADMIN"]:
            raise PermissionDenied("Only HR can update candidate status.")
        serializer.save()

    def perform_destroy(self, instance):
        if self.request.user.role not in ["ADMIN", "HR", "RECRUITER"]:
            raise PermissionDenied("Only admin, HR or Recruiter can delete.")
        instance.delete()


class InterviewViewSet(ModelViewSet):
    serializer_class   = InterviewSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role in ["ADMIN", "HR", "JUNIOR_HR", "RECRUITER"]:
            return Interview.objects.all().select_related("candidate__resume", "candidate__job_request")
        return Interview.objects.none()

    def perform_update(self, serializer):
        if self.request.user.role != "HR":
            raise PermissionDenied("Only HR can update interviews.")
        serializer.save()

    def perform_destroy(self, instance):
        if self.request.user.role not in ["ADMIN", "HR"]:
            raise PermissionDenied("Only HR or Admin can cancel interviews.")
        instance.delete()

    def perform_create(self, serializer):
        if self.request.user.role != "HR":
            raise PermissionDenied("Only HR can schedule interviews.")

        interview = serializer.save(scheduled_by=self.request.user)
        print("=== INTERVIEW CREATED, ATTEMPTING TO SEND EMAIL ===")

        try:
            screening = interview.candidate              # ResumeScreening
            candidate_resume = screening.resume           # CandidateResume
            job_title = screening.job_request.title

            send_interview_email(
                candidate_email = candidate_resume.email or "no-email@example.com",
                candidate_name  = candidate_resume.candidate_name or "Candidate",
                job_title       = job_title or "Open Position",
                interview_date  = str(interview.interview_date),
                interview_time  = str(interview.interview_time),
                mode            = interview.mode,
                meeting_link    = interview.meeting_link,
                location        = interview.location,
                notes           = interview.feedback,
            )
            print("=== EMAIL SENT AND LOGGED SUCCESSFULLY ===")
        except Exception as e:
            print(f"!!! ERROR SENDING EMAIL: {e} !!!")


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def email_log_view(request):
    if request.user.role not in ["HR", "JUNIOR_HR", "ADMIN"]:
        return Response({"error": "Access denied."}, status=403)
    queryset   = EmailLog.objects.all()
    serializer = EmailLogSerializer(queryset, many=True)
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def serve_resume(request, pk):
    if request.user.role not in ["ADMIN", "HR", "JUNIOR_HR", "RECRUITER"]:
        raise PermissionDenied("Access denied.")

    try:
        resume = CandidateResume.objects.get(pk=pk)

        if resume.resume_url and resume.resume_url.startswith(('http://', 'https://')):
            return redirect(resume.resume_url)

        if hasattr(resume, 'resume_file') and resume.resume_file:
            return redirect(resume.resume_file.url)

        if resume.original_filename:
            from .services.sharepoint_service import download_resume
            from django.http import HttpResponse
            pdf_bytes = download_resume(resume.original_filename)
            if pdf_bytes:
                response = HttpResponse(pdf_bytes, content_type="application/pdf")
                response["Content-Disposition"] = f'inline; filename="{resume.original_filename}"'
                return response

        return Response({"error": "No resume file or URL available."}, status=404)

    except CandidateResume.DoesNotExist:
        return Response({"error": "Resume not found"}, status=404)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def resend_email_view(request, log_id):
    if request.user.role not in ["HR", "JUNIOR_HR", "ADMIN"]:
        raise PermissionDenied("Only HR or Admin can resend emails.")

    try:
        log = EmailLog.objects.get(pk=log_id)
    except EmailLog.DoesNotExist:
        return Response({"error": "Email log not found"}, status=404)

    if log.status == "SENT":
        return Response({"message": "Email was already sent successfully."}, status=400)

    try:
        from django.core.mail import send_mail
        send_mail(
            subject        = log.subject,
            message        = log.body,
            from_email     = None,
            recipient_list = [log.to],
            fail_silently  = False,
            html_message   = log.body
        )
        log.status = "SENT"
        log.error  = ""
        log.save()
        return Response({"message": "Email resent successfully!"}, status=200)

    except Exception as e:
        log.status = "FAILED"
        log.error  = str(e)[:200]
        log.save()
        return Response({"error": f"Failed to resend: {str(e)}"}, status=500)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def manual_invite_view(request, candidate_id):
    """
    candidate_id here is a ResumeScreening id (not CandidateResume),
    since an interview/invite is for a specific (resume, job) screening.
    """
    if request.user.role not in ["HR", "JUNIOR_HR", "ADMIN"]:
        raise PermissionDenied("Only HR or Admin can send manual invites.")

    try:
        screening = ResumeScreening.objects.select_related("resume", "job_request").get(pk=candidate_id)
    except ResumeScreening.DoesNotExist:
        return Response({"error": "Screening record not found"}, status=404)

    try:
        interview = Interview.objects.get(candidate=screening)
    except Interview.DoesNotExist:
        return Response({"error": "No interview scheduled yet. HR must schedule one first."}, status=400)

    candidate_resume = screening.resume
    if not candidate_resume.email:
        return Response({"error": "Candidate has no email on file."}, status=400)

    try:
        send_interview_email(
            candidate_email = candidate_resume.email,
            candidate_name  = candidate_resume.candidate_name or "Candidate",
            job_title       = screening.job_request.title if screening.job_request else "Open Position",
            interview_date  = str(interview.interview_date),
            interview_time  = str(interview.interview_time),
            mode            = interview.mode,
            meeting_link    = interview.meeting_link,
            location        = interview.location,
            notes           = interview.feedback,
        )
        return Response({"message": "Manual invite sent successfully!"}, status=200)

    except Exception as e:
        return Response({"error": f"Failed to send invite: {str(e)}"}, status=500)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def ingest_local_folder(request):
    """
    Ingests a local folder into the POOL only — no job, no scoring.
    Matches the new bulk_upload_resumes behavior.
    """
    if request.user.role != "RECRUITER":
        raise PermissionDenied("Only recruiters can ingest folders.")

    folder_path = request.data.get("folder_path")
    if not folder_path:
        return Response({"error": "folder_path is required."}, status=400)

    if not os.path.isdir(folder_path):
        return Response({"error": f"Folder '{folder_path}' does not exist."}, status=400)

    def process_in_background():
        from .services.rag_store import index_resume

        base_dir  = Path(folder_path)
        all_files = (
            list(base_dir.rglob('*.pdf')) +
            list(base_dir.rglob('*.jpg')) +
            list(base_dir.rglob('*.jpeg')) +
            list(base_dir.rglob('*.png'))
        )
        print(f"[LOCAL INGEST] Found {len(all_files)} files in {folder_path}")

        for i, file_path in enumerate(all_files):
            filename = file_path.name
            try:
                resume_text = extract_text_from_file(str(file_path))
                if not resume_text or len(resume_text.strip()) < 30:
                    print(f"[LOCAL INGEST] Skipping {filename}: unreadable")
                    continue

                pii = extract_pii(resume_text)
                redacted_text = redact_pii(resume_text)

                resume = CandidateResume.objects.create(
                    uploaded_by    = request.user,
                    resume_url     = "",
                    resume_text    = resume_text,
                    original_filename = filename,
                    candidate_name = pii["name"] or filename.rsplit('.', 1)[0].replace('_', ' ').title(),
                    email          = pii["email"],
                    phone          = pii["phone"],
                    linkedin_url   = pii["linkedin_url"],
                    github_url     = pii["github_url"],
                )

                chroma_id = index_resume(
                    resume_id=resume.id,
                    redacted_text=redacted_text,
                    job_request_id=None,
                    original_filename=filename,
                )
                if chroma_id:
                    resume.chroma_id = chroma_id
                    resume.save(update_fields=["chroma_id"])

                print(f"[LOCAL INGEST] [{i+1}/{len(all_files)}] Added to pool: {filename}")

            except Exception as e:
                print(f"[LOCAL INGEST] Error processing {filename}: {e}")

    thread = threading.Thread(target=process_in_background)
    thread.daemon = True
    thread.start()
    return Response({"message": f"Pool ingestion started in background for folder: {folder_path}"})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def recruiter_analytics(request):
    """
    Rebuilt to query through ResumeScreening, since score/shortlist
    status no longer live on CandidateResume directly.
    """
    if request.user.role != "RECRUITER":
        raise PermissionDenied("Only recruiters can view analytics.")

    screenings = ResumeScreening.objects.filter(resume__uploaded_by=request.user).select_related("job_request", "resume")

    buckets = {"0-20": 0, "20-40": 0, "40-60": 0, "60-80": 0, "80-100": 0}
    for s in screenings:
        score = s.llm_score or 0
        if score < 20:   buckets["0-20"] += 1
        elif score < 40: buckets["20-40"] += 1
        elif score < 60: buckets["40-60"] += 1
        elif score < 80: buckets["60-80"] += 1
        else:            buckets["80-100"] += 1

    job_stats = []
    for job in JobRequest.objects.filter(status="APPROVED"):
        job_screenings = screenings.filter(job_request=job)
        total = job_screenings.count()
        if total == 0:
            continue
        shortlisted = job_screenings.filter(is_shortlisted=True).count()
        job_stats.append({
            "title": job.title,
            "total": total,
            "shortlisted": shortlisted,
            "rate": round((shortlisted / total) * 100, 1)
        })

    skill_counter = Counter()
    for s in screenings:
        skills = s.matched_skills if isinstance(s.matched_skills, list) else []
        for skill in skills:
            if skill:
                skill_counter[skill.lower().title()] += 1
    top_skills = [{"skill": k, "count": v} for k, v in skill_counter.most_common(10)]

    total_screenings = screenings.count()
    total_shortlisted = screenings.filter(is_shortlisted=True).count()

    return Response({
        "score_distribution": buckets,
        "job_stats": job_stats,
        "top_skills": top_skills,
        "total_uploaded": total_screenings,
        "total_shortlisted": total_shortlisted,
        "shortlist_rate": round((total_shortlisted / total_screenings * 100), 1) if total_screenings > 0 else 0,
    })
