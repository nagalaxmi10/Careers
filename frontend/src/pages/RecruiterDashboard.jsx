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

export default function RecruiterDashboard() {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState([])
  const [resumes, setResumes] = useState({})
  const [selectedJob, setSelectedJob] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState("")
  const [tab, setTab] = useState("jobs")
  const [stats, setStats] = useState({})
  const [resumeUrl, setResumeUrl] = useState("")

  // ── SharePoint screening state ─────────────────────────────────────
  const [screening, setScreening] = useState(false)
  const [screeningMsg, setScreeningMsg] = useState("")
  const [screeningResults, setScreeningResults] = useState(null)
  const [screeningError, setScreeningError] = useState("")

  // ── SharePoint upload state ────────────────────────────────────────
  const [spUploading, setSpUploading] = useState(false)
  const [spMsg, setSpMsg] = useState("")
  const [spResults, setSpResults] = useState(null)

  // ── Analytics state ────────────────────────────────────────────────
  const [analytics, setAnalytics] = useState(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)

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

  const handleJobClick = (job) => {
    setSelectedJob(job)
    setTab("resumes")
    loadResumes(job.id)
    setScreeningMsg("")
    setScreeningResults(null)
    setScreeningError("")
    setSpMsg("")
    setSpResults(null)
  }

  // ── METHOD 1: URL or Local Folder Path ─────────────────────────────
  const handleUrlUpload = async () => {
    if (!resumeUrl.trim() || !selectedJob) return
    setUploading(true)
    setUploadMsg("")

    const isLocalPath = resumeUrl.match(/^[A-Za-z]:\\/i) || resumeUrl.startsWith('/') || resumeUrl.startsWith('~')

    try {
      if (isLocalPath) {
        const res = await API.post("recruitment/ingest-local-folder/", {
          job_request: selectedJob.id,
          folder_path: resumeUrl.trim()
        })
        setUploadMsg(`✓ ${res.data.message}`)
      } else {
        await API.post("recruitment/resumes/", {
          job_request: selectedJob.id,
          resume_url: resumeUrl.trim()
        })
        setUploadMsg("✓ Resume fetched from URL and analyzed!")
      }
      setResumeUrl("")
      loadResumes(selectedJob.id)
      loadJobs()
      setTimeout(() => setUploadMsg(""), 5000)
    } catch (err) {
      setUploadMsg("✗ Failed. Check the path/URL or try again.")
    } finally {
      setUploading(false)
    }
  }

  // ── METHOD 2: Single/Multiple File Upload ──────────────────────────
  const handleFileUpload = async (e) => {
    const files = e.target.files
    if (!files || files.length === 0 || !selectedJob) return
    setUploading(true)
    setUploadMsg(`Uploading ${files.length} file(s)... AI is analyzing.`)
    try {
      const formData = new FormData()
      formData.append("job_request", selectedJob.id)
      for (let i = 0; i < files.length; i++) formData.append("files", files[i])
      await API.post("recruitment/bulk-upload/", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      })
      setUploadMsg("✓ File(s) processed successfully!")
      loadResumes(selectedJob.id)
      loadJobs()
      setTimeout(() => setUploadMsg(""), 5000)
    } catch (err) {
      console.error("Upload error:", err.response?.data || err.message)
      setUploadMsg(`✗ ${err.response?.data?.error || "Upload failed. Try again."}`)
    } finally {
      setUploading(false)
      e.target.value = ""
    }
  }

  // ── METHOD 3: Bulk Folder Upload ───────────────────────────────────
  const handleFolderUpload = async (e) => {
    const files = e.target.files
    if (!files || files.length === 0 || !selectedJob) return
    setUploading(true)
    setUploadMsg(`Scanning ${files.length} files from folder...`)
    try {
      const formData = new FormData()
      formData.append("job_request", selectedJob.id)
      let validCount = 0
      for (let i = 0; i < files.length; i++) {
        const name = files[i].name.toLowerCase()
        if (name.endsWith('.pdf') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png')) {
          formData.append("files", files[i])
          validCount++
        }
      }
      if (validCount === 0) {
        setUploadMsg("✗ No PDF or Image files found in selected folder.")
        setUploading(false)
        return
      }
      setUploadMsg(`Uploading ${validCount} valid files... AI is analyzing.`)
      await API.post("recruitment/bulk-upload/", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      })
      setUploadMsg("✓ Bulk folder processed!")
      loadResumes(selectedJob.id)
      loadJobs()
      setTimeout(() => setUploadMsg(""), 5000)
    } catch (err) {
      setUploadMsg("✗ Bulk upload failed.")
    } finally {
      setUploading(false)
      e.target.value = ""
    }
  }

  // ── METHOD 4: Upload to SharePoint + Screen ────────────────────────
  const handleSharePointUpload = async (e) => {
    const files = e.target.files
    if (!files || files.length === 0 || !selectedJob) return
    setSpUploading(true)
    setSpMsg(`⏳ Screening ${files.length} file(s) and uploading to SharePoint...`)
    setSpResults(null)
    try {
      const formData = new FormData()
      formData.append("job_request", selectedJob.id)
      for (let i = 0; i < files.length; i++) {
        if (files[i].name.toLowerCase().endsWith(".pdf")) formData.append("files", files[i])
      }
      const res = await API.post("recruitment/upload-and-screen/", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      })
      setSpMsg(`✓ ${res.data.message}`)
      setSpResults(res.data.results)
      loadResumes(selectedJob.id)
      loadJobs()
    } catch (err) {
      setSpMsg(`✗ ${err?.response?.data?.error || "Upload failed."}`)
    } finally {
      setSpUploading(false)
      e.target.value = ""
    }
  }

  // ── METHOD 5: SharePoint Screening (fetch existing) ────────────────
  const handleSharePointScreening = async () => {
    if (!selectedJob) return
    if (!window.confirm(
      "This will fetch all pending resumes from SharePoint and run AI screening.\n\nAlready-screened resumes will be skipped automatically. Continue?"
    )) return
    setScreening(true)
    setScreeningMsg("⏳ Fetching resumes from SharePoint...")
    setScreeningResults(null)
    setScreeningError("")
    try {
      const res = await API.post("recruitment/run-screening/", { job_request_id: selectedJob.id })
      setScreeningMsg(`✓ ${res.data.message}`)
      setScreeningResults(res.data.results)
      loadResumes(selectedJob.id)
      loadJobs()
    } catch (err) {
      setScreeningError(err?.response?.data?.error || "SharePoint screening failed. Check server logs.")
    } finally {
      setScreening(false)
    }
  }

  const logout = () => {
    localStorage.removeItem("token")
    localStorage.removeItem("refresh")
    navigate("/")
  }

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
            <p style={s.pageSub}>AI will extract skills and auto-shortlist at ≥65% match</p>
          </div>

          <div style={s.uploadCard}>
            <h2 style={s.cardTitle}>Add Candidates</h2>
            <p style={s.cardSub}>Paste a web link, a local folder path, upload files, or fetch from SharePoint.</p>

            {/* Method 1: URL / Local Path */}
            <div style={{display:"flex", gap:"10px", marginBottom:"1.25rem"}}>
              <input
                style={{...s.input, flex:1}}
                type="text"
                placeholder="https://link.to/resume.pdf OR C:\path\to\folder"
                value={resumeUrl}
                onChange={e => setResumeUrl(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleUrlUpload()}
              />
              <button onClick={handleUrlUpload} disabled={uploading} style={{...s.actionBtn, opacity: uploading ? 0.7 : 1}}>
                {uploading ? "Analyzing..." : "✨ Score"}
              </button>
            </div>

            {/* Method 2 & 3: File/Folder Upload */}
            <div style={{display:"flex", gap:"12px", alignItems:"center", marginBottom:"1.25rem"}}>
              <label style={{...s.uploadBtn, opacity: uploading ? 0.7 : 1}}>
                📄 Select Files
                <input type="file" style={{display:"none"}} multiple accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileUpload} disabled={uploading} />
              </label>
              <label style={{...s.uploadBtn, opacity: uploading ? 0.7 : 1}}>
                📁 Select Folder
                <input type="file" style={{display:"none"}} webkitdirectory="true" directory="true" multiple onChange={handleFolderUpload} disabled={uploading} />
              </label>
              <span style={{color:C.muted, fontSize:"12px"}}>Supports PDF, JPG, JPEG, PNG</span>
            </div>

            {uploadMsg && (
              <div style={{...s.msg, ...(uploadMsg.startsWith("✓") ? s.msgSuccess : s.msgError), marginBottom:"1.25rem"}}>
                {uploadMsg}
              </div>
            )}

            {/* Method 4: Upload to SharePoint */}
            <div style={s.spDivider} />
            <div style={{display:"flex", gap:"12px", alignItems:"center", marginBottom:"1rem"}}>
              <label style={{...s.uploadBtn, opacity: spUploading ? 0.7 : 1, background:"#1a3a5c", color:"#60a5fa", border:"1px solid #1f4a7a"}}>
                📤 Upload to SharePoint
                <input type="file" style={{display:"none"}} multiple accept=".pdf" onChange={handleSharePointUpload} disabled={spUploading} />
              </label>
              <span style={{color:C.muted, fontSize:"12px"}}>PDF only — AI screens and uploads with extracted skills</span>
            </div>

            {spMsg && (
              <div style={{...s.msg, ...(spMsg.startsWith("✓") ? s.msgSuccess : s.msgError), marginBottom:"1rem"}}>
                {spMsg}
              </div>
            )}

            {spResults && spResults.length > 0 && (
              <div style={{...s.spResults, marginBottom:"1.25rem"}}>
                <p style={{color:C.muted, fontSize:"12px", fontWeight:"600", margin:"0 0 10px", letterSpacing:"0.5px", textTransform:"uppercase"}}>Upload Results</p>
                {spResults.map((r, i) => (
                  <div key={i} style={{...s.spRow, borderLeft:`3px solid ${r.error ? "#f87171" : r.status === "Shortlisted" ? "#34d399" : "#fbbf24"}`}}>
                    <span style={{color:C.muted, fontSize:"12px", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{r.file}</span>
                    {r.error
                      ? <span style={{color:"#f87171", fontSize:"12px"}}>Error: {r.error}</span>
                      : <>
                          <span style={{color:C.text, fontSize:"13px", fontWeight:"600", minWidth:"120px"}}>{r.candidate}</span>
                          <span style={{fontSize:"11px", fontWeight:"700", padding:"3px 10px", borderRadius:"20px", background: r.status === "Shortlisted" ? "#0f2d1f" : "#2d1a0f", color: r.status === "Shortlisted" ? "#6ee7b7" : "#fbbf24", whiteSpace:"nowrap"}}>{r.status}</span>
                          <span style={{color:C.text, fontSize:"13px", fontWeight:"700", minWidth:"48px", textAlign:"right"}}>{r.score?.toFixed(1)}%</span>
                        </>
                    }
                  </div>
                ))}
              </div>
            )}

            {/* Method 5: Run Screening */}
            <div style={s.spDivider} />
            <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:"10px"}}>
              <div>
                <p style={{color:C.text, fontWeight:"600", fontSize:"13px", margin:"0 0 2px"}}>🏢 SharePoint Resume Screening</p>
                <p style={{color:C.muted, fontSize:"12px", margin:0}}>Fetches pending resumes from company SharePoint — already screened ones are skipped automatically</p>
              </div>
              <button onClick={handleSharePointScreening} disabled={screening} style={{...s.spBtn, opacity: screening ? 0.7 : 1}}>
                {screening ? "⏳ Screening..." : "▶ Run Screening"}
              </button>
            </div>

            {screeningError && <div style={{...s.msg, ...s.msgError, marginTop:"1rem"}}>{screeningError}</div>}
            {screeningMsg && !screeningError && <div style={{...s.msg, ...s.msgSuccess, marginTop:"1rem"}}>{screeningMsg}</div>}

            {screeningResults && screeningResults.length > 0 && (
              <div style={s.spResults}>
                <p style={{color:C.muted, fontSize:"12px", fontWeight:"600", margin:"0 0 10px", letterSpacing:"0.5px", textTransform:"uppercase"}}>Screening Results</p>
                {screeningResults.map((r, i) => (
                  <div key={i} style={{...s.spRow, borderLeft:`3px solid ${r.error ? "#f87171" : r.status === "Shortlisted" ? "#34d399" : "#fbbf24"}`}}>
                    <span style={{color:C.muted, fontSize:"12px", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{r.file}</span>
                    {r.error
                      ? <span style={{color:"#f87171", fontSize:"12px"}}>Error: {r.error}</span>
                      : <>
                          <span style={{color:C.text, fontSize:"13px", fontWeight:"600", minWidth:"120px"}}>{r.candidate}</span>
                          <span style={{fontSize:"11px", fontWeight:"700", padding:"3px 10px", borderRadius:"20px", background: r.status === "Shortlisted" ? "#0f2d1f" : "#2d1a0f", color: r.status === "Shortlisted" ? "#6ee7b7" : "#fbbf24", whiteSpace:"nowrap"}}>{r.status}</span>
                          <span style={{color:C.text, fontSize:"13px", fontWeight:"700", minWidth:"48px", textAlign:"right"}}>{r.score?.toFixed(1)}%</span>
                        </>
                    }
                  </div>
                ))}
              </div>
            )}
          </div>

          <h2 style={s.sectionTitle}>✅ Shortlisted ({shortlisted.length})</h2>
          <div style={s.list}>
            {shortlisted.length === 0 && <div style={s.empty}>No shortlisted candidates yet.</div>}
            {shortlisted.map(r => <ResumeCard key={r.id} resume={r} onRefresh={() => { loadResumes(selectedJob.id); loadJobs() }} />)}
          </div>

          <h2 style={{...s.sectionTitle, marginTop:"2rem"}}>❌ Not Shortlisted ({notShortlisted.length})</h2>
          <div style={s.list}>
            {notShortlisted.length === 0 && <div style={s.empty}>None yet.</div>}
            {notShortlisted.map(r => <ResumeCard key={r.id} resume={r} onRefresh={() => { loadResumes(selectedJob.id); loadJobs() }} />)}
          </div>
        </>}
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
    { label: "Total Uploaded",    value: data.total_uploaded },
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

// ── Resume Card ───────────────────────────────────────────────────────────────
function ResumeCard({ resume, onRefresh }) {
  const score = resume.match_percentage || 0
  const scoreColor = score >= 65 ? "#6ee7b7" : score >= 40 ? "#fbbf24" : "#f87171"
  const displayName = cleanDisplayName(resume.candidate_name, resume.email, resume.id)
  const skills = toSkillArray(resume.skills)
  const experience = resume.experience || 0

  const handleViewResume = async (resume) => {
    if (resume.resume_url && (resume.resume_url.startsWith('http://') || resume.resume_url.startsWith('https://'))) {
      window.open(resume.resume_url, '_blank')
      return
    }
    try {
      await API.get(`recruitment/resumes/${resume.id}/serve/`, {
        maxRedirects: 0,
        validateStatus: (status) => status < 400,
      })
      window.open(`${API.defaults.baseURL}recruitment/resumes/${resume.id}/serve/`, '_blank')
    } catch (err) {
      toast.info("Resume file not available for preview.")
    }
  }

  const handleDelete = async () => {
    if (!window.confirm(`Delete resume for ${displayName}? This cannot be undone.`)) return
    try {
      await API.delete(`recruitment/resumes/${resume.id}/`)
      toast.success("Resume deleted successfully")
      if (onRefresh) onRefresh()
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
          <div style={{display:"flex", gap:"8px", marginTop:"8px"}}>
            <button onClick={() => handleViewResume(resume)} style={rs.viewResumeBtn}>📄 View Original</button>
            <button onClick={handleDelete} style={rs.deleteBtn}>🗑️ Delete</button>
          </div>
          <FitSummary summary={resume.fit_summary} />
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
  missingSkill: { fontSize:"11px", color:"#3d5a8a", padding:"3px 8px", borderRadius:"20rap" },
  right: { display:"flex", flexDirection:"column", alignItems:"center", gap:"4px", flexShrink:0, marginLeft:"1rem" },
  score: { fontSize:"24px", fontWeight:"700", border:"2px solid", borderRadius:"50%", width:"60px", height:"60px", display:"flex", alignItems:"center", justifyContent:"center" },
  scoreLabel: { color:"#7a94c1", fontSize:"11px", margin:0 },
  exp: { color:"#7a94c1", fontSize:"11px", margin:0 },
  viewResumeBtn: { background:"none", border:"1px solid #1f3460", color:"#4f8ef7", borderRadius:"6px", padding:"4px 10px", fontSize:"12px", cursor:"pointer", fontFamily:"inherit" },
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
  actionBtn: { background:"#4f8ef7", color:"#fff", border:"none", borderRadius:"10px", padding:"12px 20px", fontSize:"14px", fontWeight:"600", cursor:"pointer", whiteSpace:"nowrap", fontFamily:"inherit" },
  uploadBtn: { display:"inline-flex", alignItems:"center", gap:"6px", padding:"10px 18px", background:"#1a2a4a", color:"#e8f0fe", border:"1px solid #1f3460", borderRadius:"10px", fontSize:"13px", fontWeight:"600", cursor:"pointer", fontFamily:"inherit" },
  input: { width:"100%", padding:"12px 14px", background:"#1a2a4a", border:"1px solid #1f3460", borderRadius:"10px", fontSize:"14px", color:"#e8f0fe", outline:"none", boxSizing:"border-box", fontFamily:"inherit" },
  msg: { padding:"10px 14px", borderRadius:"8px", fontSize:"13px" },
  msgSuccess: { background:"#0f2d1f", border:"1px solid #1a5c3a", color:"#6ee7b7" },
  msgError: { background:"#2d0f0f", border:"1px solid #5c1a1a", color:"#fca5a5" },
  sectionTitle: { fontSize:"16px", fontWeight:"600", color:"#e8f0fe", margin:"0 0 1rem" },
  spDivider: { height:"1px", background:"#1f3460", margin:"1.25rem 0" },
  spBtn: { background:"#1a3a5c", color:"#60a5fa", border:"1px solid #1f3460", borderRadius:"10px", padding:"10px 20px", fontSize:"13px", fontWeight:"700", cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" },
  spResults: { marginTop:"1rem", background:"#1a2a4a", borderRadius:"12px", padding:"1rem", border:"1px solid #1f3460" },
  spRow: { display:"flex", alignItems:"center", gap:"12px", padding:"8px 12px", marginBottom:"6px", background:"#162040", borderRadius:"8px" },
}