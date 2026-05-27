-> AI-Powered Recruitment & Career Portal
    An intelligent Applicant Tracking System (ATS) built to modernize the recruitment pipeline. 
    By leveraging local LLMs (Ollama/Llama3), this platform automates Job Description generation and candidate resume 
    shortlisting, significantly reducing manual HR overhead.

    Built with a Django REST Framework backend and a React frontend, featuring strict Role-Based Access Control (RBAC) 
    to manage complex hiring workflows securely.

-> System Architecture
    Frontend: React.js (Vite) + TailwindCSS (Dark UI)
    Backend: Django REST Framework + SimpleJWT Authentication
    AI Engine: Ollama (Llama3) for local NLP inference
    Database: SQLite (Development) / PostgreSQL (Production Ready)
    Email Service: Mailtrap (Safe SMTP testing)
-> Core Features & Workflows
    AI Job Description Generation: Employees can prompt the built-in AI to instantly generate professional, 
                                 tailored Job Descriptions.
    Admin Approval Pipeline      : Strict workflow where JD requests must be approved by Admin before going live.
    AI Resume Shortlisting       : Recruiters upload candidate PDFs; the AI automatically parses the resume against the JD and 
                                 calculates a match score to shortlist candidates.
    End-to-End Scheduling        : HR/Junior HR can schedule interviews with automated email logging.
    Role-Based Dashboards        : Custom views and permissions for Employees, Recruiters, HR, and Admins.
