import requests
import base64
import os
import tempfile

# ── GET endpoint (fetch/download files from SharePoint) ───────────────────────
POWER_PLATFORM_GET_URL = (
    "https://default68eb45d8bd6c4853b16dc49ccc82bf.59.environment.api.powerplatform.com:443"
    "/powerautomate/automations/direct/workflows/c5f0215ef68e40c3affc90dbf04ea86c"
    "/triggers/manual/paths/invoke"
)

# ── POST endpoint (upload file + skillset back to SharePoint) ─────────────────
POWER_PLATFORM_POST_URL = (
    "https://default68eb45d8bd6c4853b16dc49ccc82bf.59.environment.api.powerplatform.com:443"
    "/powerautomate/automations/direct/workflows/ae7c385a5b8044dca0afd4a85870b395"
    "/triggers/manual/paths/invoke"
)

POWER_PLATFORM_GET_PARAMS = {
    "api-version": "1",
    "sp": "/triggers/manual/run",
    "sv": "1.0",
    "sig": "_SKgs3CHgs5y1aS1wRX29FATgOO0KgjY4DEPqPHLBBA",
}

POWER_PLATFORM_POST_PARAMS = {
    "api-version": "1",
    "sp": "/triggers/manual/run",
    "sv": "1.0",
    "sig": "zMCqyUQPvwaqFva-qTuh1uN-N1khRXo8aOFv-BP6isM",
}


def get_all_filenames():
    try:
        response = requests.post(
            POWER_PLATFORM_GET_URL,
            params={**POWER_PLATFORM_GET_PARAMS, "fileName": "All"},
            timeout=30
        )
        response.raise_for_status()
        data = response.json()
        filenames = [f for f in data if isinstance(f, str) and f.lower().endswith(".pdf")]
        return filenames
    except Exception as e:
        print(f"[SharePoint] Failed to fetch filenames: {e}")
        return []


def download_resume(filename):
    try:
        response = requests.post(
            POWER_PLATFORM_GET_URL,
            params={**POWER_PLATFORM_GET_PARAMS, "fileName": filename},
            timeout=60
        )
        response.raise_for_status()
        return response.content
    except Exception as e:
        print(f"[SharePoint] Failed to download {filename}: {e}")
        return None


def post_screening_result(filename, skillset):
    try:
        pdf_bytes = download_resume(filename)
        if not pdf_bytes:
            print(f"[SharePoint] Could not download {filename} for posting back.")
            return False

        response = requests.post(
            POWER_PLATFORM_POST_URL,
            params=POWER_PLATFORM_POST_PARAMS,
            files={"fileContent": (filename, pdf_bytes, "application/pdf")},
            data={"fileName": filename, "SkillSet": skillset},
            timeout=60
        )
        response.raise_for_status()
        print(f"[SharePoint] Posted skillset for {filename}: {skillset}")
        return True

    except Exception as e:
        print(f"[SharePoint] Failed to post skillset for {filename}: {e}")
        return False
def upload_resume_to_sharepoint(filename, file_bytes, skillset="", retries=2):
    last_error = None
    for attempt in range(1, retries + 2):  # 1 initial + 2 retries = 3 total attempts
        try:
            content_b64 = base64.b64encode(file_bytes).decode("utf-8")
            payload = {
                "fileName":    filename,
                "fileContent": content_b64,
                "SkillSet":    skillset,
            }
            response = requests.post(
                POWER_PLATFORM_POST_URL,
                params=POWER_PLATFORM_POST_PARAMS,
                json=payload,
                timeout=60
            )
            response.raise_for_status()
            print(f"[SharePoint] Uploaded {filename} with skills: {skillset}")
            return True
        except Exception as e:
            last_error = e
            print(f"[SharePoint] Attempt {attempt} failed for {filename}: {e}")

    print(f"[SharePoint] All attempts failed for {filename}: {last_error}")
    return False

def save_pdf_to_tempfile(pdf_bytes, filename):
    suffix = os.path.splitext(filename)[1] or ".pdf"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tmp.write(pdf_bytes)
    tmp.close()
    return tmp.name