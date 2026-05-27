from rest_framework.permissions import BasePermission

class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == "ADMIN"

class IsRecruiter(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == "RECRUITER"

class IsHR(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in ["HR", "JUNIOR_HR"]

class IsHROnly(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == "HR"

class IsAdminOrRecruiter(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in ["ADMIN", "RECRUITER"]