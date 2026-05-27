from django.urls import path
from .views import (
    CustomTokenObtainPairView,
    MeView,
    EmployeeListView,
    CreateEmployeeView,
    UpdateEmployeeView,
    DeleteEmployeeView,
    ChangePasswordView,
    UpdatePhoneView,
    UpdateProfileView,
    DashboardStatsView,  # ✅ Add this import
)

urlpatterns = [
    path("token/", CustomTokenObtainPairView.as_view()),
    path("me/", MeView.as_view()),
    path("employees/", EmployeeListView.as_view()),
    path("employees/create/", CreateEmployeeView.as_view()),
    path("employees/<int:pk>/update/", UpdateEmployeeView.as_view()),
    path("employees/<int:pk>/delete/", DeleteEmployeeView.as_view()),
    path("change-password/", ChangePasswordView.as_view()),
    path("update-phone/", UpdatePhoneView.as_view()),
    path("update-profile/", UpdateProfileView.as_view()),
    path("stats/", DashboardStatsView.as_view()),  # ✅ Add this line
]