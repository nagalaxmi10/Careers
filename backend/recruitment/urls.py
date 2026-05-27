from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    CandidateResumeViewSet,
    ShortlistedCandidateViewSet,
    InterviewViewSet,
    email_log_view,
      serve_resume,  # ✅ Must be imported
)
router = DefaultRouter()
router.register(r"resumes", CandidateResumeViewSet, basename="resumes")
router.register(r"shortlisted", ShortlistedCandidateViewSet, basename="shortlisted")
router.register(r"interviews", InterviewViewSet, basename="interviews")

urlpatterns = [
    path("resumes/<int:pk>/download/", serve_resume),
    path("email-log/", email_log_view),  # ✅ Must exist
    path("", include(router.urls)),
]