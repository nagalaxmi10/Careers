from django.contrib import admin

from .models import (
    CandidateResume,
    ShortlistedCandidate,
    Interview
)

admin.site.register(
    CandidateResume
)

admin.site.register(
    ShortlistedCandidate
)

admin.site.register(
    Interview
)