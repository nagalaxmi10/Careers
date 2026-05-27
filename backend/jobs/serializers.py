from rest_framework import serializers
from .models import JobRequest

class JobRequestSerializer(serializers.ModelSerializer):
    employee_email = serializers.SerializerMethodField()
    resume_count = serializers.SerializerMethodField()
    shortlisted_count = serializers.SerializerMethodField()

    class Meta:
        model = JobRequest
        fields = [
            "id", "employee", "employee_email",
            "title", "description",
            "key_responsibilities", "basic_qualifications", "preferred_qualifications",
            "skills_required", "department", "experience_required", "vacancies",
            "status", "created_at", "updated_at",
            "resume_count", "shortlisted_count"
        ]
        read_only_fields = ["employee", "status", "created_at", "updated_at"]

    def get_employee_email(self, obj):
        return obj.employee.email if obj.employee else None

    def get_resume_count(self, obj):
        return obj.resumes.count()

    def get_shortlisted_count(self, obj):
        return obj.resumes.filter(is_shortlisted=True).count()

class JobStatusUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = JobRequest
        fields = ["status"]

class JobRequestEditSerializer(serializers.ModelSerializer):
    """Employee can only edit PENDING requests — status stays read-only."""
    class Meta:
        model = JobRequest
        fields = [
            "title", "description",
            "key_responsibilities", "basic_qualifications", "preferred_qualifications",
            "skills_required", "department", "experience_required", "vacancies"
        ]