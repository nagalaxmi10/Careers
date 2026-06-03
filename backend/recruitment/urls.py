from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    CandidateResumeViewSet, 
    ShortlistedCandidateViewSet, 
    InterviewViewSet, 
    email_log_view,
    serve_resume,
    resend_email_view,      # <-- ADD THIS IMPORT
    manual_invite_view      # <-- ADD THIS IMPORT
)

router = DefaultRouter()
router.register(r'resumes', CandidateResumeViewSet, basename='candidate-resume')
router.register(r'shortlisted', ShortlistedCandidateViewSet, basename='shortlisted-candidate')
router.register(r'interviews', InterviewViewSet, basename='interview')

urlpatterns = [
    path('email-log/', email_log_view, name='email-log'),
    path('resumes/<int:pk>/download/', serve_resume, name='serve-resume'),
    
    # ── Manual Email Endpoints ──
    path('resend-email/<int:log_id>/', resend_email_view, name='resend-email'),
    path('manual-invite/<int:candidate_id>/', manual_invite_view, name='manual-invite'),
    
    path('', include(router.urls)),
]