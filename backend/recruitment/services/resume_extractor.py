import os
import re
import io
import subprocess
import logging
from django.conf import settings
import base64

# ── Logger Setup ──────────────────────────────────────────────────────────────
logger = logging.getLogger("resume_processing")

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
    if not name or not name.strip():
        return False
    return name.strip().lower() not in NOT_NAMES

def _safe_float(value, default=0.0):
    try:
        # ✅ FIX 2: Strip + and whitespace before converting
        cleaned = str(value).replace("+", "").strip()
        result = float(cleaned)
        return result if result >= 0 else default
    except (TypeError, ValueError):
        return default


def extract_text_from_image(file_input):
    """
    Uses Tesseract OCR to extract text from an image (JPG/PNG).
    Falls back to LLaVA only if Tesseract is not installed.
    """
    if isinstance(file_input, (io.BytesIO, io.BufferedReader)):
        image_bytes = file_input.read()
    else:
        with open(file_input, "rb") as f:
            image_bytes = f.read()

    # ── PRIMARY: Tesseract OCR ────────────────────────────────────────────────
    try:
        import pytesseract
        from PIL import Image

        tesseract_cmd = getattr(settings, "TESSERACT_CMD", r"C:\Program Files\Tesseract-OCR\tesseract.exe")
        pytesseract.pytesseract.tesseract_cmd = tesseract_cmd

        img = Image.open(io.BytesIO(image_bytes))
        img = img.convert("L")  # grayscale for better accuracy
        custom_config = r"--oem 3 --psm 6"
        text = pytesseract.image_to_string(img, config=custom_config)

        logger.info(f"[OCR] Tesseract extracted {len(text)} characters")
        logger.debug(f"[OCR] TESSERACT RAW OUTPUT:\n{text}")
        return text

    except ImportError:
        logger.warning("[OCR] pytesseract not installed — falling back to LLaVA")
    except Exception as e:
        logger.error(f"[OCR] Tesseract failed: {e} — falling back to LLaVA")

    # ── FALLBACK: LLaVA Vision OCR ────────────────────────────────────────────
    try:
        import ollama
        img_b64 = base64.b64encode(image_bytes).decode("utf-8")
        logger.info("[OCR] Sending image to LLaVA as fallback...")

        response = ollama.chat(
            model=getattr(settings, "OLLAMA_VISION_MODEL", "llava"),
            messages=[{
                "role": "user",
                "content": """You are a resume OCR scanner. Read this resume image carefully and extract the text EXACTLY as it appears.
Output the raw text only, preserving the structure.
Do NOT summarize, interpret, or add anything.
Do NOT output any commentary before or after the text.
Start directly with the candidate's name.""",
                "images": [img_b64]
            }],
            options={"num_predict": 1000}
        )
        extracted = response["message"]["content"]
        logger.info(f"[OCR] LLaVA fallback extracted {len(extracted)} characters")
        logger.debug(f"[OCR] LLAVA RAW OUTPUT:\n{extracted}")
        return extracted

    except Exception as e:
        logger.error(f"[OCR] LLaVA fallback also failed: {e}")
        return ""


def extract_text_from_file(file_input):
    """
    Extracts text from a PDF, DOCX, DOC, Image, or Django UploadedFile.
    Correctly detects Django uploaded files by their .name attribute.
    """

    # ✅ Handle Django InMemoryUploadedFile / UploadedFile FIRST
    try:
        from django.core.files.uploadedfile import UploadedFile
        if isinstance(file_input, UploadedFile):
            ext = os.path.splitext(file_input.name)[1].lower()
            logger.info(f"[EXTRACTOR] Django UploadedFile: {file_input.name} (ext={ext})")
            file_bytes = io.BytesIO(file_input.read())

            if ext in [".jpg", ".jpeg", ".png"]:
                logger.info("[EXTRACTOR] Routing to Tesseract OCR pipeline")
                return extract_text_from_image(file_bytes)
            else:
                file_input = file_bytes
    except ImportError:
        pass

    is_in_memory = isinstance(file_input, (io.BytesIO, io.BufferedReader))
    ext = ""
    if not is_in_memory:
        ext = os.path.splitext(str(file_input))[1].lower()

    # ─── IMAGE FILES (JPG/PNG) — file path on disk ────────────────────────────
    if ext in [".jpg", ".jpeg", ".png"]:
        logger.info(f"[EXTRACTOR] Image file on disk: {file_input}")
        return extract_text_from_image(file_input)

    # ─── PDF FILES (Standard + Tesseract Fallback) ────────────────────────────
    if is_in_memory or ext == ".pdf":
        text = ""
        try:
            import PyPDF2
            reader = PyPDF2.PdfReader(file_input)
            text = " ".join(page.extract_text() or "" for page in reader.pages)
            logger.info(f"[EXTRACTOR] PyPDF2 extracted {len(text)} characters")
        except Exception as e:
            logger.warning(f"[EXTRACTOR] PyPDF2 failed: {e}")

        if not text or len(text.strip()) < 50:
            logger.warning("[EXTRACTOR] PDF text too short, falling back to Tesseract via PyMuPDF render")
            try:
                import fitz
                if is_in_memory:
                    file_input.seek(0)
                pdf_bytes = file_input.read() if is_in_memory else open(file_input, "rb").read()
                doc = fitz.open(stream=pdf_bytes, filetype="pdf")
                if len(doc) > 0:
                    page = doc.load_page(0)
                    pix = page.get_pixmap(dpi=300)
                    img_bytes = pix.tobytes("png")
                    img_stream = io.BytesIO(img_bytes)
                    text = extract_text_from_image(img_stream)
            except Exception as e:
                logger.error(f"[EXTRACTOR] PDF vision fallback failed: {e}")

        return text

    # ─── DOCX FILES ───────────────────────────────────────────────────────────
    elif ext == ".docx":
        try:
            from docx import Document
            doc = Document(file_input)
            text = " ".join(p.text for p in doc.paragraphs)
            logger.info(f"[EXTRACTOR] DOCX extracted {len(text)} characters")
            return text
        except Exception as e:
            logger.error(f"[EXTRACTOR] DOCX error: {e}")
            return ""

    # ─── DOC FILES ────────────────────────────────────────────────────────────
    elif ext == ".doc":
        try:
            result = subprocess.run(["antiword", file_input], capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                return result.stdout
        except Exception:
            pass
        return ""

    # ─── FALLBACK PLAINTEXT ───────────────────────────────────────────────────
    else:
        try:
            with open(file_input, "r", errors="ignore") as f:
                return f.read()
        except Exception:
            return ""


def _regex_fallback(resume_text, required_skills):
    """Best-effort extraction using regex when Ollama is unavailable."""
    name = ""
    for line in resume_text.splitlines():
        line = line.strip()
        clean = line.split(" - ")[0].strip()
        if re.match(r"^[A-Z][a-z]+(?:\s[A-Z][a-z]+){1,3}$", clean):
            if _is_valid_name(clean):
                name = clean
                break

    email_match = re.search(r"[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}", resume_text)
    email = email_match.group(0) if email_match else ""

    phone_match = re.search(r"(\+?\d[\d\s\-().]{7,}\d)", resume_text)
    phone = phone_match.group(0).strip() if phone_match else ""

    exp_match = re.search(r"(\d+(?:\.\d+)?)\+?\s*years?(?:\s+of)?\s+experience", resume_text, re.I)
    experience = _safe_float(exp_match.group(1)) if exp_match else 0.0

    resume_lower = resume_text.lower()
    matched_skills = [s for s in required_skills if s.lower() in resume_lower]

    logger.info(f"[REGEX] Extracted — Name: {name} | Email: {email} | Skills: {matched_skills}")

    return {
        "name": name, "email": email, "phone": phone,
        "experience": experience, "skills": matched_skills, "score": 0.0,
    }


def extract_with_ollama(resume_text, required_skills, job_context="", past_matches="", filename="unknown", uploaded_by="unknown"):
    """Extract resume fields using Ollama LLM with full logging."""
    import ollama
    from recruitment.models import ResumeProcessingLog

    pre = _regex_fallback(resume_text, required_skills)
    logger.info(f"[OLLAMA] Starting extraction for: {filename} | Uploaded by: {uploaded_by}")
    logger.info(f"[OLLAMA] Regex pre-extract — Name: {pre['name']} | Email: {pre['email']}")

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

    prompt = f"""You are a resume data extractor. Your ONLY job is to extract fields from the resume text below.

STRICT RULES:
1. Extract ONLY what is explicitly written in the resume text.
2. Do NOT guess, infer, or hallucinate any information.
3. For SKILLS extract ALL relevant professional skills visible in the resume including:
- Programming languages
- Frameworks
- Libraries
- Databases
- Cloud platforms
- DevOps tools
- Testing tools
- APIs
- Methodologies (Agile, Scrum, Kanban)
- CI/CD tools
4. For EMAIL: extract ONLY valid email addresses containing @. LinkedIn/GitHub URLs are NOT emails.
5. If a field is missing, leave it blank.
6. EXPERIENCE: extract total years as a plain number only (e.g. 7, not 7+).
7. LLM_SCORE:
Score the candidate against the JOB CONTEXT.

Consider:
- Required skills
- Years of experience
- Responsibilities
- Qualifications
- Relevant projects
- Team collaboration
- CI/CD and deployment experience

100 = near perfect match
80 = strong shortlist
60 = partial match
40 = weak match
20 = poor match

Return only an integer.
8. FIT_SUMMARY: always provide 2-3 sentences — never leave blank.

Respond in this EXACT format with no extra text:
NAME: <full name>
EMAIL: <email with @ symbol only, or blank>
PHONE: <digits only, or blank>
EXPERIENCE: <number only>
SKILLS: <comma separated technical skills>
FIT_SUMMARY: <2-3 sentences>
LLM_SCORE: <integer 0-100>

<RESUME>
{resume_chunk}
</RESUME>
{context_section}"""

    model_name = getattr(settings, "OLLAMA_MODEL", "llama3")

    result = {
        "name": "", "email": "", "phone": "", "experience": 0.0,
        "skills": [], "score": 0.0, "fit_summary": "", "llm_score": 0,
    }

    ollama_raw = ""
    status = "SUCCESS"
    error_message = ""
    ocr_method = "tesseract_image" if not filename.lower().endswith(".pdf") else "pypdf2_or_tesseract"

    try:
        response = ollama.chat(
            model=model_name,
            messages=[{"role": "user", "content": prompt}],
            options={"num_predict": 512}
        )
        ollama_raw = response["message"]["content"]
        logger.info(f"[OLLAMA] Raw response received ({len(ollama_raw)} chars)")
        logger.debug(f"[OLLAMA] RAW OUTPUT:\n{ollama_raw}")

        name  = re.search(r"NAME:\s*(.+)",           ollama_raw)
        email = re.search(r"EMAIL:\s*(.+)",          ollama_raw)
        phone = re.search(r"PHONE:\s*(.+)",          ollama_raw)
        # ✅ FIX 2: Handle "7+" in experience
        exp   = re.search(r"EXPERIENCE:\s*([\d.]+\+?)", ollama_raw)

        skills = re.search(r"SKILLS:\s*(.+?)(?=\n[A-Z_]+:|$)", ollama_raw, re.DOTALL | re.IGNORECASE)
        skills_list = []
        if skills:
            parts = re.split(r',|\n|•|-', skills.group(1).strip())
            for p in parts:
                clean = re.sub(r'^[•\-\*]\s*', '', p.strip()).strip()
                if clean and len(clean) > 1 and not clean.lower().startswith("see "):
                    skills_list.append(clean)

        fit_summary = re.search(r"FIT_SUMMARY:\s*(.+?)(?=\n[A-Z_]+:|$)", ollama_raw, re.DOTALL | re.IGNORECASE)
        fit_text = fit_summary.group(1).strip().split("\n")[0][:600] if fit_summary else ""

        llm_score_match = re.search(r"LLM_SCORE:\s*(\d{1,3})", ollama_raw)
        llm_score = min(int(llm_score_match.group(1)), 100) if llm_score_match else 0

        raw_name = name.group(1).strip() if name else ""
        if any(x in raw_name.upper() for x in ["REDACTED", "REACTED", "[REDACT"]):
            raw_name = ""
        valid_name = raw_name if _is_valid_name(raw_name) else ""

        # ✅ FIX 1: Reject non-email values (LinkedIn URLs, etc.)
        raw_email = email.group(1).strip() if email else ""
        valid_email = raw_email if ("@" in raw_email and "." in raw_email.split("@")[-1]) else ""

        # ✅ FIX 2: Strip + from experience
        exp_val = exp.group(1).replace("+", "").strip() if exp else "0"

        result.update({
            "name":        valid_name,
            "email":       valid_email,
            "phone":       phone.group(1).strip() if phone else "",
            "experience":  _safe_float(exp_val),
            "skills":      skills_list,
            "fit_summary": fit_text,
            "llm_score":   llm_score,
        })

        logger.info(
            f"[OLLAMA] Extracted — Name: {result['name']} | "
            f"Email: {result['email']} | Score: {llm_score} | "
            f"Skills: {skills_list}"
        )

    except ollama.ResponseError as e:
        status = "OLLAMA_ERROR"
        error_message = str(e)
        logger.error(f"[OLLAMA] ResponseError: {e} — using regex fallback")
        return _regex_fallback(resume_text, required_skills)

    except Exception as e:
        status = "ERROR"
        error_message = str(e)
        logger.error(f"[OLLAMA] Unexpected error: {e} — merging with regex fallback")
        fallback = _regex_fallback(resume_text, required_skills)
        result["name"]       = result["name"]       or fallback["name"]
        result["email"]      = result["email"]      or fallback["email"]
        result["phone"]      = result["phone"]      or fallback["phone"]
        result["experience"] = result["experience"] or fallback["experience"]
        result["skills"]     = result["skills"]     or fallback["skills"]

    # ✅ Final safety net: use regex for any fields Ollama missed
    result["name"]  = result["name"]  or pre["name"]
    result["email"] = result["email"] or pre["email"]
    result["phone"] = result["phone"] or pre["phone"]

    # ── Save to DB log ────────────────────────────────────────────────────────
    try:
        ResumeProcessingLog.objects.create(
            filename=filename,
            uploaded_by=str(uploaded_by),
            ocr_method=ocr_method,
            ollama_model=model_name,
            ollama_raw_output=ollama_raw[:5000],
            extracted_name=result["name"],
            extracted_email=result["email"],
            extracted_phone=result["phone"],
            extracted_experience=result["experience"],
            extracted_skills=result["skills"],
            llm_score=result["llm_score"],
            status=status,
            error_message=error_message[:500] if error_message else "",
        )
        logger.info(f"[LOG] DB log saved for: {filename}")
    except Exception as e:
        logger.error(f"[LOG] Failed to save DB log: {e}")
    return result