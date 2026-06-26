from django.contrib import admin

from .models import (
    CandidateResume,
    ResumeScreening,   # ✅ replaces ShortlistedCandidate
    Interview,
    ResumeProcessingLog,
)


@admin.register(ResumeProcessingLog)
class ResumeProcessingLogAdmin(admin.ModelAdmin):
    list_display  = ("filename", "uploaded_by", "extracted_name", "extracted_email", "llm_score", "status", "processed_at")
    list_filter   = ("status", "ocr_method", "ollama_model")
    search_fields = ("filename", "extracted_name", "extracted_email", "uploaded_by")
    readonly_fields = (
        "filename", "uploaded_by", "processed_at", "ocr_method",
        "ollama_model", "ollama_raw_output", "extracted_name",
        "extracted_email", "extracted_phone", "extracted_experience",
        "extracted_skills", "llm_score", "status", "error_message",
    )
    ordering = ("-processed_at",)


admin.site.register(CandidateResume)
admin.site.register(ResumeScreening)   # ✅ replaces ShortlistedCandidate
admin.site.register(Interview)