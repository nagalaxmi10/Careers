from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework.exceptions import PermissionDenied
from django.contrib.auth import get_user_model
from jobs.models import JobRequest
from recruitment.models import CandidateResume, Interview, EmailLog
from .serializers import (
    CustomTokenObtainPairSerializer,
    UserSerializer,
    CreateEmployeeSerializer,
    UpdatePhoneSerializer,
)
from .permissions import IsAdmin

User = get_user_model()


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class EmployeeListView(generics.ListAPIView):
    """
    FIX: was filtering role="EMPLOYEE" only, so recruiters / HR / junior HR
    users created by admin never appeared in the admin dashboard.
    Now returns all non-admin users. Frontend can filter/group by role.
    """
    serializer_class = UserSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        return User.objects.exclude(role="ADMIN").order_by("role", "first_name")


class CreateEmployeeView(generics.CreateAPIView):
    serializer_class = CreateEmployeeSerializer
    permission_classes = [IsAdmin]


class UpdateEmployeeView(generics.UpdateAPIView):
    """
    New: lets admin edit any non-admin user's details (position, department, etc.)
    PATCH /api/accounts/employees/<id>/update/
    """
    serializer_class = UserSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        return User.objects.exclude(role="ADMIN")

    def get_serializer(self, *args, **kwargs):
        kwargs["partial"] = True
        return super().get_serializer(*args, **kwargs)


class DeleteEmployeeView(generics.DestroyAPIView):
    permission_classes = [IsAdmin]

    def get_queryset(self):
        # FIX: was only filtering role="EMPLOYEE", so admin couldn't delete
        # recruiter/HR accounts they created. Now allows deleting any non-admin.
        return User.objects.exclude(role="ADMIN")

    def perform_destroy(self, instance):
        if instance.role == "ADMIN":
            raise PermissionDenied("Cannot delete admin accounts.")
        instance.delete()


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        old_password = request.data.get("old_password")
        new_password = request.data.get("new_password")

        if not user.check_password(old_password):
            return Response(
                {"error": "Current password is incorrect."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not new_password or len(new_password) < 6:
            return Response(
                {"error": "New password must be at least 6 characters."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(new_password)
        user.save()
        return Response({"message": "Password changed successfully."})


class UpdatePhoneView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request):
        serializer = UpdatePhoneSerializer(request.user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
# Add this import alongside your existing serializer imports in accounts/views.py:
from .serializers import UpdateProfileSerializer

# Add this view class alongside your existing views:
class UpdateProfileView(generics.UpdateAPIView):
    serializer_class = UpdateProfileSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["patch"]

    def get_object(self):
        return self.request.user

class DashboardStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        data = {}

        if user.role == "ADMIN":
            data = {
                "employees": User.objects.filter(role="EMPLOYEE").count(),
                "job_requests": JobRequest.objects.count(),
                "candidates": CandidateResume.objects.count(),
                "interviews": Interview.objects.count(),
            }
        elif user.role in ["HR", "JUNIOR_HR"]:
            data = {
                "shortlisted": CandidateResume.objects.filter(is_shortlisted=True).count(),
                "interviews_scheduled": Interview.objects.count(),
                "emails_sent": EmailLog.objects.count(),
                "pending_jobs": JobRequest.objects.filter(status="PENDING").count(),
            }
        elif user.role == "RECRUITER":
            data = {
                "uploaded_by_me": CandidateResume.objects.filter(uploaded_by=user).count(),
                "shortlisted_mine": CandidateResume.objects.filter(uploaded_by=user, is_shortlisted=True).count(),
                "approved_jobs": JobRequest.objects.filter(status="APPROVED").count(),
            }
            
        return Response(data)