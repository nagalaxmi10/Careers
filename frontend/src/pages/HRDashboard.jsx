import { useEffect, useState } from "react"
import MyProfile from "../components/MyProfile"
import { useNavigate } from "react-router-dom"
import API from "../api/axios"
import { toast } from "../components/Toast"

const C = {
  dark:"#0a0f1e", mid:"#162040", card:"#1a2a4a",
  accent:"#4f8ef7", text:"#e8f0fe", muted:"#7a94c1", border:"#1f3460",
}

const toSkillArray = (skills) => {
  if (!skills) return []
  if (Array.isArray(skills)) return skills
  if (typeof skills === "string") return skills.split(",").map(s => s.trim()).filter(Boolean)
  return []
}

const toArray = (data) => (Array.isArray(data) ? data : data?.results ?? [])

// ─── Custom Zero-Dependency Dark Calendar ──────────────────────────────────
function MiniCalendar({ interviewDates, selectedDate, onSelectDate }) {
  const [viewDate, setViewDate] = useState(new Date())

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = new Date()

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1))
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1))

  const days = []
  for (let i = 0; i < firstDay; i++) days.push(null)
  for (let i = 1; i <= daysInMonth; i++) days.push(i)

  const isSameDay = (d1, d2) =>
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()

  const formatDateStr = (y, m, d) =>
    `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

  return (
    <div style={{ background: C.mid, borderRadius: "16px", padding: "1.5rem", border: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <button onClick={prevMonth} style={calStyles.navBtn}>‹</button>
        <span style={{ color: C.text, fontWeight: "600", fontSize: "15px" }}>
          {viewDate.toLocaleString("default", { month: "long", year: "numeric" })}
        </span>
        <button onClick={nextMonth} style={calStyles.navBtn}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px", textAlign: "center" }}>
        {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => (
          <div key={d} style={{ color: C.muted, fontSize: "11px", padding: "6px 0" }}>{d}</div>
        ))}
        {days.map((day, idx) => {
          if (!day) return <div key={`e-${idx}`} />
          const dateStr = formatDateStr(year, month, day)
          const dateObj = new Date(year, month, day)
          const hasInterviews = interviewDates[dateStr]?.length > 0
          const isSelected = isSameDay(dateObj, selectedDate)
          const isToday = isSameDay(dateObj, today)

          return (
            <button
              key={dateStr}
              onClick={() => onSelectDate(dateObj)}
              style={{
                background: isSelected ? C.accent : isToday ? "#1e3a5f" : "transparent",
                color: isSelected ? "#fff" : isToday ? "#93c5fd" : C.text,
                border: "none", borderRadius: "8px", padding: "8px 4px", cursor: "pointer",
                position: "relative", fontWeight: isSelected ? "700" : "400",
                fontSize: "13px", fontFamily: "inherit"
              }}
            >
              {day}
              {hasInterviews && !isSelected && (
                <div style={{ position: "absolute", bottom: "2px", left: "50%", transform: "translateX(-50%)", width: "5px", height: "5px", borderRadius: "50%", background: C.accent }} />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const calStyles = {
  navBtn: {
    background: C.card, border: `1px solid ${C.border}`, color: C.text,
    borderRadius: "8px", width: "34px", height: "34px", cursor: "pointer",
    fontSize: "18px", display: "flex", alignItems: "center", justifyContent: "center"
  }
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function HRDashboard() {
  const navigate = useNavigate()
  const [shortlisted, setShortlisted] = useState([])
  const [interviews, setInterviews] = useState([])
  const [tab, setTab] = useState("shortlisted")
  const [selected, setSelected] = useState(null)
  const [stats, setStats] = useState({})
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [form, setForm] = useState({
    interview_date: "", interview_time: "", mode: "ONLINE",
    meeting_link: "", location: "", interviewer: "", feedback: ""
  })

  const load = async () => {
    try {
      const [s, i] = await Promise.all([
        API.get("recruitment/shortlisted/"),
        API.get("recruitment/interviews/")
      ])
      setShortlisted(toArray(s.data))
      setInterviews(toArray(i.data))
    } catch (err) { console.log(err) }
  }

  useEffect(() => { 
    load()
    const loadStats = async () => {
      try { const r = await API.get("accounts/stats/"); setStats(r.data) } catch (err) { console.log(err) }
    }
    loadStats()
  }, [])

  const scheduleInterview = async () => {
    if (!selected) return
    try {
      await API.post("recruitment/interviews/", { ...form, candidate: selected.id })
      toast.success("Interview scheduled successfully!")
      setSelected(null)
      setForm({ interview_date:"", interview_time:"", mode:"ONLINE", meeting_link:"", location:"", interviewer:"", feedback:"" })
      load()
    } catch (err) {
      toast.error("Failed to schedule interview.")
    }
  }

  const updateStatus = async (id, status) => {
    try { await API.patch(`recruitment/shortlisted/${id}/`, { status }); load() } catch (err) { console.log(err) }
  }

  const deleteInterview = async (id) => {
    if (!window.confirm("Cancel this interview?")) return
    try { await API.delete(`recruitment/interviews/${id}/`); toast.success("Interview cancelled"); load() } catch (err) { console.log(err) }
  }

  const handleViewResume = async (id) => {
    try {
      const response = await API.get(`recruitment/resumes/${id}/download/`, { responseType: 'blob' });
      const fileURL = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      window.open(fileURL);
    } catch (err) { toast.error("Could not load resume file.") }
  }

  const logout = () => { localStorage.removeItem("token"); localStorage.removeItem("refresh"); navigate("/") }

  const STATUS_COLORS = {
    PENDING:              { bg:"#1e3a5f", color:"#93c5fd" },
    INTERVIEW_SCHEDULED:  { bg:"#1a2a4a", color:"#a78bfa" },
    ROUND_1:              { bg:"#1e3a5f", color:"#60a5fa" },
    ROUND_2:              { bg:"#162040", color:"#818cf8" },
    SELECTED:             { bg:"#0f2d1f", color:"#6ee7b7" },
    REJECTED:             { bg:"#2d0f0f", color:"#fca5a5" },
  }

  const interviewDates = interviews.reduce((acc, curr) => {
    const date = curr.interview_date
    if (!acc[date]) acc[date] = []
    acc[date].push(curr)
    return acc
  }, {})

  const formatDate = (date) => {
    const d = new Date(date)
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }

  const selectedDateStr = formatDate(selectedDate)
  const interviewsForSelectedDate = interviewDates[selectedDateStr] || []

  return (
    <div style={s.page}>
      <div style={s.sidebar}>
        <div style={s.logo}><div style={s.logoMark}>EP</div><span style={s.logoText}>Portal</span></div>
        <div style={s.sideLabel}>HR Manager</div>
        <nav style={s.nav}>
          <button style={{...s.navBtn, ...(tab==="shortlisted" ? s.navActive : {})}} onClick={() => setTab("shortlisted")}><span>⭐</span> Shortlisted ({shortlisted.length})</button>
          <button style={{...s.navBtn, ...(tab==="interviews" ? s.navActive : {})}} onClick={() => setTab("interviews")}><span>📅</span> Interviews ({interviews.length})</button>
          <button style={{...s.navBtn, ...(tab==="profile" ? s.navActive : {})}} onClick={() => setTab("profile")}><span>👤</span> My Profile</button>
          <button style={{...s.navBtn, ...(tab==="password" ? s.navActive : {})}} onClick={() => setTab("password")}><span>🔑</span> Change Password</button>
        </nav>
        <button style={s.logoutBtn} onClick={logout}>Sign out</button>
      </div>

      <div style={s.main}>
        {Object.keys(stats).length > 0 && (
          <div style={{display:"flex", gap:"16px", marginBottom:"2rem", flexWrap:"wrap"}}>
            {Object.entries(stats).map(([key, value]) => {
              const labels = { shortlisted: "⭐ Shortlisted", interviews_scheduled: "📅 Interviews", emails_sent: "📧 Emails Sent", pending_jobs: "⏳ Pending Approvals" }
              return (
                <div key={key} style={{ background: C.mid, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "1.25rem 1.5rem", flex: "1 1 180px", display: "flex", flexDirection: "column", gap: "4px" }}>
                  <span style={{color: C.muted, fontSize: "13px"}}>{labels[key] || key}</span>
                  <span style={{color: C.text, fontSize: "28px", fontWeight: "700"}}>{value}</span>
                </div>
              )
            })}
          </div>
        )}

        {(tab === "profile" || tab === "password") && <MyProfile tab={tab} />}

        {tab === "shortlisted" && <>
          <div style={s.header}><h1 style={s.pageTitle}>Shortlisted Candidates</h1><p style={s.pageSub}>Review candidates and schedule interviews</p></div>
          {selected && (
            <div style={s.formCard}>
              <h2 style={s.cardTitle}>Schedule Interview — {selected.candidate_details?.candidate_name}</h2>
              <div style={s.formGrid}>
                <div style={s.field}><label style={s.label}>Interview Date</label><input style={s.input} type="date" value={form.interview_date} onChange={e => setForm({...form, interview_date: e.target.value})} /></div>
                <div style={s.field}><label style={s.label}>Interview Time</label><input style={s.input} type="time" value={form.interview_time} onChange={e => setForm({...form, interview_time: e.target.value})} /></div>
                <div style={s.field}>
                  <label style={s.label}>Mode</label>
                  <select style={s.input} value={form.mode} onChange={e => setForm({...form, mode: e.target.value})}><option value="ONLINE">Online</option><option value="OFFLINE">In Person</option></select>
                </div>
                <div style={s.field}>
                  <label style={s.label}>{form.mode === "ONLINE" ? "Meeting Link" : "Location"}</label>
                  <input style={s.input} placeholder={form.mode === "ONLINE" ? "https://meet.google.com/..." : "Office address"} value={form.mode === "ONLINE" ? form.meeting_link : form.location} onChange={e => setForm({...form, [form.mode === "ONLINE" ? "meeting_link" : "location"]: e.target.value})} />
                </div>
              </div>
              <div style={s.field}><label style={s.label}>Notes (optional)</label><textarea style={{...s.input, minHeight:"80px", resize:"vertical"}} value={form.feedback} onChange={e => setForm({...form, feedback: e.target.value})} /></div>
              <div style={{display:"flex", gap:"10px"}}>
                <button style={s.scheduleBtn} onClick={scheduleInterview}>Schedule Interview</button>
                <button style={s.cancelBtn} onClick={() => setSelected(null)}>Cancel</button>
              </div>
            </div>
          )}
          <div style={s.list}>
            {shortlisted.length === 0 && <div style={s.empty}>No shortlisted candidates yet.</div>}
            {shortlisted.map(c => {
              const st = STATUS_COLORS[c.status] || STATUS_COLORS.PENDING
              const candidate = c.candidate_details
              const displayName = candidate?.candidate_name?.trim() || candidate?.email?.split("@")[0] || `Applicant #${c.id}`
              const expLabel = candidate?.experience > 0 ? `${candidate.experience} yr${candidate.experience === 1 ? "" : "s"} exp` : "Fresher"
              const scoreColor = (candidate?.match_percentage || 0) >= 65 ? "#6ee7b7" : (candidate?.match_percentage || 0) >= 40 ? "#fbbf24" : "#f87171"
              return (
                <div key={c.id} style={s.candidateCard}>
                  <div style={s.candidateLeft}>
                    <div style={s.avatar}>{displayName[0].toUpperCase()}</div>
                    <div style={{flex:1}}>
                      <div style={s.candidateTop}><p style={s.candidateName}>{displayName}</p><span style={{...s.badge, background: st.bg, color: st.color}}>{c.status.replace("_", " ")}</span></div>
                      {candidate?.email ? <p style={s.candidateEmail}>✉ {candidate.email}</p> : <p style={{...s.candidateEmail, color:"#3d5a8a", fontStyle:"italic"}}>Email not extracted</p>}
                      {candidate?.phone && <p style={s.candidateEmail}>📞 {candidate.phone}</p>}
                      <p style={s.candidateJob}>📋 {candidate?.job_request_details?.title || "—"}</p>
                      <p style={{...s.candidateEmail, marginBottom:"8px"}}>💼 {expLabel}</p>
                      <div style={s.skillsRow}>{toSkillArray(candidate?.skills).slice(0, 5).map((sk, i) => (<span key={i} style={s.skillTag}>{sk}</span>))}</div>
                      <button onClick={() => handleViewResume(candidate?.id)} style={s.viewResumeBtn}>📄 View Original Resume</button>
                    </div>
                  </div>
                  <div style={s.candidateRight}>
                    <div style={{...s.matchScore, color: scoreColor, borderColor: scoreColor}}>{(candidate?.match_percentage || 0).toFixed(0)}%</div>
                    <select style={s.statusSelect} value={c.status} onChange={e => updateStatus(c.id, e.target.value)}>
                      <option value="PENDING">Pending</option><option value="INTERVIEW_SCHEDULED">Interview Scheduled</option>
                      <option value="ROUND_1">Round 1</option><option value="ROUND_2">Round 2</option>
                      <option value="SELECTED">Selected</option><option value="REJECTED">Rejected</option>
                    </select>
                    <button style={s.scheduleSmallBtn} onClick={() => setSelected(c)}>📅 Schedule</button>
                  </div>
                </div>
              )
            })}
          </div>
        </>}

        {tab === "interviews" && <>
          <div style={s.header}><h1 style={s.pageTitle}>Interview Calendar</h1><p style={s.pageSub}>Select a date to view scheduled interviews</p></div>
          <div style={{display:"grid", gridTemplateColumns:"1fr 1.5fr", gap:"1.5rem", alignItems:"flex-start"}}>
            <MiniCalendar interviewDates={interviewDates} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
            <div>
              <h3 style={{color: C.text, margin:"0 0 1rem", fontSize:"16px"}}>
                {selectedDate.toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric", year:"numeric" })}
                <span style={{color: C.muted, fontSize:"14px", marginLeft:"8px"}}>{interviewsForSelectedDate.length} interview{interviewsForSelectedDate.length !== 1 ? "s" : ""}</span>
              </h3>
              <div style={s.list}>
                {interviewsForSelectedDate.length === 0 && <div style={s.empty}>No interviews on this date.</div>}
                {interviewsForSelectedDate.map(i => {
                  const cand = i.candidate_details?.candidate_details;
                  const displayName = cand?.candidate_name?.trim() || cand?.email?.split("@")[0].replace(/[._]/g, " ") || "Candidate";
                  const initial = displayName[0].toUpperCase();
                  const jobTitle = cand?.job_request_details?.title || "Open Position";
                  return (
                    <div key={i.id} style={s.interviewCard}>
                      <div style={{display:"flex", gap:"12px", alignItems:"flex-start"}}>
                        <div style={s.avatar}>{initial}</div>
                        <div>
                          <p style={s.interviewName}>{displayName}</p>
                          <p style={s.interviewJob}>{jobTitle}</p>
                          <p style={s.interviewMeta}>⏰ {i.interview_time}</p>
                          <p style={s.interviewMeta}>{i.mode === "ONLINE" ? `🔗 ${i.meeting_link || "Online"}` : `📍 ${i.location || "In Person"}`}</p>
                        </div>
                      </div>
                      <div style={{display:"flex", flexDirection:"column", gap:"8px", alignItems:"flex-end"}}>
                        <span style={{...s.badge, background:"#1e3a5f", color:"#93c5fd"}}>{i.mode}</span>
                        <button style={s.cancelInterviewBtn} onClick={() => deleteInterview(i.id)}>Cancel</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>}
      </div>
    </div>
  )
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
  formCard: { background:"#162040", borderRadius:"16px", padding:"1.5rem", marginBottom:"2rem", border:"1px solid #1f3460" },
  cardTitle: { fontSize:"15px", fontWeight:"600", color:"#e8f0fe", margin:"0 0 1.25rem" },
  formGrid: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:"1rem", marginBottom:"1rem" },
  field: { marginBottom:"1rem" },
  label: { display:"block", fontSize:"11px", color:"#7a94c1", letterSpacing:"1px", textTransform:"uppercase", marginBottom:"6px" },
  input: { width:"100%", padding:"10px 12px", background:"#1a2a4a", border:"1px solid #1f3460", borderRadius:"8px", color:"#e8f0fe", fontSize:"13px", outline:"none", boxSizing:"border-box", fontFamily:"inherit" },
  scheduleBtn: { padding:"10px 20px", background:"#4f8ef7", color:"#fff", border:"none", borderRadius:"8px", fontSize:"13px", cursor:"pointer", fontFamily:"inherit", fontWeight:"600" },
  cancelBtn: { padding:"10px 20px", background:"none", border:"1px solid #1f3460", color:"#7a94c1", borderRadius:"8px", fontSize:"13px", cursor:"pointer", fontFamily:"inherit" },
  list: { display:"flex", flexDirection:"column", gap:"12px" },
  empty: { textAlign:"center", color:"#7a94c1", padding:"2rem", background:"#162040", borderRadius:"16px", border:"1px solid #1f3460", fontSize:"14px" },
  candidateCard: { background:"#162040", borderRadius:"16px", padding:"1.25rem 1.5rem", display:"flex", justifyContent:"space-between", alignItems:"flex-start", border:"1px solid #1f3460", gap:"1rem" },
  candidateLeft: { display:"flex", gap:"1rem", flex:1 },
  avatar: { width:"42px", height:"42px", background:"#4f8ef7", borderRadius:"10px", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:"700", fontSize:"16px", color:"#fff", flexShrink:0 },
  candidateTop: { display:"flex", alignItems:"center", gap:"10px", marginBottom:"4px" },
  candidateName: { fontWeight:"600", color:"#e8f0fe", margin:0, fontSize:"15px" },
  candidateEmail: { color:"#7a94c1", fontSize:"12px", margin:"0 0 2px" },
  candidateJob: { color:"#4f8ef7", fontSize:"12px", margin:"0 0 8px" },
  skillsRow: { display:"flex", flexWrap:"wrap", gap:"6px" },
  skillTag: { fontSize:"11px", color:"#7a94c1", background:"#1a2a4a", padding:"3px 8px", borderRadius:"20px", border:"1px solid #1f3460" },
  candidateRight: { display:"flex", flexDirection:"column", alignItems:"center", gap:"8px", flexShrink:0 },
  matchScore: { fontSize:"20px", fontWeight:"700", border:"2px solid", borderRadius:"50%", width:"52px", height:"52px", display:"flex", alignItems:"center", justifyContent:"center" },
  statusSelect: { padding:"6px 10px", background:"#1a2a4a", border:"1px solid #1f3460", borderRadius:"8px", color:"#e8f0fe", fontSize:"12px", cursor:"pointer", fontFamily:"inherit" },
  scheduleSmallBtn: { padding:"7px 14px", background:"#1e3a5f", color:"#93c5fd", border:"1px solid #1f3460", borderRadius:"8px", fontSize:"12px", cursor:"pointer", fontFamily:"inherit" },
  badge: { display:"inline-flex", alignItems:"center", padding:"3px 10px", borderRadius:"20px", fontSize:"11px", fontWeight:"600", whiteSpace:"nowrap" },
  interviewCard: { background:"#162040", borderRadius:"16px", padding:"1.25rem 1.5rem", display:"flex", justifyContent:"space-between", alignItems:"center", border:"1px solid #1f3460" },
  interviewName: { fontWeight:"600", color:"#e8f0fe", margin:"0 0 4px", fontSize:"15px" },
  interviewJob: { color:"#4f8ef7", fontSize:"12px", margin:"0 0 6px" },
  interviewMeta: { color:"#7a94c1", fontSize:"12px", margin:0 },
  cancelInterviewBtn: { padding:"5px 12px", background:"#2d0f0f", color:"#fca5a5", border:"1px solid #5c1a1a", borderRadius:"8px", fontSize:"12px", cursor:"pointer", fontFamily:"inherit" },
  viewResumeBtn: { background:"none", border:"1px solid #1f3460", color:"#4f8ef7", borderRadius:"6px", padding:"4px 10px", fontSize:"12px", cursor:"pointer", marginTop:"8px", fontFamily:"inherit" },
}