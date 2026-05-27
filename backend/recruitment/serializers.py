from rest_framework import serializers
from .models import CandidateResume, EmailLog, ShortlistedCandidate, Interview
from jobs.models import JobRequest


class JobRequestMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = JobRequest
        fields = ["id", "title", "department", "experience_required", "vacancies", "status", "skills_required"]


class CandidateResumeSerializer(serializers.ModelSerializer):
    job_request_details = JobRequestMiniSerializer(source="job_request", read_only=True)
    uploaded_by_email = serializers.EmailField(source="uploaded_by.email", read_only=True)

    class Meta:
        model = CandidateResume
        fields = [
            "id", "job_request", "job_request_details",
            "uploaded_by", "uploaded_by_email",
            "resume", "candidate_name", "email", "phone",
            "skills", "experience", "resume_text",
            "match_percentage", "is_shortlisted", "uploaded_at"
        ]
        read_only_fields = [
            "uploaded_by", "match_percentage", "is_shortlisted",
            "uploaded_at", "candidate_name", "email", "phone",
            "skills", "experience", "resume_text"
        ]


class ShortlistedCandidateSerializer(serializers.ModelSerializer):
    candidate_details = CandidateResumeSerializer(source="candidate", read_only=True)

    class Meta:
        model = ShortlistedCandidate
        fields = ["id", "candidate", "candidate_details", "status", "remarks", "shortlisted_at"]
        read_only_fields = ["shortlisted_at"]


class InterviewSerializer(serializers.ModelSerializer):
    candidate_details = ShortlistedCandidateSerializer(source="candidate", read_only=True)
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