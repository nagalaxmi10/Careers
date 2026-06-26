# Careers — AI-Powered HR Recruitment Platform

An intelligent Applicant Tracking System (ATS) built to modernize the end-to-end recruitment pipeline. By leveraging local LLMs (Ollama/LLaMA 3), ChromaDB vector search, and Microsoft SharePoint via Power Automate, this platform automates resume screening, candidate shortlisting, and recruitment analytics — significantly reducing manual HR overhead.

Built with a Django REST Framework backend and a React frontend, featuring strict Role-Based Access Control (RBAC) to manage complex hiring workflows securely.

---

## System Architecture

| Layer | Technology |
|---|---|
| Frontend | React.js (Vite) · Custom Dark UI |
| Backend | Django REST Framework · SimpleJWT Authentication |
| AI Engine | Ollama (LLaMA 3) — local NLP inference |
| Vector Store | ChromaDB + nomic-embed-text embeddings |
| PII Protection | spaCy NER + regex redaction pipeline |
| SharePoint | Microsoft Power Automate (Power Platform) |
| Database | SQLite (dev) · PostgreSQL (production-ready) |
| Email | Mailtrap (safe SMTP testing) |

---

## Core Features & Workflows

### Resume Pool Architecture
- Resumes are uploaded into a **job-agnostic pool** — not tied to any specific JD at upload time
- Each resume is **PII-redacted** (name, email, phone, LinkedIn, GitHub stripped via spaCy NER) before being sent to the LLM or embedded into ChromaDB
- Original PII is extracted separately and saved to the database — the LLM never sees it
- Pool resumes are embedded into ChromaDB using `nomic-embed-text` for semantic search

### AI Screening Pipeline
- **Vector pre-filter**: ChromaDB finds the top-N most semantically similar resumes to a JD before Ollama runs — skips irrelevant candidates entirely
- **Keyword pre-filter**: Resumes with zero skill overlap against the JD skip Ollama entirely
- **Parallel LLM scoring**: `ThreadPoolExecutor` runs up to 3 Ollama calls simultaneously
- **Weighted ATS score**: 50% LLM relevance + 30% keyword match + 20% experience match
- **Threshold-aware re-screening**: Changing the shortlist threshold (60/70/80%) instantly re-applies to existing scores without re-running the LLM
- **Fuzzy skill matching**: Alias dictionary handles variants (e.g. `ml → machine learning`, `tally erp → erp systems`, `reactjs → react`)

### SharePoint Integration
- Shortlisted candidate resumes are automatically posted to Microsoft SharePoint via Power Automate
- Payload: `{ fileName (timestamped), fileContent (base64), SkillSet }` as JSON
- Timestamp prefix on filenames prevents duplicate collisions across interns
- 2-retry logic on upload failures

### End-to-End Recruitment Workflow
1. **Employee** submits a Job Description request (AI-assisted generation available)
2. **Admin** approves/rejects the JD
3. **Recruiter** uploads resumes to the pool (PDF/JPG/PNG, bulk or single)
4. **Recruiter** screens the pool against any approved JD at a chosen threshold
5. Shortlisted candidates' resumes are auto-posted to SharePoint with extracted skills
6. **HR / Junior HR** views shortlisted candidates, schedules interviews, sends automated emails
7. **Analytics** dashboard shows score distribution, shortlist rate per job, top skills

### Role-Based Dashboards
| Role | Capabilities |
|---|---|
| Admin | Approve/reject JDs, manage all users, view platform stats |
| Recruiter | Upload to pool, run screening, view shortlist panel, analytics |
| HR | View shortlisted candidates, schedule interviews, send emails |
| Junior HR | View shortlisted candidates, assist with interview scheduling |
| Employee | Submit JD requests, view own profile |

---

## AI Pipeline Detail

```
PDF / Image Upload
      ↓
Text Extraction (PyPDF2 → PyMuPDF → Tesseract OCR fallback)
      ↓
PII Extraction (spaCy NER + regex) → saved to DB
      ↓
PII Redaction → safe text for LLM/embeddings
      ↓
ChromaDB Embedding (nomic-embed-text)
      ↓
[At screening time]
Vector Pre-filter (ChromaDB similarity search)
      ↓
Keyword Pre-filter (skill overlap check)
      ↓
Ollama LLaMA 3 (parallel, redacted text only)
      ↓
Weighted Score = 50% LLM + 30% Keyword + 20% Experience
      ↓
Shortlist if score ≥ threshold → POST to SharePoint
```

---

## Tech Stack

- **Backend**: Python 3.13 · Django 5 · Django REST Framework · SimpleJWT
- **Frontend**: React 18 · Vite · Chart.js
- **AI / NLP**: Ollama (LLaMA 3) · nomic-embed-text · spaCy (en_core_web_sm)
- **Vector DB**: ChromaDB (persistent)
- **PDF Processing**: PyPDF2 · PyMuPDF (fitz) · Tesseract OCR · python-docx
- **SharePoint**: Microsoft Power Automate · Power Platform REST API
- **Auth**: SimpleJWT (access + refresh tokens)
- **Email**: Django SMTP · Mailtrap

---

## Setup & Installation

### Prerequisites
- Python 3.10+
- Node.js 18+
- [Ollama](https://ollama.ai) installed and running
- Tesseract OCR installed

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt --break-system-packages

# Pull required Ollama models
ollama pull llama3
ollama pull nomic-embed-text

# Download spaCy model
python -m spacy download en_core_web_sm

# Environment variables
cp .env.example .env
# Fill in SHAREPOINT_GET_URL, SHAREPOINT_POST_URL, SHAREPOINT_GET_SIG, SHAREPOINT_POST_SIG

# Run migrations
python manage.py migrate
python manage.py createsuperuser

# Start server
python manage.py runserver
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## Environment Variables

```env
SHAREPOINT_GET_URL=<Power Automate GET flow URL>
SHAREPOINT_GET_SIG=<GET flow signature>
SHAREPOINT_POST_URL=<Power Automate POST flow URL>
SHAREPOINT_POST_SIG=<POST flow signature>
```

---

## Developer

Built by **Gummadaxmi Naga Laxmi** during an AI/ML Engineering internship at Synergycom, Hyderabad.  
B.Tech in Artificial Intelligence & Machine Learning — Malla Reddy University, 2026.
