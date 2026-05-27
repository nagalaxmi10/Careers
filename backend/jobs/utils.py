import os
import re

def extract_text_from_file(file_path):
    """Extract raw text from any file type."""
    ext = os.path.splitext(file_path)[1].lower()

    if ext == ".pdf":
        try:
            import PyPDF2
            with open(file_path, "rb") as f:
                reader = PyPDF2.PdfReader(f)
                return " ".join(page.extract_text() or "" for page in reader.pages)
        except Exception as e:
            return ""

    elif ext in [".docx", ".doc"]:
        try:
            from docx import Document
            doc = Document(file_path)
            return " ".join(p.text for p in doc.paragraphs)
        except Exception as e:
            return ""

    elif ext in [".txt", ".md"]:
        try:
            with open(file_path, "r", errors="ignore") as f:
                return f.read()
        except Exception:
            return ""

    else:
        # Try reading as plain text for other formats
        try:
            with open(file_path, "r", errors="ignore") as f:
                return f.read()
        except Exception:
            return ""


def extract_skills_and_match(resume_text, required_skills):
    """
    Use Ollama (llama3) to extract skills from resume text
    and match against required skills. Returns (extracted_skills, match_score, name, email).
    """
    import ollama

    prompt = f"""
You are a resume parser. Given the resume text below, extract:
1. Candidate full name
2. Candidate email
3. List of technical and professional skills

Then compare the extracted skills against these required skills:
{', '.join(required_skills)}

Respond ONLY in this exact format (no extra text):
NAME: <full name>
EMAIL: <email>
SKILLS: <comma separated skills found in resume>
MATCHED: <comma separated skills that match the required skills>
SCORE: <match percentage as a number between 0 and 100>

Resume text:
{resume_text[:4000]}
"""

    try:
        response = ollama.chat(
            model="llama3",
            messages=[{"role": "user", "content": prompt}]
        )
        content = response["message"]["content"]

        name = re.search(r"NAME:\s*(.+)", content)
        email = re.search(r"EMAIL:\s*(.+)", content)
        skills = re.search(r"SKILLS:\s*(.+)", content)
        score = re.search(r"SCORE:\s*([\d.]+)", content)

        return {
            "name": name.group(1).strip() if name else "",
            "email": email.group(1).strip() if email else "",
            "skills": skills.group(1).strip() if skills else "",
            "score": float(score.group(1).strip()) if score else 0.0,
        }

    except Exception as e:
        print(f"Ollama error: {e}")
        # Fallback: simple keyword matching
        resume_lower = resume_text.lower()
        matched = [s for s in required_skills if s.lower() in resume_lower]
        score = (len(matched) / len(required_skills) * 100) if required_skills else 0
        return {
            "name": "",
            "email": "",
            "skills": ", ".join(matched),
            "score": round(score, 1),
        }