import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from django.conf import settings
from .models import EmailLog


def get_email_log():
    """Return email log from database (persists across restarts)."""
    return EmailLog.objects.all().values("id", "to", "subject", "body", "status", "error", "sent_at")


def _log_email(to, subject, body, status, error=None):
    """Save email log to database."""
    EmailLog.objects.create(
        to=to,
        subject=subject,
        body=body,
        status=status,
        error=error or "",
    )


def send_interview_email(candidate_email, candidate_name, job_title,
                          interview_date, interview_time, mode,
                          meeting_link=None, location=None, notes=None):
    """
    Send interview invitation email to candidate.
    Uses DUMMY mode by default (logs email without sending).
    Set EMAIL_BACKEND_LIVE=True in settings to actually send via SMTP.
    """
    subject = f"Interview Invitation — {job_title}"

    mode_line = (
        f"Mode: Online\nMeeting Link: {meeting_link or 'Will be shared shortly'}"
        if mode == "ONLINE"
        else f"Mode: In Person\nLocation: {location or 'Will be shared shortly'}"
    )

    body = f"""Dear {candidate_name or 'Candidate'},

We are pleased to invite you for an interview for the position of {job_title}.

Interview Details:
──────────────────
Date: {interview_date}
Time: {interview_time}
{mode_line}
{f'Notes: {notes}' if notes else ''}

Please confirm your availability by replying to this email.

We look forward to speaking with you.

Best regards,
HR Team
Employee Portal
"""

    live = getattr(settings, "EMAIL_BACKEND_LIVE", False)

    if not live:
        _log_email(
            to=candidate_email,
            subject=subject,
            body=body,
            status="DUMMY",
        )
        print(f"[DUMMY EMAIL] To: {candidate_email} | Subject: {subject}")
        return True

    try:
        msg = MIMEMultipart()
        msg["From"]    = settings.EMAIL_HOST_USER
        msg["To"]      = candidate_email
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain"))

        with smtplib.SMTP(settings.EMAIL_HOST, settings.EMAIL_PORT) as server:
            server.starttls()
            server.login(settings.EMAIL_HOST_USER, settings.EMAIL_HOST_PASSWORD)
            server.send_message(msg)

        _log_email(to=candidate_email, subject=subject, body=body, status="SENT")
        return True

    except Exception as e:
        _log_email(to=candidate_email, subject=subject, body=body, status="FAILED", error=str(e))
        print(f"[EMAIL ERROR] {e}")
        return False