from django.db import models
from django.conf import settings
from jobs.models import JobRequest

class CandidateResume(models.Model):
    job_request = models.ForeignKey(
        JobRequest, on_delete=models.CASCADE, related_name="resumes"
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="uploaded_resumes"
    )
    resume = models.FileField(upload_to="resumes/")
    candidate_name = models.CharField(max_length=255, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
    skills = models.JSONField(default=list)
    experience = models.FloatField(default=0)
    resume_text = models.TextField(blank=True)
    match_percentage = models.FloatField(default=0)
    is_shortlisted = models.BooleanField(default=False)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    fit_summary = models.TextField(blank=True)
    def __str__(self):
        return self.candidate_name or "Unknown Candidate"


class ShortlistedCandidate(models.Model):
    STATUS_CHOICES = [
        ("PENDING", "Pending"),
        ("INTERVIEW_SCHEDULED", "Interview Scheduled"),
        ("ROUND_1", "Round 1"),
        ("ROUND_2", "Round 2"),
        ("SELECTED", "Selected"),
        ("REJECTED", "Rejected"),
    ]
    candidate = models.OneToOneField(
        CandidateResume,
        on_delete=models.CASCADE,
        related_name="shortlisted"
    )
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default="PENDING")
    remarks = models.TextField(blank=True)
    shortlisted_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.candidate.candidate_name or "Unknown"


class Interview(models.Model):
    MODE_CHOICES = [
        ("ONLINE", "Online"),
        ("OFFLINE", "Offline"),
    ]
    candidate = models.ForeignKey(
        ShortlistedCandidate,
        on_delete=models.CASCADE,
        related_name="interviews"
    )
    interviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="interviews_taken"
    )
    scheduled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="scheduled_interviews"
    )
    interview_date = models.DateField()
    interview_time = models.TimeField()
    mode = models.CharField(max_length=20, choices=MODE_CHOICES, default="ONLINE")
    meeting_link = models.URLField(blank=True, null=True)
    location = models.CharField(max_length=255, blank=True, null=True)
    feedback = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.candidate.candidate.candidate_name} - {self.interview_date}"
class EmailLog(models.Model):
    STATUS_CHOICES = [
        ("SENT", "Sent"),
        ("DUMMY", "Dummy"),
        ("FAILED", "Failed"),
    ]
    to = models.EmailField(blank=True, default="")  # <-- Added blank=True, default=""
    subject = models.CharField(max_length=255)
    body = models.TextField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES)
    error = models.TextField(blank=True)
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-sent_at"]

    def __str__(self):
        return f"{self.to} — {self.subject}"