from django.contrib import admin

# Register your models here.
from .models import User  # whatever your model is named

admin.site.register(User)