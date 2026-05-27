AI-Powered Recruitment & Career Portal
A comprehensive, full-stack Applicant Tracking System (ATS) designed to modernize and streamline the recruitment pipeline. By leveraging local LLMs (Ollama), this platform automates job description generation and candidate shortlisting, significantly reducing manual HR overhead.

Built with a Django REST Framework backend and a React frontend, featuring strict Role-Based Access Control (RBAC) to manage complex hiring workflows securely.

✨ Key Features
Role-Based Workflows: Custom dashboards and permissions for Employees, Recruiters, HR, and Junior HR.
AI Job Description Generation: Employees can prompt the built-in AI (Ollama/Llama3) to instantly generate professional, tailored Job Descriptions.
AI Resume Shortlisting: Recruiters can upload candidate PDFs; the AI automatically parses the resume against the JD and calculates a match score to shortlist candidates.
End-to-End Hiring Pipeline: Seamless flow from JD creation → Admin Approval → Candidate Sourcing → Interview Scheduling.
Interview Scheduling & Logging: Integrated email notifications (Mailtrap) and calendar tracking for HR teams.
Secure Authentication: JWT-based authentication with robust access control.
🛠️ Tech Stack
Backend:

Django & Django REST Framework
SimpleJWT (Authentication)
SQLite (Development)
Ollama / Llama3 (Local AI Inference)
python-dotenv (Environment Management)
Frontend:

React.js
Modern Dark UI
⚙️ System Workflow
Employee requests a new job role and uses AI to generate the Job Description.
Admin reviews and approves the job request.
Recruiter sources candidates and uploads their PDF resumes. The AI analyzes the resume against the JD and auto-shortlists top candidates.
HR / Junior HR reviews shortlisted candidates and schedules interviews with automated email logging.
