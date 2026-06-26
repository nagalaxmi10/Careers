from django.db import models
from django.conf import settings
from jobs.models import JobRequest


class CandidateResume(models.Model):
    """
    The resume pool. A resume exists here independent of any job.
    No score, no shortlist status, no job_request — those now live
    on ResumeScreening, since one resume can be screened against
    many jobs over time.
    """
    uploaded_by   = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="uploaded_resumes")
    resume_file   = models.FileField(upload_to="resumes/", blank=True, null=True)
    resume_url    = models.URLField(max_length=500, blank=True)
    original_filename = models.CharField(max_length=255, blank=True, null=True)

    candidate_name = models.CharField(max_length=255, blank=True)
    email          = models.EmailField(blank=True)
    phone          = models.CharField(max_length=20, blank=True)
    linkedin_url   = models.URLField(max_length=500, blank=True)
    github_url     = models.URLField(max_length=500, blank=True)

    skills      = models.JSONField(default=list)   # general skills, extracted once at upload
    experience  = models.FloatField(default=0)
    resume_text = models.TextField(blank=True)
    chroma_id   = models.CharField(max_length=64, blank=True, null=True)

    uploaded_at = models.DateTimeField(auto_now_add=True)
    pushed_to_sharepoint = models.BooleanField(default=False)

    def __str__(self):
        return self.candidate_name or "Unknown Candidate"


class ResumeScreening(models.Model):
    """
    One screening attempt: this resume, against this job, at this
    threshold, with this result. A resume can have many of these
    (one per job it's been screened against). This replaces BOTH
    the score/shortlist fields that used to live on CandidateResume
    AND the old ShortlistedCandidate model — status now lives here,
    since shortlisting is inherently per (resume, job), not per resume.
    """
    STATUS_CHOICES = [
        ("PENDING", "Pending"),
        ("INTERVIEW_SCHEDULED", "Interview Scheduled"),
        ("ROUND_1", "Round 1"),
        ("ROUND_2", "Round 2"),
        ("SELECTED", "Selected"),
        ("REJECTED", "Rejected"),
    ]

    resume       = models.ForeignKey(CandidateResume, on_delete=models.CASCADE, related_name="screenings")
    job_request  = models.ForeignKey(JobRequest, on_delete=models.CASCADE, related_name="screenings")
    screened_by  = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)

    llm_score       = models.FloatField(default=0)
    threshold_used  = models.FloatField(default=70.0)
    is_shortlisted  = models.BooleanField(default=False)
    fit_summary     = models.TextField(blank=True)
    matched_skills  = models.JSONField(default=list)

    status   = models.CharField(max_length=50, choices=STATUS_CHOICES, default="PENDING")
    remarks  = models.TextField(blank=True)

    screened_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("resume", "job_request")
        ordering = ["-screened_at"]

    def __str__(self):
        return f"{self.resume.candidate_name} → {self.job_request.title} ({self.llm_score}%)"


class Interview(models.Model):
    MODE_CHOICES = [
        ("ONLINE", "Online"),
        ("OFFLINE", "Offline"),
    ]
    candidate = models.ForeignKey(
        ResumeScreening,
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
        return f"{self.candidate.resume.candidate_name} - {self.interview_date}"


class EmailLog(models.Model):
    STATUS_CHOICES = [
        ("SENT", "Sent"),
        ("DUMMY", "Dummy"),
        ("FAILED", "Failed"),
    ]
    to = models.EmailField(blank=True, default="")
    subject = models.CharField(max_length=255)
    body = models.TextField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES)
    error = models.TextField(blank=True)
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-sent_at"]

    def __str__(self):
        return f"{self.to} — {self.subject}"


class ResumeProcessingLog(models.Model):
    STATUS_CHOICES = [
        ("SUCCESS",      "Success"),
        ("OLLAMA_ERROR", "Ollama Error"),
        ("ERROR",        "Error"),
        ("SKIPPED",      "Skipped"),
    ]

    filename        = models.CharField(max_length=255, blank=True)
    uploaded_by     = models.CharField(max_length=100, blank=True)
    processed_at    = models.DateTimeField(auto_now_add=True)

    ocr_method      = models.CharField(max_length=50, blank=True)
    ollama_model    = models.CharField(max_length=50, blank=True)
    ollama_raw_output = models.TextField(blank=True)

    extracted_name      = models.CharField(max_length=255, blank=True)
    extracted_email     = models.CharField(max_length=255, blank=True)
    extracted_phone     = models.CharField(max_length=50,  blank=True)
    extracted_experience = models.FloatField(default=0.0)
    extracted_skills    = models.JSONField(default=list)
    llm_score           = models.IntegerField(default=0)

    status          = models.CharField(max_length=20, choices=STATUS_CHOICES, default="SUCCESS")
    error_message   = models.TextField(blank=True)

    class Meta:
        ordering = ["-processed_at"]
        verbose_name = "Resume Processing Log"
        verbose_name_plural = "Resume Processing Logs"

    def __str__(self):
        return f"{self.filename} — {self.status} @ {self.processed_at:%Y-%m-%d %H:%M}"