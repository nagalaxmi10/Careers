from datetime import datetime

from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.decorators import api_view, permission_classes
from django.shortcuts import redirect
from rest_framework.views import APIView
from rest_framework import status as drf_status
from .services.sharepoint_service import (
    get_all_filenames, download_resume,
    post_screening_result, save_pdf_to_tempfile
)
import threading
from pathlib import Path
import os
import requests
from io import BytesIO
from .models import CandidateResume, ShortlistedCandidate, Interview, EmailLog
from .serializers import (
    CandidateResumeSerializer,
    ShortlistedCandidateSerializer,
    InterviewSerializer,
    EmailLogSerializer
)
from jobs.models import JobRequest
from .services.resume_matcher import match_resume
from .services.resume_extractor import extract_text_from_file, extract_with_ollama, _is_valid_name
from .email_service import send_interview_email


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

    If LLM didn't score (0), fall back to keyword + experience only.
    """
    if llm_score == 0:
        # No LLM score — trust keyword score, factor in experience lightly
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


def _process_resume(resume, resume_text, job_request, filename="", uploaded_by="", result=None):
    """Shared logic: score and save a CandidateResume instance."""
    required_skills = job_request.skills_list() or []

    if result is None:
        result = extract_with_ollama(
            resume_text, required_skills,
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

    keyword_score    = match_resume(extracted_skills, required_skills)
    llm_score        = result.get("llm_score", 0)

    try:
        experience = float(result.get("experience", 0.0) or 0.0)
        if experience < 0:
            experience = 0.0
    except (TypeError, ValueError):
        experience = 0.0

    exp_score     = _experience_score(experience, getattr(job_request, "experience_required", 0))
    computed_score = _compute_score(keyword_score, llm_score, exp_score)

    print(f"=== FINAL SCORING ===")
    print(f"Keyword Score:    {keyword_score}")
    print(f"LLM Score:        {llm_score}")
    print(f"Experience Score: {exp_score}")
    print(f"Final Score:      {computed_score}")

    extracted_name = result.get("name", "")
    if not extracted_name or not _is_valid_name(extracted_name):
        if result.get("email") and "@" in result["email"]:
            extracted_name = result["email"].split("@")[0].replace(".", " ").replace("_", " ").title()
        elif filename:
            extracted_name = filename.rsplit('.', 1)[0].replace('_', ' ').replace('-', ' ').title()
        else:
            extracted_name = ""

    resume.resume_text      = resume_text
    resume.candidate_name   = extracted_name
    resume.email            = result.get("email", "")
    resume.phone            = result.get("phone", "")
    resume.experience       = experience
    resume.skills           = extracted_skills
    resume.match_percentage = computed_score
    resume.is_shortlisted   = computed_score >= 65.0
    resume.fit_summary      = result.get("fit_summary", "")
    resume.save()

    if resume.is_shortlisted:
        ShortlistedCandidate.objects.get_or_create(candidate=resume)

    return computed_score


class CandidateResumeViewSet(ModelViewSet):
    serializer_class = CandidateResumeSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        user = self.request.user
        queryset = CandidateResume.objects.all()

        job_request_id = self.request.query_params.get('job_request')
        if job_request_id:
            queryset = queryset.filter(job_request_id=job_request_id)

        if user.role in ["ADMIN", "RECRUITER"]:
            return queryset
        if user.role in ["HR", "JUNIOR_HR"]:
            return queryset.filter(is_shortlisted=True)
        return CandidateResume.objects.none()

    def perform_create(self, serializer):
        """Handles Single URL Submission from the frontend."""
        user = self.request.user
        if user.role != "RECRUITER":
            raise PermissionDenied("Only recruiters can add resumes.")

        job_request_id = self.request.data.get("job_request")
        resume_url     = self.request.data.get("resume_url")

        if not resume_url:
            raise PermissionDenied("Resume URL is required.")

        try:
            job_request = JobRequest.objects.get(id=job_request_id, status="APPROVED")
        except JobRequest.DoesNotExist:
            raise PermissionDenied("Approved job request not found.")

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
            resume = serializer.save(uploaded_by=user, job_request=job_request, resume_url=resume_url)
            resume.candidate_name = "Failed to fetch URL"
            resume.save()
            return

        resume      = serializer.save(uploaded_by=user, job_request=job_request, resume_url=resume_url)
        resume_text = extract_text_from_file(in_memory_pdf)

        if not resume_text or len(resume_text.strip()) < 30:
            resume.candidate_name = "Unreadable Resume / Empty PDF"
            resume.resume_text    = resume_text or ""
            resume.save()
            return

        from .services.rag_store import retrieve_job_context, retrieve_past_matches, index_past_match, index_job_request
        job_context  = retrieve_job_context(job_request, resume_text)
        past_matches = retrieve_past_matches(resume_text, job_request.title)

        required_skills = job_request.skills_list() or []
        result = extract_with_ollama(
            resume_text, required_skills, job_context, past_matches,
            filename=resume_url, uploaded_by=str(user)
        )

        if not result:
            result = {
                "name": "", "email": "", "phone": "", "experience": 0.0,
                "skills": [], "score": 0.0, "fit_summary": "", "llm_score": 0,
            }

        extracted_skills = _to_list(result["skills"])
        keyword_score    = match_resume(extracted_skills, required_skills)
        llm_score        = result.get("llm_score", 0)

        try:
            experience = float(result.get("experience", 0.0) or 0.0)
            if experience < 0:
                experience = 0.0
        except (TypeError, ValueError):
            experience = 0.0

        exp_score      = _experience_score(experience, getattr(job_request, "experience_required", 0))
        computed_score = _compute_score(keyword_score, llm_score, exp_score)

        print(f"=== FINAL SCORING (perform_create) ===")
        print(f"Keyword Score:    {keyword_score}")
        print(f"LLM Score:        {llm_score}")
        print(f"Experience Score: {exp_score}")
        print(f"Final Score:      {computed_score}")

        extracted_name = result.get("name", "")
        if not extracted_name or not _is_valid_name(extracted_name):
            if result.get("email") and "@" in result["email"]:
                extracted_name = result["email"].split("@")[0].replace(".", " ").replace("_", " ").title()
            else:
                extracted_name = ""

        resume.resume_text      = resume_text
        resume.candidate_name   = extracted_name
        resume.email            = result.get("email", "")
        resume.phone            = result.get("phone", "")
        resume.experience       = experience
        resume.skills           = extracted_skills
        resume.match_percentage = computed_score
        resume.is_shortlisted   = computed_score >= 65.0
        resume.fit_summary      = result.get("fit_summary", "")
        resume.save()

        if resume.is_shortlisted:
            ShortlistedCandidate.objects.get_or_create(candidate=resume)
            index_past_match(resume.id, resume_text, job_request.title, extracted_skills, computed_score, resume.fit_summary)

        index_job_request(job_request)

    def perform_destroy(self, instance):
        if self.request.user.role not in ["ADMIN", "RECRUITER"]:
            raise PermissionDenied("Permission denied.")
        instance.delete()


# ── BULK FILE UPLOAD ENDPOINT ─────────────────────────────────────────────────
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def bulk_upload_resumes(request):
    if request.user.role != "RECRUITER":
        raise PermissionDenied("Only recruiters can upload resumes.")

    job_request_id = request.data.get("job_request")
    files          = request.FILES.getlist("files")

    if not job_request_id or not files:
        return Response({"error": "Job ID and files are required."}, status=400)

    try:
        job_request = JobRequest.objects.get(id=job_request_id, status="APPROVED")
    except JobRequest.DoesNotExist:
        return Response({"error": "Approved job request not found."}, status=404)

    processed_count = 0
    errors = []

    for f in files:
        fname = f.name.lower()
        if not (fname.endswith('.pdf') or fname.endswith('.jpg') or
                fname.endswith('.jpeg') or fname.endswith('.png')):
            errors.append(f"{f.name}: Unsupported file type")
            continue

        try:
            f.seek(0)
            resume_text = extract_text_from_file(f)
        except Exception as e:
            print(f"[BULK UPLOAD] Extraction error on {f.name}: {e}")
            errors.append(f"{f.name}: extraction failed — {str(e)}")
            continue

        try:
            if not resume_text or len(resume_text.strip()) < 30:
                errors.append(f"{f.name}: Unreadable or empty file")
                continue

            required_skills = job_request.skills_list() or []
            result = extract_with_ollama(
                resume_text, required_skills,
                job_context="", past_matches="",
                filename=f.name, uploaded_by=str(request.user)
            )
            if not result:
                result = {
                    "name": "", "email": "", "phone": "", "experience": 0.0,
                    "skills": [], "score": 0.0, "fit_summary": "", "llm_score": 0,
                }

            print(f"[DEBUG] bulk_upload → result skills: {result.get('skills')}")

            f.seek(0)
            resume = CandidateResume.objects.create(
                job_request  = job_request,
                uploaded_by  = request.user,
                resume_url   = "",
                resume_file  = f,
                resume_text  = resume_text
            )

            score = _process_resume(
                resume, resume_text, job_request,
                filename=f.name, uploaded_by=str(request.user),
                result=result,
            )
            print(f"[BULK UPLOAD] Processed {f.name}: {score:.1f}%")
            processed_count += 1

        except Exception as e:
            print(f"[BULK UPLOAD] Error on {f.name}: {e}")
            errors.append(f"{f.name}: {str(e)}")

    return Response({
        "message":   f"Processed {processed_count} of {len(files)} file(s) successfully.",
        "processed": processed_count,
        "errors":    errors
    })


class ShortlistedCandidateViewSet(ModelViewSet):
    serializer_class   = ShortlistedCandidateSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role in ["ADMIN", "RECRUITER", "HR", "JUNIOR_HR"]:
            return ShortlistedCandidate.objects.all().select_related("candidate__job_request")
        return ShortlistedCandidate.objects.none()

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
            return Interview.objects.all().select_related("candidate__candidate")
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
            candidate_resume = interview.candidate.candidate
            job_title        = candidate_resume.job_request.title

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

        # Direct URL (Google Drive, etc.)
        if resume.resume_url and resume.resume_url.startswith(('http://', 'https://')):
            return redirect(resume.resume_url)

        # Uploaded file stored in Django media
        if hasattr(resume, 'resume_file') and resume.resume_file:
            return redirect(resume.resume_file.url)

        # SharePoint-sourced resume — fetch and serve bytes
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
            subject      = log.subject,
            message      = log.body,
            from_email   = None,
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
    if request.user.role not in ["HR", "JUNIOR_HR", "ADMIN"]:
        raise PermissionDenied("Only HR or Admin can send manual invites.")

    try:
        candidate_resume = CandidateResume.objects.get(pk=candidate_id)
    except CandidateResume.DoesNotExist:
        return Response({"error": "Candidate not found"}, status=404)

    try:
        interview = Interview.objects.get(candidate__candidate=candidate_resume)
    except Interview.DoesNotExist:
        return Response({"error": "No interview scheduled yet. HR must schedule one first."}, status=400)

    if not candidate_resume.email:
        return Response({"error": "Candidate has no email on file."}, status=400)

    try:
        send_interview_email(
            candidate_email = candidate_resume.email,
            candidate_name  = candidate_resume.candidate_name or "Candidate",
            job_title       = candidate_resume.job_request.title if candidate_resume.job_request else "Open Position",
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
    if request.user.role != "RECRUITER":
        raise PermissionDenied("Only recruiters can ingest folders.")

    folder_path    = request.data.get("folder_path")
    job_request_id = request.data.get("job_request")

    if not folder_path or not job_request_id:
        return Response({"error": "folder_path and job_request are required."}, status=400)

    try:
        job_request = JobRequest.objects.get(id=job_request_id, status="APPROVED")
    except JobRequest.DoesNotExist:
        return Response({"error": "Approved job request not found."}, status=404)

    if not os.path.isdir(folder_path):
        return Response({"error": f"Folder '{folder_path}' does not exist."}, status=400)

    def process_in_background():
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

                resume = CandidateResume.objects.create(
                    job_request = job_request,
                    uploaded_by = request.user,
                    resume_url  = "",
                    resume_text = resume_text
                )

                score = _process_resume(
                    resume, resume_text, job_request,
                    filename=filename, uploaded_by=str(request.user)
                )
                print(f"[LOCAL INGEST] [{i+1}/{len(all_files)}] Scored {filename}: {score:.1f}%")

            except Exception as e:
                print(f"[LOCAL INGEST] Error processing {filename}: {e}")

    thread = threading.Thread(target=process_in_background)
    thread.daemon = True
    thread.start()
    return Response({"message": f"Processing started in background for folder: {folder_path}"})


class RunSharePointScreeningView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role != "RECRUITER":
            raise PermissionDenied("Only recruiters can run screening.")

        job_request_id = request.data.get("job_request_id")
        if not job_request_id:
            return Response({"error": "job_request_id is required."}, status=drf_status.HTTP_400_BAD_REQUEST)

        try:
            job_request = JobRequest.objects.get(id=job_request_id, status="APPROVED")
        except JobRequest.DoesNotExist:
            return Response({"error": "Approved job request not found."}, status=drf_status.HTTP_404_NOT_FOUND)

        all_filenames = get_all_filenames()
        if not all_filenames:
            return Response({"message": "No PDF files found in SharePoint."})

        already_screened = set(
            CandidateResume.objects.filter(
                job_request=job_request
            ).values_list("original_filename", flat=True)
        )

        pending = [f for f in all_filenames if f not in already_screened]

        if not pending:
            return Response({"message": "All resumes already screened. No new files to process."})

        results         = []
        required_skills = job_request.skills_list() or []

        for filename in pending:
            tmp_path = None
            try:
                pdf_bytes = download_resume(filename)
                if not pdf_bytes:
                    results.append({"file": filename, "error": "Download failed"})
                    continue

                tmp_path    = save_pdf_to_tempfile(pdf_bytes, filename)
                resume_text = extract_text_from_file(tmp_path)

                if not resume_text or len(resume_text.strip()) < 30:
                    results.append({"file": filename, "error": "Unreadable or empty PDF"})
                    continue

                result = extract_with_ollama(
                    resume_text, required_skills,
                    job_context="", past_matches="",
                    filename=filename, uploaded_by=str(request.user)
                )
                if not result:
                    result = {"name": "", "email": "", "phone": "", "experience": 0.0,
                              "skills": [], "score": 0.0, "fit_summary": "", "llm_score": 0}

                skills_list = (
                    result["skills"] if isinstance(result["skills"], list)
                    else [s.strip() for s in result["skills"].split(",") if s.strip()]
                )

                resume = CandidateResume.objects.create(
                    job_request       = job_request,
                    uploaded_by       = request.user,
                    original_filename = filename,
                    resume_text       = resume_text,
                    resume_url        = "",
                )

                score = _process_resume(
                    resume, resume_text, job_request,
                    filename=filename, uploaded_by=str(request.user),
                    result=result,
                )

                post_screening_result(filename, ", ".join(skills_list))  # disabled — overwrites file

                results.append({
                    "file":      filename,
                    "candidate": resume.candidate_name or "Unknown",
                    "score":     score,
                    "status":    "Shortlisted" if score >= 65.0 else "Not Shortlisted",
                })

            except Exception as e:
                print(f"[SharePoint Screening] Error on {filename}: {e}")
                results.append({"file": filename, "error": str(e)})

            finally:
                if tmp_path and os.path.exists(tmp_path):
                    os.remove(tmp_path)

        shortlisted = len([r for r in results if r.get("status") == "Shortlisted"])
        return Response({
            "message": f"Screened {len(results)} resumes. {shortlisted} shortlisted.",
            "results": results,
        })

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def upload_and_screen(request):
    if request.user.role != "RECRUITER":
        raise PermissionDenied("Only recruiters can upload resumes.")

    job_request_id = request.data.get("job_request")
    files = request.FILES.getlist("files")

    if not job_request_id or not files:
        return Response({"error": "Job ID and files are required."}, status=400)

    try:
        job_request = JobRequest.objects.get(id=job_request_id, status="APPROVED")
    except JobRequest.DoesNotExist:
        return Response({"error": "Approved job request not found."}, status=404)

    from .services.sharepoint_service import upload_resume_to_sharepoint

    results = []
    required_skills = job_request.skills_list() or []

    for f in files:
        fname = f.name

        if not fname.lower().endswith(".pdf"):
            results.append({"file": fname, "error": "Only PDF files supported"})
            continue

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        sp_filename = f"{timestamp}_{fname}"

        try:
            f.seek(0)
            file_bytes = f.read()

            resume_text = extract_text_from_file(BytesIO(file_bytes))
            if not resume_text or len(resume_text.strip()) < 30:
                results.append({"file": fname, "error": "Unreadable or empty PDF"})
                continue

            result = extract_with_ollama(
                resume_text, required_skills,
                job_context="", past_matches="",
                filename=fname, uploaded_by=str(request.user)
            )
            if not result:
                result = {"name": "", "email": "", "phone": "", "experience": 0.0,
                          "skills": [], "score": 0.0, "fit_summary": "", "llm_score": 0}

            skills_list = (
                result["skills"] if isinstance(result["skills"], list)
                else [s.strip() for s in result["skills"].split(",") if s.strip()]
            )
            skillset_str = ", ".join(skills_list)

            resume = CandidateResume.objects.create(
                job_request       = job_request,
                uploaded_by       = request.user,
                original_filename = sp_filename,
                resume_url        = "",
                resume_text       = resume_text,
            )

            score = _process_resume(
                resume, resume_text, job_request,
                filename=fname, uploaded_by=str(request.user),
                result=result,
            )

            upload_resume_to_sharepoint(sp_filename, file_bytes, skillset_str)

            results.append({
                "file":      fname,
                "candidate": resume.candidate_name or "Unknown",
                "score":     score,
                "status":    "Shortlisted" if score >= 65.0 else "Not Shortlisted",
            })

        except Exception as e:
            print(f"[Upload & Screen] Error on {fname}: {e}")
            results.append({"file": fname, "error": str(e)})

    shortlisted = len([r for r in results if r.get("status") == "Shortlisted"])
    return Response({
        "message": f"Processed {len(results)} resume(s). {shortlisted} shortlisted.",
        "results": results,
    })
from collections import Counter

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def recruiter_analytics(request):
    if request.user.role != "RECRUITER":
        raise PermissionDenied("Only recruiters can view analytics.")

    resumes = CandidateResume.objects.filter(uploaded_by=request.user)

    # Score distribution
    buckets = {"0-20": 0, "20-40": 0, "40-60": 0, "60-80": 0, "80-100": 0}
    for r in resumes:
        score = r.match_percentage or 0
        if score < 20:   buckets["0-20"] += 1
        elif score < 40: buckets["20-40"] += 1
        elif score < 60: buckets["40-60"] += 1
        elif score < 80: buckets["60-80"] += 1
        else:            buckets["80-100"] += 1

    # Shortlist rate per job
    from jobs.models import JobRequest
    job_stats = []
    for job in JobRequest.objects.filter(status="APPROVED"):
        job_resumes = resumes.filter(job_request=job)
        total = job_resumes.count()
        if total == 0:
            continue
        shortlisted = job_resumes.filter(is_shortlisted=True).count()
        job_stats.append({
            "title": job.title,
            "total": total,
            "shortlisted": shortlisted,
            "rate": round((shortlisted / total) * 100, 1)
        })

    # Top 10 skills
    skill_counter = Counter()
    for r in resumes:
        skills = r.skills if isinstance(r.skills, list) else [s.strip() for s in (r.skills or "").split(",") if s.strip()]
        for skill in skills:
            if skill:
                skill_counter[skill.lower().title()] += 1
    top_skills = [{"skill": k, "count": v} for k, v in skill_counter.most_common(10)]

    return Response({
        "score_distribution": buckets,
        "job_stats": job_stats,
        "top_skills": top_skills,
        "total_uploaded": resumes.count(),
        "total_shortlisted": resumes.filter(is_shortlisted=True).count(),
        "shortlist_rate": round((resumes.filter(is_shortlisted=True).count() / resumes.count() * 100), 1) if resumes.count() > 0 else 0,
    })