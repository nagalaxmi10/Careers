from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ingest_local_folder, recruiter_analytics, upload_and_screen
from .views import (
    CandidateResumeViewSet, 
    ShortlistedCandidateViewSet, 
    InterviewViewSet, 
    email_log_view,
    serve_resume,
    resend_email_view,
    manual_invite_view,
    bulk_upload_resumes,
    RunSharePointScreeningView,   # ← add
)

router = DefaultRouter()
router.register(r'resumes', CandidateResumeViewSet, basename='candidate-resume')
router.register(r'shortlisted', ShortlistedCandidateViewSet, basename='shortlisted-candidate')
router.register(r'interviews', InterviewViewSet, basename='interview')

urlpatterns = [
    path('email-log/', email_log_view, name='email-log'),
    path('resumes/<int:pk>/download/', serve_resume, name='serve-resume'),
    path('resend-email/<int:log_id>/', resend_email_view, name='resend-email'),
    path('manual-invite/<int:candidate_id>/', manual_invite_view, name='manual-invite'),
    path('ingest-local-folder/', ingest_local_folder),
    path('bulk-upload/', bulk_upload_resumes, name='bulk-upload'),
    path('run-screening/', RunSharePointScreeningView.as_view(), name='run-screening'),  # ← add
    path("upload-and-screen/", upload_and_screen),
    path("analytics/", recruiter_analytics),
    path('', include(router.urls)),
]