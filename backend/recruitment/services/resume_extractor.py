import os
import re
import subprocess
from django.conf import settings

# Common resume section headers that Ollama mistakes for names
NOT_NAMES = {
    "professional summary", "summary", "objective", "career objective",
    "education", "experience", "work experience", "professional experience",
    "skills", "technical skills", "certifications", "projects",
    "achievements", "languages", "interests", "references",
    "contact information", "personal details", "profile",
    "key skills", "core competencies", "qualifications",
}

def _is_valid_name(name):
    """Filter out section headers that Ollama mistakes for names."""
    if not name or not name.strip():
        return False
    return name.strip().lower() not in NOT_NAMES

def _safe_float(value, default=0.0):
    """Safely convert a value to float, returning default on failure."""
    try:
        result = float(value)
        return result if result >= 0 else default
    except (TypeError, ValueError):
        return default

def extract_text_from_file(file_path):
    ext = os.path.splitext(file_path)[1].lower()

    if ext == ".pdf":
        try:
            import PyPDF2
            with open(file_path, "rb") as f:
                reader = PyPDF2.PdfReader(f)
                return " ".join(page.extract_text() or "" for page in reader.pages)
        except Exception as e:
            print(f"PDF error: {e}")
            return ""

    elif ext == ".docx":
        try:
            from docx import Document
            doc = Document(file_path)
            return " ".join(p.text for p in doc.paragraphs)
        except Exception as e:
            print(f"DOCX error: {e}")
            return ""

    elif ext == ".doc":
        try:
            result = subprocess.run(
                ["antiword", file_path], 
                capture_output=True, 
                text=True, 
                timeout=10
            )
            if result.returncode == 0:
                return result.stdout
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass
        print(f".doc format not fully supported — install 'antiword' or convert to .docx")
        return ""

    else:
        try:
            with open(file_path, "r", errors="ignore") as f:
                return f.read()
        except Exception:
            return ""


def _regex_fallback(resume_text, required_skills):
    """Best-effort extraction using regex when Ollama is unavailable."""

    name = ""
    for line in resume_text.splitlines():
        line = line.strip()
        if re.match(r"^[A-Z][a-z]+(?:\s[A-Z][a-z]+){1,3}$", line):
            if _is_valid_name(line):  # ✅ FIX: Filter out section headers
                name = line
                break

    email_match = re.search(r"[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}", resume_text)
    email = email_match.group(0) if email_match else ""

    phone_match = re.search(r"(\+?\d[\d\s\-().]{7,}\d)", resume_text)
    phone = phone_match.group(0).strip() if phone_match else ""

    exp_match = re.search(
        r"(\d+(?:\.\d+)?)\s*\+?\s*years?(?:\s+of)?\s+experience", resume_text, re.I
    )
    experience = _safe_float(exp_match.group(1)) if exp_match else 0.0

    resume_lower = resume_text.lower()
    matched_skills = [s for s in required_skills if s.lower() in resume_lower]

    return {
        "name":       name,
        "email":      email,
        "phone":      phone,
        "experience": experience,
        "skills":     matched_skills,
        "score":      0.0,
    }


def extract_with_ollama(resume_text, required_skills, job_context="", past_matches=""):
    import ollama

    MAX_CHARS = 6000
    if len(resume_text) > MAX_CHARS:
        cut = resume_text.rfind("\n", 0, MAX_CHARS)
        resume_chunk = resume_text[:cut] if cut > MAX_CHARS // 2 else resume_text[:MAX_CHARS]
    else:
        resume_chunk = resume_text

    context_section = ""
    if job_context:
        context_section += f"\n═══════════════════════════════\nJOB CONTEXT\n═══════════════════════════════\n{job_context}\n"
    if past_matches:
        context_section += f"\n═══════════════════════════════\nPAST SUCCESSFUL MATCHES\n═══════════════════════════════\n{past_matches}\n"

    prompt = f"""You are an expert technical recruiter and resume parser.
{context_section}

CRITICAL INSTRUCTION: Extract data ONLY from the text inside the <RESUME> tags below. 
Do NOT extract name, email, or skills from the JOB CONTEXT or PAST MATCHES sections. 
Those are provided ONLY for you to understand what skills to look for and calculate the FIT_SUMMARY.

Respond ONLY in this exact format, no extra text, no explanations:
NAME: <full name>
EMAIL: <email or blank>
PHONE: <phone or blank>
EXPERIENCE: <number>
SKILLS: <comma separated list of all skills, be thorough>
FIT_SUMMARY: <2-3 sentences: how well does this candidate fit the job context above?>
LLM_SCORE: <integer 0-100>

<RESUME>
{resume_chunk}
</RESUME>
"""

    model_name = getattr(settings, "OLLAMA_MODEL", "llama3")

    result = {
        "name": "",
        "email": "",
        "phone": "",
        "experience": 0.0,
        "skills": [],
        "score": 0.0,
        "fit_summary": "",
        "llm_score": 0,
    }

    try:
        response = ollama.chat(
            model=model_name,
            messages=[{"role": "user", "content": prompt}],
            options={"num_predict": 512}
        )
        content = response["message"]["content"]
        print("=== OLLAMA RAW ===\n", content)

        name   = re.search(r"NAME:\s*(.+)",          content)
        email  = re.search(r"EMAIL:\s*(.+)",         content)
        phone  = re.search(r"PHONE:\s*(.+)",         content)
        exp    = re.search(r"EXPERIENCE:\s*([\d.]+)", content)
        
        # ── BULLETPROOF SKILLS PARSING ──
        # Stops at the next ALL CAPS heading (like FIT_SUMMARY) or end of string
        skills = re.search(r"SKILLS:\s*(.+?)(?=\n[A-Z_]+:|$)", content, re.DOTALL | re.IGNORECASE)
        skills_list = []
        if skills:
            raw_skills = skills.group(1).strip()
            # Split by commas OR newlines OR bullet points
            parts = re.split(r',|\n|•|-', raw_skills)
            for p in parts:
                clean_skill = p.strip()
                # Remove leading bullet characters just in case
                clean_skill = re.sub(r'^[•\-\*]\s*', '', clean_skill).strip()
                # Filter out empty strings and common mistakes
                if clean_skill and len(clean_skill) > 1 and not clean_skill.lower().startswith("see "):
                    skills_list.append(clean_skill)

        fit_summary = re.search(r"FIT_SUMMARY:\s*(.+?)(?=\n[A-Z_]+:|$)", content, re.DOTALL | re.IGNORECASE)
        fit_text = ""
        if fit_summary:
            fit_text = fit_summary.group(1).strip().split("\n")[0][:600]

        # ── PARSE LLM SCORE ──
        llm_score_match = re.search(r"LLM_SCORE:\s*(\d{1,3})", content)
        llm_score = 0
        if llm_score_match:
            llm_score = int(llm_score_match.group(1))
            if llm_score > 100: llm_score = 100

        # ✅ FIX: Check if the extracted name is valid (not a section header)
        raw_name = name.group(1).strip() if name else ""
        valid_name = raw_name if _is_valid_name(raw_name) else ""

        result.update({
            "name":       valid_name,  # ✅ Uses the filtered name
            "email":      email.group(1).strip()  if email  else "",
            "phone":      phone.group(1).strip()  if phone  else "",
            "experience": _safe_float(exp.group(1)) if exp else 0.0,
            "skills":     skills_list,
            "fit_summary": fit_text,
            "llm_score":  llm_score,
        })

    except ollama.ResponseError as e:
        print(f"Ollama response error: {e} — using regex fallback")
        return _regex_fallback(resume_text, required_skills)
        
    except Exception as e:
        print(f"Ollama generic error: {e} — merging with regex fallback")
        fallback = _regex_fallback(resume_text, required_skills)
        result["name"]       = result["name"]       or fallback["name"]
        result["email"]      = result["email"]      or fallback["email"]
        result["phone"]      = result["phone"]      or fallback["phone"]
        result["experience"] = result["experience"]  or fallback["experience"]
        result["skills"]     = result["skills"]     or fallback["skills"]

    # Final patch: if Ollama completely missed name/email, use regex
    if not result["name"] or not result["email"]:
        fallback = _regex_fallback(resume_text, required_skills)
        result["name"]  = result["name"]  or fallback["name"]
        result["email"] = result["email"] or fallback["email"]
        result["phone"] = result["phone"] or fallback["phone"]

    return result