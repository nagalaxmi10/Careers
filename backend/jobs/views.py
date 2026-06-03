from rest_framework.viewsets import ModelViewSet
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from .models import JobRequest
from .serializers import JobRequestSerializer, JobStatusUpdateSerializer, JobRequestEditSerializer
import json
import ollama
from django.conf import settings
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
class JobRequestViewSet(ModelViewSet):
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == "ADMIN":
            return JobRequest.objects.all()
        if user.role in ["RECRUITER", "HR", "JUNIOR_HR"]:
            return JobRequest.objects.filter(status="APPROVED")
        return JobRequest.objects.filter(employee=user)

    def get_serializer_class(self):
        user = self.request.user
        if self.action == "partial_update":
            # Admin updates status; employee edits content
            if user.role == "ADMIN":
                return JobStatusUpdateSerializer
            return JobRequestEditSerializer
        return JobRequestSerializer

    def perform_create(self, serializer):
        if self.request.user.role != "EMPLOYEE":
            raise PermissionDenied("Only employees can submit job requests.")
        serializer.save(employee=self.request.user)

    def perform_update(self, serializer):
        user = self.request.user
        if user.role == "ADMIN":
            serializer.save()
        elif user.role == "EMPLOYEE":
            instance = self.get_object()
            if instance.employee != user:
                raise PermissionDenied("You can only edit your own requests.")
            serializer.save()
        else:
            raise PermissionDenied("Permission denied.")

    def perform_destroy(self, instance):
        if self.request.user.role != "ADMIN":
            raise PermissionDenied("Only admins can delete job requests.")
        instance.delete()


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def generate_jd(request):
    """Use Ollama to generate Job Description from a title."""
    title = request.data.get("title", "")
    if not title:
        return Response({"error": "Title is required"}, status=400)
    
    if request.user.role != "EMPLOYEE":
        return Response({"error": "Only employees can generate JDs"}, status=403)

    prompt = f"""
You are an expert HR assistant. Generate a concise job description for a {title} role.

CRITICAL INSTRUCTIONS:
1. Keep the total length under 300 words.
2. Output MUST be in valid JSON format only.
3. Do not include any conversational text, just the JSON.
4. Use this exact schema:
{{
  "description": "A brief 2-3 line summary of the role.",
  "key_responsibilities": "3-5 bullet points separated by newlines.",
  "basic_qualifications": "3-5 bullet points separated by newlines.",
  "preferred_qualifications": "2-3 bullet points separated by newlines.",
  "skills_required": "Comma separated list of 5-8 essential skills"
}}
Only return valid JSON, no markdown formatting, no extra text."""

    try:
        model_name = getattr(settings, "OLLAMA_MODEL", "llama3")
        response = ollama.chat(
            model=model_name,
            messages=[{"role": "user", "content": prompt}],
            format="json",
            options={"num_predict": 500}
        )
        content = response["message"]["content"]
        
        # ✅ FIX: Strip markdown code blocks if Ollama ignored the instruction
        import re
        json_match = re.search(r'\{.*\}', content, re.DOTALL)
        if json_match:
            content = json_match.group(0)
            
        return Response(json.loads(content))
        
    except json.JSONDecodeError as e:
        # Specific error for bad JSON
        print(f"JSON Parse Error: {e} | Raw content: {content}")
        return Response({"error": "AI returned invalid format. Please try again."}, status=500)
        
    except Exception as e:
        print(f"Ollama Error: {e}")
        return Response({"error": f"AI generation failed. Is Ollama running? Error: {str(e)}"}, status=500)