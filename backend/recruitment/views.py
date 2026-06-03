from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.decorators import api_view, permission_classes
from django.http import FileResponse
import os
from .models import CandidateResume, ShortlistedCandidate, Interview, EmailLog
from .serializers import (
    CandidateResumeSerializer, 
    ShortlistedCandidateSerializer, 
    InterviewSerializer, 
    EmailLogSerializer
)
from jobs.models import JobRequest
from .services.resume_matcher import match_resume
from .services.resume_extractor import extract_text_from_file, extract_with_ollama
from .email_service import send_interview_email
from .services.resume_extractor import extract_text_from_file, extract_with_ollama, _is_valid_name

def _to_list(value):
    """Ensure skills is always stored as a list, never a string."""
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        return [s.strip() for s in value.split(",") if s.strip()]
    return []


class CandidateResumeViewSet(ModelViewSet):
    serializer_class = CandidateResumeSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get_queryset(self):
        user = self.request.user
        
        # ✅ Always start with all objects, then filter
        queryset = CandidateResume.objects.all()
        
        # ✅ Filter by job_request if provided in query params
        job_request_id = self.request.query_params.get('job_request')
        if job_request_id:
            queryset = queryset.filter(job_request_id=job_request_id)
        
        # Then apply role-based access
        if user.role in ["ADMIN", "RECRUITER"]:
            return queryset
        if user.role in ["HR", "JUNIOR_HR"]:
            return queryset.filter(is_shortlisted=True)
        return CandidateResume.objects.none()

    def perform_create(self, serializer):
        user = self.request.user
        if user.role != "RECRUITER":
            raise PermissionDenied("Only recruiters can upload resumes.")

        job_request_id = self.request.data.get("job_request")
        try:
            job_request = JobRequest.objects.get(id=job_request_id, status="APPROVED")
        except JobRequest.DoesNotExist:
            raise PermissionDenied("Approved job request not found.")

        resume = serializer.save(uploaded_by=user, job_request=job_request)

        file_path = resume.resume.path
        resume_text = extract_text_from_file(file_path)
        print("=== EXTRACTED TEXT LENGTH ===", len(resume_text))
        print("=== EXTRACTED TEXT PREVIEW ===", resume_text[:300])
        
        # ✅ If no text extracted, it's probably an image-based PDF
        if not resume_text or len(resume_text.strip()) < 30:
            resume.candidate_name = "Unreadable Resume"
            resume.resume_text = resume_text or ""
            resume.save()
            return  # Skip Ollama entirely

        required_skills = job_request.skills_list()
        from .services.rag_store import retrieve_job_context, retrieve_past_matches, index_past_match, index_job_request
        job_context  = retrieve_job_context(job_request, resume_text)
        past_matches = retrieve_past_matches(resume_text, job_request.title)
        result = extract_with_ollama(resume_text, required_skills, job_context, past_matches)

        extracted_skills = _to_list(result["skills"])
        keyword_score = match_resume(extracted_skills, required_skills)
        llm_score = result.get("llm_score", 0)
        
        # ── GROUNDED HYBRID SCORING LOGIC ──
        # 1. If there are zero keyword matches, do NOT let the LLM push the score above 40%.
        # This prevents "Verb Matching" hallucinations (e.g., IT Support vs Chatbot Support).
        if keyword_score == 0:
            computed_score = min(float(llm_score), 40.0)
            
        # 2. If keyword score is low (1-30%), average it with the LLM, but cap at 65% 
        # to prevent the LLM from over-inflating a weak match.
        elif keyword_score <= 30:
            computed_score = min((keyword_score + llm_score) / 2.0, 65.0)
            
        # 3. If keyword score is strong (>30%), trust the average—both systems agree.
        else:
            computed_score = (keyword_score + llm_score) / 2.0
        # ✅ Smart name fallback
        extracted_name = result.get("name", "")
        if not extracted_name or not _is_valid_name(extracted_name):
            if result.get("email") and "@" in result["email"]:
                extracted_name = result["email"].split("@")[0].replace(".", " ").replace("_", " ").title()
            else:
                extracted_name = ""

        # ✅ Ensure experience is always a valid number
        experience = result.get("experience", 0.0)
        try:
            experience = float(experience)
            if experience < 0:
                experience = 0.0
        except (TypeError, ValueError):
            experience = 0.0

        resume.resume_text      = resume_text
        resume.candidate_name   = extracted_name
        resume.email            = result.get("email", "")
        resume.phone            = result.get("phone", "")
        resume.experience       = experience
        resume.skills           = extracted_skills
        resume.match_percentage = computed_score
        resume.is_shortlisted   = computed_score >= 65.0
        resume.save()

        resume.fit_summary = result.get("fit_summary", "")
        resume.save()

        if resume.is_shortlisted:
            ShortlistedCandidate.objects.get_or_create(candidate=resume)
            index_past_match(resume.id, resume_text, job_request.title, extracted_skills, computed_score, resume.fit_summary)

        index_job_request(job_request)

    def perform_destroy(self, instance):
        if self.request.user.role not in ["ADMIN", "RECRUITER"]:
            raise PermissionDenied("Permission denied.")
        instance.delete()


class ShortlistedCandidateViewSet(ModelViewSet):
    serializer_class = ShortlistedCandidateSerializer
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
    serializer_class = InterviewSerializer
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
        # ✅ FIX: Allow both ADMIN and HR to delete/cancel interviews
        if self.request.user.role not in ["ADMIN", "HR"]:
            raise PermissionDenied("Only HR or Admin can cancel interviews.")
        instance.delete()
    
    def perform_create(self, serializer):
        if self.request.user.role != "HR":
            raise PermissionDenied("Only HR can schedule interviews.")

        # 1. Save the interview
        interview = serializer.save(scheduled_by=self.request.user)

        # 2. Debug print to confirm this code is running
        print("=== INTERVIEW CREATED, ATTEMPTING TO SEND EMAIL ===")

        try:
            # 3. Get candidate details
            candidate_resume = interview.candidate.candidate
            job_title = candidate_resume.job_request.title

            # 4. Send the email (this saves to EmailLog automatically)
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
            # If something goes wrong, print it to the terminal instead of crashing
            print(f"!!! ERROR SENDING EMAIL: {e} !!!")


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def email_log_view(request):
    """Returns the email log. Accessible by HR, Junior HR, and Admin."""
    if request.user.role not in ["HR", "JUNIOR_HR", "ADMIN"]:
        return Response({"error": "Access denied."}, status=403)
    
    queryset = EmailLog.objects.all()
    serializer = EmailLogSerializer(queryset, many=True)
    return Response(serializer.data)

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def serve_resume(request, pk):
    """Serve the original resume PDF. Only accessible by Admin/HR/Recruiter."""
    if request.user.role not in ["ADMIN", "HR", "JUNIOR_HR", "RECRUITER"]:
        raise PermissionDenied("Access denied.")
    
    try:
        resume = CandidateResume.objects.get(pk=pk)
        file_path = resume.resume.path
        
        if os.path.exists(file_path):
            return FileResponse(open(file_path, 'rb'), content_type='application/pdf')
        return Response({"error": "File not found on disk"}, status=404)
        
    except CandidateResume.DoesNotExist:
        return Response({"error": "Resume not found"}, status=404)
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def resend_email_view(request, log_id):
    """Retry sending a failed email directly from the Email Log."""
    if request.user.role not in ["HR", "JUNIOR_HR", "ADMIN"]:
        raise PermissionDenied("Only HR or Admin can resend emails.")
    
    try:
        log = EmailLog.objects.get(pk=log_id)
    except EmailLog.DoesNotExist:
        return Response({"error": "Email log not found"}, status=404)
    
    # Don't retry if it already succeeded
    if log.status == "SENT":
        return Response({"message": "Email was already sent successfully."}, status=400)

    try:
        from django.core.mail import send_mail
        send_mail(
            subject=log.subject,
            message=log.body,
            from_email=None, # Uses DEFAULT_FROM_EMAIL
            recipient_list=[log.to],
            fail_silently=False,
            html_message=log.body # Send as HTML just in case
        )
        
        # Update the log status to SENT
        log.status = "SENT"
        log.error = ""
        log.save()
        
        return Response({"message": "Email resent successfully!"}, status=200)
    
    except Exception as e:
        # Update the log with the new error message
        log.status = "FAILED"
        log.error = str(e)[:200] # Truncate long errors
        log.save()
        
        return Response({"error": f"Failed to resend: {str(e)}"}, status=500)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def manual_invite_view(request, candidate_id):
    """Manually send an interview invite to a shortlisted candidate."""
    if request.user.role not in ["HR", "JUNIOR_HR", "ADMIN"]:
        raise PermissionDenied("Only HR or Admin can send manual invites.")
    
    try:
        # Get the candidate resume
        candidate_resume = CandidateResume.objects.get(pk=candidate_id)
    except CandidateResume.DoesNotExist:
        return Response({"error": "Candidate not found"}, status=404)
    
    # Check if an interview is actually scheduled for them
    try:
        interview = Interview.objects.get(candidate__candidate=candidate_resume)
    except Interview.DoesNotExist:
        return Response(
            {"error": "No interview scheduled for this candidate yet. HR must schedule one first."}, 
            status=400
        )
    
    # If they don't have an email, we can't send it
    if not candidate_resume.email:
        return Response({"error": "Candidate does not have an email address on file."}, status=400)

    try:
        # Re-use the exact same email sending logic from the InterviewViewSet
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