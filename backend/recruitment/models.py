from django.db import models
from django.conf import settings
from jobs.models import JobRequest

# In recruitment/models.py
class CandidateResume(models.Model):
    job_request = models.ForeignKey(JobRequest, on_delete=models.CASCADE, related_name="resumes")
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="uploaded_resumes")
    resume_file = models.FileField(upload_to="resumes/", blank=True, null=True)
    resume_url = models.URLField(max_length=500, blank=True, help_text="Direct link to the candidate's resume")
 
    candidate_name = models.CharField(max_length=255, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
 
    # ✅ NEW — extracted via regex from the ORIGINAL (unredacted) resume text,
    # same path as name/email/phone. Never sent to the LLM or embedded.
    linkedin_url = models.URLField(max_length=500, blank=True)
    github_url = models.URLField(max_length=500, blank=True)
 
    skills = models.JSONField(default=list)
    experience = models.FloatField(default=0)
    resume_text = models.TextField(blank=True)
    match_percentage = models.FloatField(default=0)
    is_shortlisted = models.BooleanField(default=False)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    original_filename = models.CharField(max_length=255, blank=True, null=True)
    fit_summary = models.TextField(blank=True)
 
    # ✅ NEW — links this SQLite row to its vector in ChromaDB, so a resume's
    # embedding can be found/updated/deleted in sync with this record.
    chroma_id = models.CharField(max_length=64, blank=True, null=True)
 
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
# ── ADD THIS TO recruitment/models.py ────────────────────────────────────────

class ResumeProcessingLog(models.Model):
    STATUS_CHOICES = [
        ("SUCCESS",      "Success"),
        ("OLLAMA_ERROR", "Ollama Error"),
        ("ERROR",        "Error"),
        ("SKIPPED",      "Skipped"),
    ]

    # Upload info
    filename        = models.CharField(max_length=255, blank=True)
    uploaded_by     = models.CharField(max_length=100, blank=True)
    processed_at    = models.DateTimeField(auto_now_add=True)

    # OCR / Extraction info
    ocr_method      = models.CharField(max_length=50, blank=True)   # pypdf2, llava_image, etc.
    ollama_model    = models.CharField(max_length=50, blank=True)
    ollama_raw_output = models.TextField(blank=True)                 # full raw Ollama response

    # Extracted fields
    extracted_name      = models.CharField(max_length=255, blank=True)
    extracted_email     = models.CharField(max_length=255, blank=True)
    extracted_phone     = models.CharField(max_length=50,  blank=True)
    extracted_experience = models.FloatField(default=0.0)
    extracted_skills    = models.JSONField(default=list)
    llm_score           = models.IntegerField(default=0)

    # Status
    status          = models.CharField(max_length=20, choices=STATUS_CHOICES, default="SUCCESS")
    error_message   = models.TextField(blank=True)

    class Meta:
        ordering = ["-processed_at"]
        verbose_name = "Resume Processing Log"
        verbose_name_plural = "Resume Processing Logs"

    def __str__(self):
        return f"{self.filename} — {self.status} @ {self.processed_at:%Y-%m-%d %H:%M}"