import { useEffect, useState } from "react"
import MyProfile from "../components/MyProfile"
import { useNavigate } from "react-router-dom"
import API from "../api/axios"

const toSkillArray = (skills) => {
  if (!skills) return []
  if (Array.isArray(skills)) return skills
  if (typeof skills === "string") return skills.split(",").map(s => s.trim()).filter(Boolean)
  return []
}

const toArray = (data) => (Array.isArray(data) ? data : data?.results ?? [])

const BAD_NAMES = new Set([
  "professional summary", "summary", "objective", "career objective",
  "education", "experience", "work experience", "professional experience",
  "skills", "technical skills", "certifications", "projects",
  "achievements", "languages", "interests", "references",
  "contact information", "personal details", "profile",
  "key skills", "core competencies", "qualifications",
  "unknown", "unknown candidate", "n/a",
])

function cleanDisplayName(name, email, id) {
  if (!name || !name.trim() || BAD_NAMES.has(name.trim().toLowerCase())) {
    name = ""
  }
  if (!name && email && email.includes("@")) {
    name = email.split("@")[0].replace(/[._]/g, " ").replace(/\s+/g, " ").trim()
    name = name.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ")
  }
  return name || `Applicant #${id}`
}

const C = {
  dark:"#0a0f1e", mid:"#162040", card:"#1a2a4a",
  accent:"#4f8ef7", text:"#e8f0fe", muted:"#7a94c1", border:"#1f3460",
}

export default function RecruiterDashboard() {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState([])
  const [resumes, setResumes] = useState({})
  const [selectedJob, setSelectedJob] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState("")
  const [tab, setTab] = useState("jobs")
  const [stats, setStats] = useState({})

  const loadJobs = async () => {
    try {
      const r = await API.get("jobs/")
      setJobs(toArray(r.data))
    } catch (err) { console.log(err) }
  }

  const loadResumes = async (jobId) => {
    try {
      const r = await API.get(`recruitment/resumes/?job_request=${jobId}`)
      setResumes(prev => ({ ...prev, [jobId]: toArray(r.data) }))
    } catch (err) { console.log(err) }
  }

  useEffect(() => { 
    loadJobs()
    const loadStats = async () => {
      try {
        const r = await API.get("accounts/stats/")
        setStats(r.data)
      } catch (err) { console.log(err) }
    }
    loadStats()
  }, [])

  const handleJobClick = (job) => {
    setSelectedJob(job)
    setTab("resumes")
    loadResumes(job.id)
  }

  const handleUpload = async (e) => {
    const file = e.target.files[0]
    if (!file || !selectedJob) return
    setUploading(true)
    setUploadMsg("")
    try {
      const formData = new FormData()
      formData.append("resume", file)
      formData.append("job_request", selectedJob.id)
      await API.post("recruitment/resumes/", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      })
      setUploadMsg("✓ Resume uploaded and analyzed!")
      loadResumes(selectedJob.id)
      loadJobs()
      setTimeout(() => setUploadMsg(""), 4000)
    } catch (err) {
      setUploadMsg("✗ Upload failed. Try again.")
    } finally {
      setUploading(false)
      e.target.value = ""
    }
  }

  const logout = () => { localStorage.removeItem("token"); navigate("/") }

  const jobResumes = selectedJob ? (resumes[selectedJob.id] || []) : []
  const shortlisted = jobResumes.filter(r => r.is_shortlisted)
  const notShortlisted = jobResumes.filter(r => !r.is_shortlisted)

  return (
    <div style={s.page}>
      <div style={s.sidebar}>
        <div style={s.logo}><div style={s.logoMark}>EP</div><span style={s.logoText}>Portal</span></div>
        <div style={s.sideLabel}>Recruiter</div>
        <nav style={s.nav}>
          <button style={{...s.navBtn, ...(tab==="jobs" ? s.navActive : {})}} onClick={() => setTab("jobs")}>
            <span>📋</span> Job Requests
          </button>
          {selectedJob && (
            <button style={{...s.navBtn, ...(tab==="resumes" ? s.navActive : {})}} onClick={() => setTab("resumes")}>
              <span>📄</span> Resumes
            </button>
          )}
          <button style={{...s.navBtn, ...(tab==="profile" ? s.navActive : {})}} onClick={() => setTab("profile")}>
            <span>👤</span> My Profile
          </button>
        </nav>
        <button style={s.logoutBtn} onClick={logout}>Sign out</button>
      </div>

      <div style={s.main}>
        {tab === "profile" && (
          <MyProfile />
        )}

        {tab === "jobs" && <>
          <div style={s.header}>
            <h1 style={s.pageTitle}>Approved Job Requests</h1>
            <p style={s.pageSub}>Click a job to upload and manage resumes</p>
          </div>

          {Object.keys(stats).length > 0 && (
            <div style={{display:"flex", gap:"16px", marginBottom:"2rem", flexWrap:"wrap"}}>
              {Object.entries(stats).map(([key, value]) => {
                const labels = {
                  uploaded_by_me: "📄 Resumes Uploaded",
                  shortlisted_mine: "⭐ Shortlisted (Yours)",
                  approved_jobs: "✅ Approved Jobs"
                }
                return (
                  <div key={key} style={{
                    background: C.mid, border: `1px solid ${C.border}`, borderRadius: "16px",
                    padding: "1.25rem 1.5rem", flex: "1 1 180px", display: "flex",
                    flexDirection: "column", gap: "4px"
                  }}>
                    <span style={{color: C.muted, fontSize: "13px"}}>{labels[key] || key}</span>
                    <span style={{color: C.text, fontSize: "28px", fontWeight: "700"}}>{value}</span>
                  </div>
                )
              })}
            </div>
          )}

          <div style={s.list}>
            {jobs.length === 0 && <div style={s.empty}>No approved job requests yet.</div>}
            {jobs.map(job => (
              <div key={job.id} style={{...s.jobCard, cursor:"pointer"}} onClick={() => handleJobClick(job)}>
                <div style={s.jobLeft}>
                  <h3 style={s.jobTitle}>{job.title}</h3>
                  <p style={s.jobDesc}>{job.description}</p>
                  <div style={s.jobMeta}>
                    {job.department && <span style={s.tag}>🏢 {job.department}</span>}
                    {job.experience_required > 0 && <span style={s.tag}>💼 {job.experience_required} yrs exp</span>}
                    {job.vacancies > 0 && <span style={s.tag}>👥 {job.vacancies} vacancies</span>}
                  </div>
                  <div style={s.skillsRow}>
                    {job.skills_required && job.skills_required.split(",").map((sk, i) => (
                      <span key={i} style={s.skillTag}>{sk.trim()}</span>
                    ))}
                  </div>
                </div>
                <div style={s.jobStats}>
                  <div style={s.statPill}>{job.resume_count || 0} resumes</div>
                  <div style={{...s.statPill, background:"#0f2d1f", color:"#6ee7b7"}}>{job.shortlisted_count || 0} shortlisted</div>
                </div>
              </div>
            ))}
          </div>
        </>}

        {tab === "resumes" && selectedJob && <>
          <div style={s.header}>
            <button style={s.backBtn} onClick={() => setTab("jobs")}>← Back</button>
            <h1 style={s.pageTitle}>{selectedJob.title}</h1>
            <p style={s.pageSub}>Upload resumes — AI will extract skills and auto-shortlist at ≥65% match</p>
          </div>

          <div style={s.uploadCard}>
            <h2 style={s.cardTitle}>Upload Resume</h2>
            <p style={s.cardSub}>Required skills: <strong style={{color: C.accent}}>{selectedJob.skills_required}</strong></p>
            <label style={{...s.uploadBtn, opacity: uploading ? 0.7 : 1}}>
              {uploading ? "Analyzing with AI..." : "📎 Choose file to upload"}
              <input type="file" style={{display:"none"}} onChange={handleUpload} disabled={uploading} />
            </label>
            {uploadMsg && (
              <div style={{...s.msg, ...(uploadMsg.startsWith("✓") ? s.msgSuccess : s.msgError)}}>
                {uploadMsg}
              </div>
            )}
          </div>

          <h2 style={s.sectionTitle}>✅ Shortlisted ({shortlisted.length})</h2>
          <div style={s.list}>
            {shortlisted.length === 0 && <div style={s.empty}>No shortlisted candidates yet.</div>}
            {shortlisted.map(r => <ResumeCard key={r.id} resume={r} />)}
          </div>

          <h2 style={{...s.sectionTitle, marginTop:"2rem"}}>❌ Not Shortlisted ({notShortlisted.length})</h2>
          <div style={s.list}>
            {notShortlisted.length === 0 && <div style={s.empty}>None yet.</div>}
            {notShortlisted.map(r => <ResumeCard key={r.id} resume={r} />)}
          </div>
        </>}
      </div>
    </div>
  )
}

function ResumeCard({ resume }) {
  const score = resume.match_percentage || 0
  const scoreColor = score >= 65 ? "#6ee7b7" : score >= 40 ? "#fbbf24" : "#f87171"
  const displayName = cleanDisplayName(resume.candidate_name, resume.email, resume.id)
  const skills = toSkillArray(resume.skills)
  const experience = resume.experience || 0

  // ✅ View Original Resume - with PDF Blob fix
  const handleViewResume = async (id) => {
    try {
      const response = await API.get(`recruitment/resumes/${id}/download/`, {
        responseType: 'blob'
      });
      const fileURL = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      window.open(fileURL);
    } catch (err) {
      alert("Could not load resume file.");
    }
  }

  return (
    <div style={rs.card}>
      <div style={rs.left}>
        <div style={rs.avatar}>{displayName[0].toUpperCase()}</div>
        <div style={{flex:1}}>
          <p style={rs.name}>{displayName}</p>
          {resume.email
            ? <p style={rs.email}>✉ {resume.email}</p>
            : <p style={rs.missing}>Email not extracted</p>
          }
          {resume.phone
            ? <p style={rs.email}>📞 {resume.phone}</p>
            : <p style={rs.missing}>Phone not extracted</p>
          }
          <div style={rs.skills}>
            {skills.length > 0
              ? skills.slice(0, 6).map((sk, i) => (
                  <span key={i} style={rs.skill}>{sk}</span>
                ))
              : <span style={rs.missingSkill}>No skills extracted</span>
            }
          </div>
          <button 
            onClick={() => handleViewResume(resume.id)} 
            style={rs.viewResumeBtn}
          >
            📄 View Original Resume
          </button>
        </div>
      </div>
      <div style={rs.right}>
        <div style={{...rs.score, color: scoreColor, borderColor: scoreColor}}>
          {score.toFixed(1)}%
        </div>
        <p style={rs.scoreLabel}>match</p>
        <p style={rs.exp}>
          💼 {experience > 0 ? `${experience} yr${experience === 1 ? "" : "s"} exp` : "Fresher"}
        </p>
      </div>
    </div>
  )
}

const rs = {
  card: { background:"#1a2a4a", borderRadius:"16px", padding:"1.25rem 1.5rem", display:"flex", justifyContent:"space-between", alignItems:"flex-start", border:"1px solid #1f3460" },
  left: { display:"flex", gap:"1rem", flex:1 },
  avatar: { width:"42px", height:"42px", background:"#4f8ef7", borderRadius:"10px", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:"700", fontSize:"16px", color:"#fff", flexShrink:0 },
  name: { fontWeight:"600", color:"#e8f0fe", margin:"0 0 2px", fontSize:"15px" },
  email: { color:"#7a94c1", fontSize:"12px", margin:"0 0 2px" },
  missing: { color:"#3d5a8a", fontSize:"12px", margin:"0 0 2px" },
  skills: { display:"flex", flexWrap:"wrap", gap:"6px" },
  skill: { fontSize:"11px", background:"#162040", color:"#7a94c1", padding:"3px 8px", borderRadius:"20px", border:"1px solid #1f3460" },
  missingSkill: { fontSize:"11px", color:"#3d5a8a", padding:"3px 8px", borderRadius:"20px" },
  right: { display:"flex", flexDirection:"column", alignItems:"center", gap:"4px", flexShrink:0, marginLeft:"1rem" },
  score: { fontSize:"24px", fontWeight:"700", border:"2px solid", borderRadius:"50%", width:"60px", height:"60px", display:"flex", alignItems:"center", justifyContent:"center" },
  scoreLabel: { color:"#7a94c1", fontSize:"11px", margin:0 },
  exp: { color:"#7a94c1", fontSize:"11px", margin:0 },
  viewResumeBtn: { background:"none", border:"1px solid #1f3460", color:"#4f8ef7", borderRadius:"6px", padding:"4px 10px", fontSize:"12px", cursor:"pointer", marginTop:"8px", fontFamily:"inherit" },
}

const s = {
  page: { display:"flex", minHeight:"100vh", background:"#0a0f1e", fontFamily:"'Plus Jakarta Sans', sans-serif" },
  sidebar: { width:"240px", background:"#162040", display:"flex", flexDirection:"column", padding:"2rem 1.25rem", gap:"16px", position:"sticky", top:0, height:"100vh", borderRight:"1px solid #1f3460" },
  logo: { display:"flex", alignItems:"center", gap:"10px" },
  logoMark: { width:"36px", height:"36px", background:"#4f8ef7", borderRadius:"8px", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:"900", fontSize:"12px", color:"#fff", fontFamily:"monospace" },
  logoText: { color:"#e8f0fe", fontWeight:"700", fontSize:"15px" },
  sideLabel: { fontSize:"11px", color:"#7a94c1", letterSpacing:"2px", textTransform:"uppercase" },
  nav: { display:"flex", flexDirection:"column", gap:"4px", flex:1 },
  navBtn: { display:"flex", alignItems:"center", gap:"10px", background:"none", border:"none", color:"#7a94c1", borderRadius:"10px", padding:"11px 14px", fontSize:"13px", cursor:"pointer", fontFamily:"inherit", textAlign:"left" },
  navActive: { background:"#1a2a4a", color:"#e8f0fe", borderLeft:"3px solid #4f8ef7" },
  logoutBtn: { background:"none", border:"1px solid #1f3460", color:"#7a94c1", borderRadius:"10px", padding:"10px", fontSize:"13px", cursor:"pointer", fontFamily:"inherit" },
  main: { flex:1, padding:"2.5rem 3rem", overflowY:"auto" },
  header: { marginBottom:"2rem" },
  pageTitle: { fontSize:"26px", fontWeight:"700", color:"#e8f0fe", margin:"0 0 4px" },
  pageSub: { color:"#7a94c1", fontSize:"14px", margin:0 },
  backBtn: { background:"none", border:"1px solid #1f3460", color:"#7a94c1", borderRadius:"8px", padding:"6px 14px", cursor:"pointer", fontSize:"13px", fontFamily:"inherit", marginBottom:"1rem", display:"block" },
  list: { display:"flex", flexDirection:"column", gap:"12px" },
  empty: { textAlign:"center", color:"#7a94c1", padding:"2rem", background:"#162040", borderRadius:"16px", border:"1px solid #1f3460", fontSize:"14px" },
  jobCard: { background:"#162040", borderRadius:"16px", padding:"1.5rem", display:"flex", justifyContent:"space-between", alignItems:"flex-start", border:"1px solid #1f3460", gap:"1rem" },
  jobLeft: { flex:1 },
  jobTitle: { fontSize:"16px", fontWeight:"600", color:"#e8f0fe", margin:"0 0 6px" },
  jobDesc: { color:"#7a94c1", fontSize:"13px", margin:"0 0 10px", lineHeight:1.5 },
  jobMeta: { display:"flex", gap:"8px", flexWrap:"wrap", marginBottom:"8px" },
  tag: { fontSize:"12px", color:"#7a94c1", background:"#1a2a4a", padding:"3px 10px", borderRadius:"20px", border:"1px solid #1f3460" },
  skillsRow: { display:"flex", gap:"6px", flexWrap:"wrap" },
  skillTag: { fontSize:"11px", color:"#4f8ef7", background:"#0f1e3a", padding:"3px 8px", borderRadius:"20px", border:"1px solid #1f3460" },
  jobStats: { display:"flex", flexDirection:"column", gap:"8px", flexShrink:0 },
  statPill: { fontSize:"12px", background:"#1a2a4a", color:"#7a94c1", padding:"5px 12px", borderRadius:"20px", border:"1px solid #1f3460", textAlign:"center" },
  uploadCard: { background:"#162040", borderRadius:"16px", padding:"1.5rem", marginBottom:"2rem", border:"1px solid #1f3460" },
  cardTitle: { fontSize:"16px", fontWeight:"600", color:"#e8f0fe", margin:"0 0 6px" },
  cardSub: { color:"#7a94c1", fontSize:"13px", margin:"0 0 1rem" },
  uploadBtn: { display:"inline-block", padding:"12px 24px", background:"#4f8ef7", color:"#fff", borderRadius:"10px", fontSize:"14px", fontWeight:"600", cursor:"pointer" },
  msg: { marginTop:"1rem", padding:"10px 14px", borderRadius:"8px", fontSize:"13px" },
  msgSuccess: { background:"#0f2d1f", border:"1px solid #1a5c3a", color:"#6ee7b7" },
  msgError: { background:"#2d0f0f", border:"1px solid #5c1a1a", color:"#fca5a5" },
  sectionTitle: { fontSize:"16px", fontWeight:"600", color:"#e8f0fe", margin:"0 0 1rem" },
}