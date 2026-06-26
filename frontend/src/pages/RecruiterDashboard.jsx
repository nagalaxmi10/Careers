import { useEffect, useState, useRef } from "react"
import MyProfile from "../components/MyProfile"
import { useNavigate } from "react-router-dom"
import API from "../api/axios"
import FitSummary from "../components/FitSummary"
import { toast } from "../components/Toast"

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

const THRESHOLD_OPTIONS = [60, 70, 80]

export default function RecruiterDashboard() {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState([])
  const [pool, setPool] = useState([])
  const [poolLoading, setPoolLoading] = useState(false)
  const [tab, setTab] = useState("jobs")
  const [stats, setStats] = useState({})

  const [poolUploading, setPoolUploading] = useState(false)
  const [poolUploadMsg, setPoolUploadMsg] = useState("")

  const [screeningJob, setScreeningJob] = useState(null)
  const [selectedThreshold, setSelectedThreshold] = useState(70)
  const [screening, setScreening] = useState(false)
  const [screeningResults, setScreeningResults] = useState(null)
  const [screeningMsg, setScreeningMsg] = useState("")

  const [analytics, setAnalytics] = useState(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [shortlistJob, setShortlistJob] = useState(null)
  const [shortlistData, setShortlistData] = useState([])
  const [shortlistLoading, setShortlistLoading] = useState(false)
  const loadJobs = async () => {
    try {
      const r = await API.get("jobs/")
      setJobs(toArray(r.data))
    } catch (err) { console.log(err) }
  }

  const loadPool = async () => {
    setPoolLoading(true)
    try {
      const r = await API.get("recruitment/resumes/")
      setPool(toArray(r.data))
    } catch (err) { console.log(err) }
    finally { setPoolLoading(false) }
  }

  const loadAnalytics = async () => {
    setAnalyticsLoading(true)
    try {
      const r = await API.get("recruitment/analytics/")
      setAnalytics(r.data)
    } catch (err) { console.log(err) }
    finally { setAnalyticsLoading(false) }
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
const loadShortlist = async (job) => {
  setShortlistJob(job)
  setShortlistLoading(true)

  try {
    const res = await API.get(`recruitment/jobs/${job.id}/shortlist/`)
    setShortlistData(res.data.shortlisted || [])
  } catch (err) {
    console.log(err)
    toast.error("Failed to load shortlist")
    setShortlistData([])
  } finally {
    setShortlistLoading(false)
  }
}
  const handlePoolUpload = async (e) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setPoolUploading(true)
    setPoolUploadMsg(`Uploading ${files.length} file(s) to the pool...`)
    try {
      const formData = new FormData()
      for (let i = 0; i < files.length; i++) formData.append("files", files[i])
      const res = await API.post("recruitment/bulk-upload/", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      })
      setPoolUploadMsg(`✓ ${res.data.message}`)
      loadPool()
      setTimeout(() => setPoolUploadMsg(""), 5000)
    } catch (err) {
      setPoolUploadMsg(`✗ ${err.response?.data?.error || "Upload failed."}`)
    } finally {
      setPoolUploading(false)
      e.target.value = ""
    }
  }

  const openScreeningModal = (job) => {
    setScreeningJob(job)
    setSelectedThreshold(70)
    setScreeningResults(null)
    setScreeningMsg("")
  }

  const closeScreeningModal = () => {
    setScreeningJob(null)
  }

  const handleRunScreening = async () => {
    if (!screeningJob) return
    setScreening(true)
    setScreeningMsg(`⏳ Screening pool against "${screeningJob.title}" at ${selectedThreshold}%...`)
    setScreeningResults(null)
    try {
      const res = await API.post("recruitment/screen-pool/", {
        job_request: screeningJob.id,
        threshold: selectedThreshold,
      })
      setScreeningMsg(`✓ ${res.data.message}`)
      setScreeningResults(res.data.shortlisted)
      loadJobs()
    } catch (err) {
      setScreeningMsg(`✗ ${err?.response?.data?.error || "Screening failed."}`)
    } finally {
      setScreening(false)
    }
  }

  const logout = () => {
    localStorage.removeItem("token")
    localStorage.removeItem("refresh")
    navigate("/")
  }

  return (
    <div style={s.page}>
      <div style={s.sidebar}>
        <div style={s.logo}><div style={s.logoMark}>EP</div><span style={s.logoText}>Portal</span></div>
        <div style={s.sideLabel}>Recruiter</div>
        <nav style={s.nav}>
          <button style={{...s.navBtn, ...(tab==="jobs" ? s.navActive : {})}} onClick={() => setTab("jobs")}>
            <span>📋</span> Job Requests
          </button>
          <button style={{...s.navBtn, ...(tab==="pool" ? s.navActive : {})}} onClick={() => { setTab("pool"); loadPool() }}>
            <span>🗂️</span> Resume Pool
          </button>
          <button style={{...s.navBtn, ...(tab==="analytics" ? s.navActive : {})}} onClick={() => { setTab("analytics"); loadAnalytics() }}>
            <span>📊</span> Analytics
          </button>
          <button style={{...s.navBtn, ...(tab==="profile" ? s.navActive : {})}} onClick={() => setTab("profile")}>
            <span>👤</span> My Profile
          </button>
        </nav>
        <button style={s.logoutBtn} onClick={logout}>Sign out</button>
      </div>

      <div style={s.main}>
        {tab === "profile" && <MyProfile />}

        {tab === "analytics" && (
          <div>
            <div style={s.header}>
              <h1 style={s.pageTitle}>Analytics</h1>
              <p style={s.pageSub}>Your recruitment performance at a glance</p>
            </div>
            {analyticsLoading && <div style={s.empty}>Loading analytics...</div>}
            {!analyticsLoading && analytics && <RecruiterAnalytics data={analytics} />}
            {!analyticsLoading && !analytics && (
              <div style={s.empty}>No data yet. Upload some resumes first.</div>
            )}
          </div>
        )}

        {tab === "pool" && (
          <div>
            <div style={s.header}>
              <h1 style={s.pageTitle}>Resume Pool</h1>
              <p style={s.pageSub}>All uploaded resumes live here, independent of any job. Screen them against a job from the Job Requests tab.</p>
            </div>

            <div style={s.uploadCard}>
              <h2 style={s.cardTitle}>Add Resumes to the Pool</h2>
              <p style={s.cardSub}>No job selection needed — these can be screened against any job, any time.</p>
              <div style={{display:"flex", gap:"12px", alignItems:"center"}}>
                <label style={{...s.uploadBtn, opacity: poolUploading ? 0.7 : 1}}>
                  {poolUploading ? "⏳ Uploading..." : "📤 Select Files"}
                  <input type="file" style={{display:"none"}} multiple accept=".pdf,.jpg,.jpeg,.png" onChange={handlePoolUpload} disabled={poolUploading} />
                </label>
                <span style={{color:C.muted, fontSize:"12px"}}>Supports PDF, JPG, JPEG, PNG</span>
              </div>
              {poolUploadMsg && (
                <div style={{...s.msg, ...(poolUploadMsg.startsWith("✓") ? s.msgSuccess : s.msgError), marginTop:"1rem"}}>
                  {poolUploadMsg}
                </div>
              )}
            </div>

            <h2 style={s.sectionTitle}>Pool ({pool.length})</h2>
            {poolLoading && <div style={s.empty}>Loading pool...</div>}
            {!poolLoading && pool.length === 0 && <div style={s.empty}>No resumes in the pool yet.</div>}
            <div style={s.list}>
              {pool.map(r => <PoolResumeCard key={r.id} resume={r} onDelete={loadPool} />)}
            </div>
          </div>
        )}

        {tab === "jobs" && <>
          <div style={s.header}>
            <h1 style={s.pageTitle}>Approved Job Requests</h1>
            <p style={s.pageSub}>Screen the resume pool against any job, at a threshold you choose</p>
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
              <div key={job.id} style={s.jobCard}>
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
  <button
    style={s.screenBtn}
    onClick={() => openScreeningModal(job)}
  >
    🎯 Screen Pool
  </button>

  <button
    style={s.shortlistBtn}
    onClick={() => loadShortlist(job)}
  >
    📋 View Shortlist
  </button>
</div>
              </div>
            ))}
          </div>
        </>}
      </div>

      {/* Screening Modal */}
      {screeningJob && (
        <div style={s.modalOverlay} onClick={closeScreeningModal}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <h2 style={s.cardTitle}>Screen Pool for "{screeningJob.title}"</h2>
            <p style={s.cardSub}>Choose the minimum match score to shortlist a candidate.</p>

            <div style={{display:"flex", gap:"10px", marginBottom:"1.5rem"}}>
              {THRESHOLD_OPTIONS.map(t => (
                <button
                  key={t}
                  onClick={() => setSelectedThreshold(t)}
                  style={{
                    ...s.thresholdBtn,
                    ...(selectedThreshold === t ? s.thresholdBtnActive : {})
                  }}
                >
                  {t}%
                </button>
              ))}
            </div>

            <div style={{display:"flex", gap:"10px"}}>
              <button onClick={closeScreeningModal} style={s.modalCancelBtn} disabled={screening}>
                Cancel
              </button>
              <button onClick={handleRunScreening} style={s.modalConfirmBtn} disabled={screening}>
                {screening ? "⏳ Screening..." : `Run at ${selectedThreshold}%`}
              </button>
            </div>

            {screeningMsg && (
              <div style={{...s.msg, ...(screeningMsg.startsWith("✓") ? s.msgSuccess : s.msgError), marginTop:"1rem"}}>
                {screeningMsg}
              </div>
            )}

            {screeningResults && (
              <div style={{marginTop:"1rem"}}>
                <h3 style={{...s.sectionTitle, fontSize:"14px"}}>✅ Shortlisted ({screeningResults.length})</h3>
                {screeningResults.length === 0 && (
                  <div style={s.empty}>No resumes cleared {selectedThreshold}% for this job.</div>
                )}
                <div style={s.spResults}>
                  {screeningResults.map((r, i) => (
                    <div key={i} style={s.spRow}>
                      <span style={{color:C.text, fontSize:"13px", fontWeight:"600", flex:1}}>{r.candidate}</span>
                      <span style={{color:"#6ee7b7", fontSize:"13px", fontWeight:"700"}}>{r.llm_score?.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {shortlistJob && (
  <div style={s.panelOverlay} onClick={() => setShortlistJob(null)}>
    <div style={s.panel} onClick={e => e.stopPropagation()}>
    
      <h2 style={s.cardTitle}>
        Shortlisted Candidates
      </h2>

      <p style={s.cardSub}>
        {shortlistJob.title}
      </p>

      {shortlistLoading && (
        <div style={s.empty}>
          Loading shortlist...
        </div>
      )}

      {!shortlistLoading &&
        shortlistData.length === 0 && (
          <div style={s.empty}>
            No shortlisted candidates yet.
          </div>
        )}

      {!shortlistLoading &&
        shortlistData.length > 0 && (
          <div style={s.spResults}>
            {shortlistData.map((c) => (
  <div key={c.screening_id} style={s.shortlistRow}>
    <div>
      <div style={{color:C.text, fontWeight:"600"}}>{c.candidate}</div>
      <div style={{color:C.muted, fontSize:"12px"}}>{c.status}</div>
    </div>
    <div style={{textAlign:"right"}}>
      <div style={{color:"#6ee7b7", fontWeight:"700"}}>{c.llm_score?.toFixed(1)}%</div>
      <div style={{color:"#6ee7b7", fontSize:"12px"}}>Shortlisted</div>
    </div>
  </div>
))}
          </div>
        )}

      <button
        style={{
          ...s.modalCancelBtn,
          marginTop: "1rem",
          width: "100%",
        }}
        onClick={() => setShortlistJob(null)}
      >
        Close
      </button>
    </div>
  </div>
)}
    </div>
  )
}

// ── Pool Resume Card ──────────────────────────────────────────────────────────
function PoolResumeCard({ resume, onDelete }) {
  const displayName = cleanDisplayName(resume.candidate_name, resume.email, resume.id)
  const skills = toSkillArray(resume.skills)
  const experience = resume.experience || 0

  const handleDelete = async () => {
    if (!window.confirm(`Delete resume for ${displayName}? This removes it from the pool and all screening history. This cannot be undone.`)) return
    try {
      await API.delete(`recruitment/resumes/${resume.id}/`)
      toast.success("Resume removed from pool")
      if (onDelete) onDelete()
    } catch (err) {
      toast.error("Failed to delete resume.")
    }
  }

  return (
    <div style={rs.card}>
      <div style={rs.left}>
        <div style={rs.avatar}>{displayName[0].toUpperCase()}</div>
        <div style={{flex:1}}>
          <p style={rs.name}>{displayName}</p>
          {resume.email ? <p style={rs.email}>✉ {resume.email}</p> : <p style={rs.missing}>Email not extracted</p>}
          {resume.phone ? <p style={rs.email}>📞 {resume.phone}</p> : <p style={rs.missing}>Phone not extracted</p>}
          <div style={rs.skills}>
            {skills.length > 0
              ? skills.slice(0, 6).map((sk, i) => <span key={i} style={rs.skill}>{sk}</span>)
              : <span style={rs.missingSkill}>No skills extracted</span>
            }
          </div>

          <button onClick={handleDelete} style={{...rs.deleteBtn, marginTop:"10px"}}>🗑️ Delete</button>
        </div>
      </div>
      <div style={rs.right}>
        <p style={rs.exp}>
          💼 {experience > 0 ? `${experience} yr${experience === 1 ? "" : "s"} exp` : "Fresher"}
        </p>
      </div>
    </div>
  )
}

// ── Analytics Component ───────────────────────────────────────────────────────
function RecruiterAnalytics({ data }) {
  const scoreRef  = useRef(null)
  const jobRef    = useRef(null)
  const skillsRef = useRef(null)
  const charts    = useRef([])

  useEffect(() => {
    charts.current.forEach(c => c.destroy())
    charts.current = []
    if (!window.Chart) return

    const isDark    = window.matchMedia('(prefers-color-scheme: dark)').matches
    const textColor = isDark ? '#b4b2a9' : '#7a94c1'
    const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.05)'

    const base = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: textColor, font: { size: 12 } }, grid: { color: gridColor } },
        y: { ticks: { color: textColor, font: { size: 12 } }, grid: { color: gridColor } }
      }
    }

    charts.current.push(new window.Chart(scoreRef.current, {
      type: 'bar',
      data: {
        labels: Object.keys(data.score_distribution),
        datasets: [{
          data: Object.values(data.score_distribution),
          backgroundColor: ['#e24b4a','#ef9f27','#ba7517','#1d9e75','#0f6e56'],
          borderRadius: 4,
        }]
      },
      options: { ...base }
    }))

    charts.current.push(new window.Chart(jobRef.current, {
      type: 'bar',
      data: {
        labels: data.job_stats.map(j => j.title),
        datasets: [{
          data: data.job_stats.map(j => j.rate),
          backgroundColor: '#4f8ef7',
          borderRadius: 4,
        }]
      },
      options: {
        ...base,
        indexAxis: 'y',
        scales: {
          x: { min: 0, max: 100, ticks: { color: textColor, callback: v => v + '%' }, grid: { color: gridColor } },
          y: { ticks: { color: textColor, font: { size: 12 } }, grid: { color: gridColor } }
        }
      }
    }))

    charts.current.push(new window.Chart(skillsRef.current, {
      type: 'bar',
      data: {
        labels: data.top_skills.map(s => s.skill),
        datasets: [{
          data: data.top_skills.map(s => s.count),
          backgroundColor: '#534ab7',
          borderRadius: 4,
        }]
      },
      options: {
        ...base,
        scales: {
          x: { ticks: { color: textColor, font: { size: 11 }, autoSkip: false, maxRotation: 35 }, grid: { color: gridColor } },
          y: { ticks: { color: textColor, font: { size: 12 } }, grid: { color: gridColor } }
        }
      }
    }))

    return () => { charts.current.forEach(c => c.destroy()); charts.current = [] }
  }, [data])

  const statCards = [
    { label: "Total Screened",    value: data.total_uploaded },
    { label: "Total Shortlisted", value: data.total_shortlisted },
    { label: "Shortlist Rate",    value: data.shortlist_rate.toFixed(1) + "%" },
  ]

  return (
    <div>
      <div style={{display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"12px", marginBottom:"2rem"}}>
        {statCards.map(c => (
          <div key={c.label} style={{background:C.mid, borderRadius:"12px", padding:"1.25rem 1.5rem", border:`1px solid ${C.border}`}}>
            <p style={{color:C.muted, fontSize:"13px", margin:"0 0 4px"}}>{c.label}</p>
            <p style={{color:C.text, fontSize:"28px", fontWeight:"700", margin:0}}>{c.value}</p>
          </div>
        ))}
      </div>

      <p style={{color:C.muted, fontSize:"11px", fontWeight:"600", letterSpacing:"0.5px", textTransform:"uppercase", margin:"0 0 10px"}}>Score distribution</p>
      <div style={{background:C.mid, borderRadius:"16px", padding:"1.25rem", border:`1px solid ${C.border}`, marginBottom:"1.5rem"}}>
        <div style={{position:"relative", height:"220px"}}>
          <canvas ref={scoreRef} />
        </div>
      </div>

      <p style={{color:C.muted, fontSize:"11px", fontWeight:"600", letterSpacing:"0.5px", textTransform:"uppercase", margin:"0 0 10px"}}>Shortlist rate per job</p>
      <div style={{background:C.mid, borderRadius:"16px", padding:"1.25rem", border:`1px solid ${C.border}`, marginBottom:"1.5rem"}}>
        <div style={{position:"relative", height: Math.max(160, data.job_stats.length * 50 + 60) + "px"}}>
          <canvas ref={jobRef} />
        </div>
      </div>

      <p style={{color:C.muted, fontSize:"11px", fontWeight:"600", letterSpacing:"0.5px", textTransform:"uppercase", margin:"0 0 10px"}}>Top 10 skills</p>
      <div style={{background:C.mid, borderRadius:"16px", padding:"1.25rem", border:`1px solid ${C.border}`, marginBottom:"2rem"}}>
        <div style={{position:"relative", height:"280px"}}>
          <canvas ref={skillsRef} />
        </div>
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
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
  exp: { color:"#7a94c1", fontSize:"11px", margin:0 },
  deleteBtn: { background:"none", border:"1px solid #5c1a1a", color:"#fca5a5", borderRadius:"6px", padding:"4px 10px", fontSize:"12px", cursor:"pointer", fontFamily:"inherit" },
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
  list: { display:"flex", flexDirection:"column", gap:"12px" },
  empty: { textAlign:"center", color:"#7a94c1", padding:"2rem", background:"#162040", borderRadius:"16px", border:"1px solid #1f3460", fontSize:"14px" },
  jobCard: { background:"#162040", borderRadius:"16px", padding:"1.5rem", display:"flex", justifyContent:"space-between", alignItems:"flex-start", border:"1px solid #1f3460", gap:"1rem" },
  jobLeft: { flex:1 },
  panelOverlay: { position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(0,0,0,0.4)", zIndex:1000, display:"flex", justifyContent:"flex-end" },
panel: { background:"#162040", width:"420px", maxWidth:"90vw", height:"100vh", overflowY:"auto", padding:"2rem 1.5rem", borderLeft:"1px solid #1f3460" },
  jobTitle: { fontSize:"16px", fontWeight:"600", color:"#e8f0fe", margin:"0 0 6px" },
  jobDesc: { color:"#7a94c1", fontSize:"13px", margin:"0 0 10px", lineHeight:1.5 },
  jobMeta: { display:"flex", gap:"8px", flexWrap:"wrap", marginBottom:"8px" },
  tag: { fontSize:"12px", color:"#7a94c1", background:"#1a2a4a", padding:"3px 10px", borderRadius:"20px", border:"1px solid #1f3460" },
  skillsRow: { display:"flex", gap:"6px", flexWrap:"wrap" },
  skillTag: { fontSize:"11px", color:"#4f8ef7", background:"#0f1e3a", padding:"3px 8px", borderRadius:"20px", border:"1px solid #1f3460" },
  jobStats: { display:"flex", flexDirection:"column", gap:"8px", flexShrink:0 },
  screenBtn: { background:"#4f8ef7", color:"#fff", border:"none", borderRadius:"10px", padding:"12px 20px", fontSize:"13px", fontWeight:"700", cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" },
  uploadCard: { background:"#162040", borderRadius:"16px", padding:"1.5rem", marginBottom:"2rem", border:"1px solid #1f3460" },
  cardTitle: { fontSize:"16px", fontWeight:"600", color:"#e8f0fe", margin:"0 0 6px" },
  cardSub: { color:"#7a94c1", fontSize:"13px", margin:"0 0 1rem" },
  shortlistBtn: {
  background: "#1a2a4a",
  color: "#e8f0fe",
  border: "1px solid #1f3460",
  borderRadius: "10px",
  padding: "12px 20px",
  fontSize: "13px",
  fontWeight: "700",
  cursor: "pointer",
  fontFamily: "inherit",
  whiteSpace: "nowrap",
},

shortlistRow: {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "12px",
  background: "#162040",
  borderRadius: "10px",
  marginBottom: "8px",
},
  uploadBtn: { display:"inline-flex", alignItems:"center", gap:"6px", padding:"10px 18px", background:"#1a2a4a", color:"#e8f0fe", border:"1px solid #1f3460", borderRadius:"10px", fontSize:"13px", fontWeight:"600", cursor:"pointer", fontFamily:"inherit" },
  msg: { padding:"10px 14px", borderRadius:"8px", fontSize:"13px" },
  msgSuccess: { background:"#0f2d1f", border:"1px solid #1a5c3a", color:"#6ee7b7" },
  msgError: { background:"#2d0f0f", border:"1px solid #5c1a1a", color:"#fca5a5" },
  sectionTitle: { fontSize:"16px", fontWeight:"600", color:"#e8f0fe", margin:"0 0 1rem" },
  spResults: { marginTop:"0.5rem", background:"#1a2a4a", borderRadius:"12px", padding:"1rem", border:"1px solid #1f3460" },
  spRow: { display:"flex", alignItems:"center", gap:"12px", padding:"8px 12px", marginBottom:"6px", background:"#162040", borderRadius:"8px" },
  modalOverlay: { position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(0,0,0,0.6)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 },
  modal: { background:"#162040", borderRadius:"16px", padding:"2rem", width:"480px", maxWidth:"90vw", border:"1px solid #1f3460", maxHeight:"80vh", overflowY:"auto" },
  thresholdBtn: { flex:1, padding:"12px", background:"#1a2a4a", color:"#7a94c1", border:"1px solid #1f3460", borderRadius:"10px", fontSize:"14px", fontWeight:"700", cursor:"pointer", fontFamily:"inherit" },
  thresholdBtnActive: { background:"#4f8ef7", color:"#fff", border:"1px solid #4f8ef7" },
  modalCancelBtn: { flex:1, padding:"12px", background:"none", color:"#7a94c1", border:"1px solid #1f3460", borderRadius:"10px", fontSize:"14px", fontWeight:"600", cursor:"pointer", fontFamily:"inherit" },
  modalConfirmBtn: { flex:1, padding:"12px", background:"#4f8ef7", color:"#fff", border:"none", borderRadius:"10px", fontSize:"14px", fontWeight:"700", cursor:"pointer", fontFamily:"inherit" },
}