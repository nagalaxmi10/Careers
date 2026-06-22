"""
recruitment/services/pii_redactor.py

Handles personal information in resume text in two ways, using the
SAME underlying regex patterns for each field:

  1. extract_pii(text)  — CAPTURES name/email/phone/linkedin/github
     from the ORIGINAL resume text. These values are saved to
     CandidateResume fields in SQLite. This is the only place
     these values live going forward.

  2. redact_pii(text)   — REPLACES those same fields with placeholders.
     The output of this function is the ONLY version of the resume
     that is ever sent to the LLM (Ollama) or embedded into ChromaDB.

  The original `resume_text` is read by both functions independently —
  neither function depends on the other's output. This keeps the two
  concerns (population of contact-info fields vs. safe-LLM-input)
  separable and independently testable.

Install (for name detection):
    pip install spacy --break-system-packages
    python -m spacy download en_core_web_sm
"""

import re
import logging

logger = logging.getLogger("resume_processing")

# ── Shared patterns — used by both extraction and redaction ──────────────────
EMAIL_PATTERN = re.compile(r'[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}')
PHONE_PATTERN = re.compile(r'(\+?\d{1,3}[-.\s]?)?\(?\d{3,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}')
LINKEDIN_PATTERN = re.compile(r'(?:https?://)?(?:www\.)?linkedin\.com/in/[\w-]+/?', re.IGNORECASE)
GITHUB_PATTERN = re.compile(r'(?:https?://)?(?:www\.)?github\.com/[\w-]+/?', re.IGNORECASE)

# Resume section headers that the name-detection regex must not mistake
# for a candidate's name (reused from resume_extractor.py's NOT_NAMES set —
# kept duplicated here intentionally so this module has no import
# dependency on resume_extractor.py; the two lists should stay in sync).
NOT_NAMES = {
    "professional summary", "summary", "objective", "career objective",
    "education", "experience", "work experience", "professional experience",
    "skills", "technical skills", "certifications", "projects",
    "achievements", "languages", "interests", "references",
    "contact information", "personal details", "profile",
    "key skills", "core competencies", "qualifications",
}

_nlp = None  # lazy-loaded spaCy model


def _get_nlp():
    global _nlp
    if _nlp is None:
        import spacy
        try:
            _nlp = spacy.load("en_core_web_sm")
        except OSError:
            logger.error(
                "[PII] spaCy model 'en_core_web_sm' not found. "
                "Run: python -m spacy download en_core_web_sm"
            )
            raise
    return _nlp


def _is_valid_name(name: str) -> bool:
    if not name or not name.strip():
        return False
    return name.strip().lower() not in NOT_NAMES


def _extract_name(text: str) -> str:
    for line in text.splitlines():
        line = line.strip()
        # Handle "Neha Gupta - Data Analyst" format — strip everything after " - "
        clean = line.split(" - ")[0].strip()
        if re.match(r"^[A-Z][a-z]+(?:\s[A-Z][a-z]+){1,3}$", clean):
            if _is_valid_name(clean):
                return clean
    return ""


# ── 1. EXTRACTION — capture PII, save to SQLite ───────────────────────────────

def extract_pii(text: str) -> dict:
    """
    Pulls personal details out of the ORIGINAL (unredacted) resume text.
    Returns a dict ready to assign onto CandidateResume fields:
        name, email, phone, linkedin_url, github_url

    This is the ONLY function that should populate those fields —
    the LLM is never asked for them, since it never sees this text.
    """
    if not text:
        return {"name": "", "email": "", "phone": "", "linkedin_url": "", "github_url": ""}

    name = _extract_name(text)

    email_match = EMAIL_PATTERN.search(text)
    email = email_match.group(0) if email_match else ""

    phone_match = PHONE_PATTERN.search(text)
    phone = phone_match.group(0).strip() if phone_match else ""

    linkedin_match = LINKEDIN_PATTERN.search(text)
    linkedin_url = linkedin_match.group(0) if linkedin_match else ""

    github_match = GITHUB_PATTERN.search(text)
    github_url = github_match.group(0) if github_match else ""

    logger.info(
        f"[PII] Extracted — Name: {name!r} | Email: {email!r} | "
        f"Phone: {phone!r} | LinkedIn: {bool(linkedin_url)} | GitHub: {bool(github_url)}"
    )

    return {
        "name": name,
        "email": email,
        "phone": phone,
        "linkedin_url": linkedin_url,
        "github_url": github_url,
    }


# ── 2. REDACTION — strip PII, produce LLM/embedding-safe text ────────────────

def redact_pii(text: str, redact_names: bool = True) -> str:
    """
    Returns a redacted COPY of `text` — safe to send to Ollama or embed
    into ChromaDB. Does not mutate or depend on extract_pii()'s output;
    it independently re-finds and replaces the same categories of text.
    """
    if not text:
        return text

    redacted = text
    redacted = EMAIL_PATTERN.sub('[REDACTED_EMAIL]', redacted)
    redacted = PHONE_PATTERN.sub('[REDACTED_PHONE]', redacted)
    redacted = LINKEDIN_PATTERN.sub('[REDACTED_LINKEDIN]', redacted)
    redacted = GITHUB_PATTERN.sub('[REDACTED_GITHUB]', redacted)

    if redact_names:
        try:
            nlp = _get_nlp()
            # Names appear almost always in the header — cap NER to the
            # first 4000 chars so we're not running NER over entire
            # multi-page resumes just to find a name in the first line.
            head = redacted[:4000]
            doc = nlp(head)

            for ent in reversed(doc.ents):
                if ent.label_ == "PERSON":
                    head = head[:ent.start_char] + "[REDACTED_NAME]" + head[ent.end_char:]
            redacted = head + redacted[4000:]

        except Exception as e:
            logger.error(f"[PII] spaCy NER redaction failed, continuing with regex-only redaction: {e}")

    return redacted


def redaction_summary(original: str, redacted: str) -> dict:
    """Diagnostic counts only — never logs the PII values themselves."""
    return {
        "emails_redacted":   redacted.count('[REDACTED_EMAIL]'),
        "phones_redacted":   redacted.count('[REDACTED_PHONE]'),
        "names_redacted":    redacted.count('[REDACTED_NAME]'),
        "linkedin_redacted": redacted.count('[REDACTED_LINKEDIN]'),
        "github_redacted":   redacted.count('[REDACTED_GITHUB]'),
        "length_before":     len(original),
        "length_after":      len(redacted),
    }