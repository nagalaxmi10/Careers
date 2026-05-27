from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import JobRequestViewSet, generate_jd  # ✅ Make sure generate_jd is imported!

router = DefaultRouter()
router.register(r'', JobRequestViewSet, basename='jobrequest')

urlpatterns = [
    path("generate-jd/", generate_jd),  # ✅ Must be above the router include
    path("", include(router.urls)),
]