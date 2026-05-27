from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from accounts.views import CustomTokenObtainPairView
from rest_framework_simplejwt.views import TokenRefreshView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/token/", CustomTokenObtainPairView.as_view()),
    path("api/token/refresh/", TokenRefreshView.as_view()),
    path("api/accounts/", include("accounts.urls")),
    # path("api/", include("jobs.urls")),  ← ❌ REMOVE THIS LINE
    path("api/jobs/", include("jobs.urls")),      # ✅ Keep only this one
    path("api/recruitment/", include("recruitment.urls")),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)