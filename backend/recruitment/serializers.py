from rest_framework import serializers
from .models import CandidateResume, ResumeScreening, EmailLog, Interview
from jobs.models import JobRequest


class JobRequestMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = JobRequest
        fields = ["id", "title", "department", "experience_required", "vacancies", "status", "skills_required"]


class CandidateResumeSerializer(serializers.ModelSerializer):
    """
    Represents a resume in the POOL — no job, no score, no shortlist
    status. Those now live on ResumeScreening, exposed separately via
    `screenings` below, since one resume can have many.
    """
    uploaded_by_email = serializers.EmailField(source="uploaded_by.email", read_only=True)
    screenings = serializers.SerializerMethodField()

    class Meta:
        model = CandidateResume
        fields = [
            "id",
            "uploaded_by", "uploaded_by_email",
            "resume_url", "original_filename",
            "candidate_name", "email", "phone",
            "linkedin_url", "github_url",
            "skills", "experience", "resume_text",
            "uploaded_at", "screenings",
        ]
        read_only_fields = [
            "uploaded_by", "uploaded_at", "candidate_name", "email", "phone",
            "linkedin_url", "github_url", "skills", "experience", "resume_text",
            # resume_url is NOT read_only — frontend sends it for URL submissions
        ]

    def get_screenings(self, obj):
        # Lightweight summary of every job this resume has been screened
        # against, so the frontend can show "this candidate scored X% for
        # job Y" without a separate request per resume.
        return [
            {
                "job_request_id": s.job_request_id,
                "job_title": s.job_request.title,
                "llm_score": s.llm_score,
                "is_shortlisted": s.is_shortlisted,
                "status": s.status,
            }
            for s in obj.screenings.select_related("job_request").all()
        ]


class ResumeScreeningSerializer(serializers.ModelSerializer):
    """
    Replaces the old ShortlistedCandidateSerializer. One screening =
    one (resume, job_request) pair with its own score/status/fit_summary.
    """
    candidate_details = CandidateResumeSerializer(source="resume", read_only=True)
    job_request_details = JobRequestMiniSerializer(source="job_request", read_only=True)

    class Meta:
        model = ResumeScreening
        fields = [
            "id", "resume", "candidate_details",
            "job_request", "job_request_details",
            "llm_score", "threshold_used", "is_shortlisted",
            "fit_summary", "matched_skills",
            "status", "remarks", "screened_at",
        ]
        read_only_fields = [
            "llm_score", "threshold_used", "is_shortlisted",
            "fit_summary", "matched_skills", "screened_at",
        ]


class InterviewSerializer(serializers.ModelSerializer):
    candidate_details = ResumeScreeningSerializer(source="candidate", read_only=True)
    interviewer_email = serializers.EmailField(source="interviewer.email", read_only=True)
    scheduled_by_email = serializers.EmailField(source="scheduled_by.email", read_only=True)

    class Meta:
        model = Interview
        fields = [
            "id", "candidate", "candidate_details",
            "interviewer", "interviewer_email",
            "scheduled_by", "scheduled_by_email",
            "interview_date", "interview_time",
            "mode", "meeting_link", "location",
            "feedback", "created_at"
        ]
        read_only_fields = ["scheduled_by", "created_at"]


class EmailLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmailLog
        fields = ["id", "to", "subject", "body", "status", "error", "sent_at"]