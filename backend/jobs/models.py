from django.db import models
from django.conf import settings

class JobRequest(models.Model):
    STATUS_CHOICES = [
        ("PENDING", "Pending"),
        ("APPROVED", "Approved"),
        ("REJECTED", "Rejected"),
    ]
    employee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="job_requests"
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    key_responsibilities = models.TextField(blank=True)
    basic_qualifications = models.TextField(blank=True)
    preferred_qualifications = models.TextField(blank=True)
    skills_required = models.TextField(
        help_text="Comma separated e.g. Python, Django, React",
        blank=True
    )
    department = models.CharField(max_length=100, blank=True)
    experience_required = models.FloatField(default=0)
    vacancies = models.IntegerField(default=1)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="PENDING")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def skills_list(self):
        return [s.strip().lower() for s in self.skills_required.split(",") if s.strip()]

    def __str__(self):
        return self.title