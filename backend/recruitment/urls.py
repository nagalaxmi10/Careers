from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ingest_local_folder,
    recruiter_analytics,
    screen_pool_for_job,
    job_shortlist_view,
)
from .views import (
    CandidateResumeViewSet,
    ResumeScreeningViewSet,
    InterviewViewSet,
    email_log_view,
    serve_resume,
    resend_email_view,
    manual_invite_view,
    bulk_upload_resumes,
)

router = DefaultRouter()
router.register(r'resumes', CandidateResumeViewSet, basename='candidate-resume')
router.register(r'screenings', ResumeScreeningViewSet, basename='resume-screening')
router.register(r'interviews', InterviewViewSet, basename='interview')

urlpatterns = [
    path('email-log/', email_log_view, name='email-log'),
    path('resumes/<int:pk>/download/', serve_resume, name='serve-resume'),
    path('resend-email/<int:log_id>/', resend_email_view, name='resend-email'),
    path('manual-invite/<int:candidate_id>/', manual_invite_view, name='manual-invite'),
    path('ingest-local-folder/', ingest_local_folder),
    path('bulk-upload/', bulk_upload_resumes, name='bulk-upload'),
    path('screen-pool/', screen_pool_for_job, name='screen-pool'),
    path('analytics/', recruiter_analytics),
    path("shortlist/<int:job_id>/", job_shortlist_view, name="job_shortlist_view"),
    path('', include(router.urls)),
]