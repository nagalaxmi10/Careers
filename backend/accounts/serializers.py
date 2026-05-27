from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework import serializers
from django.contrib.auth import get_user_model

User = get_user_model()

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "id", "email", "first_name", "last_name", "role",
            "position", "department", "phone", "employee_id",
            "date_of_joining", "address", "emergency_contact",
            "emergency_phone", "linkedin"
        ]

class CreateEmployeeSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = [
            "email", "password", "first_name", "last_name", "role",
            "position", "department", "phone", "employee_id",
            "date_of_joining", "address", "emergency_contact",
            "emergency_phone", "linkedin"
        ]

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)

class UpdatePhoneSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["phone"]

class UpdateProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "first_name", "last_name", "phone",
            "address", "emergency_contact", "emergency_phone", "linkedin"
        ]

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = user.role
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data["role"] = self.user.role
        return data