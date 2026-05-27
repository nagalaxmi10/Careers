from django.contrib.auth.models import AbstractUser
from django.db import models
from .managers import UserManager

class User(AbstractUser):
    username = None
    email = models.EmailField(unique=True)

    class Role(models.TextChoices):
        ADMIN = "ADMIN"
        EMPLOYEE = "EMPLOYEE"
        RECRUITER = "RECRUITER"
        HR = "HR"
        JUNIOR_HR = "JUNIOR_HR"

    role = models.CharField(max_length=20, choices=Role.choices)
    position = models.CharField(max_length=100, blank=True, null=True)
    department = models.CharField(max_length=100, blank=True, null=True)
    phone = models.CharField(max_length=20, blank=True, null=True)

    # Extra fields for smooth HR operations
    employee_id = models.CharField(max_length=50, blank=True, null=True)
    date_of_joining = models.DateField(blank=True, null=True)
    address = models.TextField(blank=True, null=True)
    emergency_contact = models.CharField(max_length=100, blank=True, null=True)
    emergency_phone = models.CharField(max_length=20, blank=True, null=True)
    linkedin = models.URLField(blank=True, null=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []
    objects = UserManager()