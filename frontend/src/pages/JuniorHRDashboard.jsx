import { useEffect, useState, useCallback } from "react"
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

export default function JuniorHRDashboard() {
  const navigate = useNavigate()
  const [shortlisted, setShortlisted] = useState([])
  const [interviews, setInterviews] = useState([])
  const [emailLog, setEmailLog] = useState([])
  const [tab, setTab] = useState("shortlisted")
  const [stats, setStats] = useState({})
  const [loading, setLoading] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(null)
  const [selectedDate, setSelectedDate] = useState(new Date())

  const loadData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    try {
      const [s, i, e] = await Promise.all([
        API.get("recruitment/shortlisted/"),
        API.get("recruitment/interviews/"),
        API.get("recruitment/email-log/"),
      ])
      setShortlisted(toArray(s.data))
      setInterviews(toArray(i.data))
      setEmailLog(Array.isArray(e.data) ? e.data : [])
      setLastRefresh(new Date())
    } catch (err) {
      console.error("Failed to load data:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData(true)
    const loadStats = async () => {
      try { const r = await API.get("accounts/stats/"); setStats(r.data) } catch (err) { console.log(err) }
    }
    loadStats()
  }, [loadData])

  useEffect(() => {
    if (tab !== "emails") return
    const interval = setInterval(() => { loadData(false) }, 15000)
    return () => clearInterval(interval)
  }, [tab, loadData])

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
        <div style={s.sideLabel}>Junior HR</div>
        <nav style={s.nav}>
          <button style={{...s.navBtn, ...(tab==="shortlisted" ? s.navActive : {})}} onClick={() => setTab("shortlisted")}><span>⭐</span> Shortlisted ({shortlisted.length})</button>
          <button style={{...s.navBtn, ...(tab==="interviews" ? s.navActive : {})}} onClick={() => setTab("interviews")}><span>📅</span> Interviews ({interviews.length})</button>
          <button style={{...s.navBtn, ...(tab==="emails" ? s.navActive : {})}} onClick={() => setTab("emails")}><span>📧</span> Email Log ({emailLog.length})</button>
          <button style={{...s.navBtn, ...(tab==="profile" ? s.navActive : {})}} onClick={() => setTab("profile")}><span>👤</span> My Profile</button>
          <button style={{...s.navBtn, ...(tab==="password" ? s.navActive : {})}} onClick={() => setTab("password")}><span>🔑</span> Change Password</button>
        </nav>
        <div style={s.viewOnlyBadge}>👁 View only</div>
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
          <div style={s.header}><h1 style={s.pageTitle}>Shortlisted Candidates</h1><p style={s.pageSub}>View only — contact HR to make changes</p></div>
          <div style={s.list}>
            {shortlisted.length === 0 && <div style={s.empty}>No shortlisted candidates yet.</div>}
            {shortlisted.map(c => {
              const st = STATUS_COLORS[c.status] || STATUS_COLORS.PENDING
              const candidate = c.candidate_details
              const displayName = candidate?.candidate_name?.trim() || candidate?.email?.split("@")[0] || `Applicant #${c.id}`
              const scoreColor = (candidate?.match_percentage || 0) >= 65 ? "#6ee7b7" : (candidate?.match_percentage || 0) >= 40 ? "#fbbf24" : "#f87171"
              return (
                <div key={c.id} style={s.card}>
                  <div style={s.cardLeft}>
                    <div style={s.avatar}>{displayName[0].toUpperCase()}</div>
                    <div style={{flex:1}}>
                      <div style={s.nameRow}><p style={s.name}>{displayName}</p><span style={{...s.badge, background: st.bg, color: st.color}}>{c.status.replace("_"," ")}</span></div>
                      {candidate?.email ? <p style={s.email}>✉ {candidate.email}</p> : <p style={{...s.email, color:"#3d5a8a", fontStyle:"italic"}}>Email not extracted</p>}
                      {candidate?.phone && <p style={s.email}>📞 {candidate.phone}</p>}
                      <p style={s.job}>📋 {candidate?.job_request_details?.title || "—"}</p>
                      {candidate?.experience > 0 && <p style={s.email}>💼 {candidate.experience} yr{candidate.experience === 1 ? "" : "s"} exp</p>}
                      <div style={s.skills}>
                        {toSkillArray(candidate?.skills).slice(0,5).map((sk,i) => (<span key={i} style={s.skill}>{sk}</span>))}
                        {toSkillArray(candidate?.skills).length === 0 && <span style={{...s.skill, color:"#3d5a8a", fontStyle:"italic"}}>No skills extracted</span>}
                      </div>
                      <button onClick={() => handleViewResume(candidate?.id)} style={s.viewResumeBtn}>📄 View Original Resume</button>
                    </div>
                  </div>
                  <div style={{...s.score, color: scoreColor, borderColor: scoreColor}}>{(candidate?.match_percentage || 0).toFixed(0)}%</div>
                </div>
              )
            })}
          </div>
        </>}

        {/* ── INTERVIEWS CALENDAR TAB ── */}
        {tab === "interviews" && <>
          <div style={s.header}><h1 style={s.pageTitle}>Interview Calendar</h1><p style={s.pageSub}>Select a date to view scheduled interviews (View only)</p></div>
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
                    <div key={i.id} style={s.card}>
                      <div style={{display:"flex", gap:"12px", alignItems:"flex-start"}}>
                        <div style={s.avatar}>{initial}</div>
                        <div>
                          <p style={s.name}>{displayName}</p>
                          <p style={s.job}>{jobTitle}</p>
                          <p style={s.email}>⏰ {i.interview_time}</p>
                          <p style={s.email}>{i.mode === "ONLINE" ? `🔗 ${i.meeting_link || "Online"}` : `📍 ${i.location || "In Person"}`}</p>
                        </div>
                      </div>
                      <span style={{...s.badge, background:"#1e3a5f", color:"#93c5fd"}}>{i.mode}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>}

        {tab === "emails" && <>
          <div style={s.header}>
            <div style={{display:"flex", alignItems:"center", gap:"16px"}}>
              <div>
                <h1 style={s.pageTitle}>Email Log</h1>
                <p style={s.pageSub}>All interview invitation emails sent to candidates {lastRefresh && <span style={{color:"#3d5a8a", marginLeft:"8px"}}>— Last updated {lastRefresh.toLocaleTimeString()}</span>}</p>
              </div>
              <button style={s.refreshBtn} onClick={() => loadData(true)} disabled={loading}>{loading ? "⟳" : "↻"} Refresh</button>
            </div>
            <div style={{...s.autoRefreshNote, marginTop:"8px"}}>🔄 Auto-refreshes every 15 seconds while on this tab</div>
          </div>
          <div style={s.list}>
            {emailLog.length === 0 && <div style={s.empty}>No emails sent yet. Emails are triggered when HR schedules an interview.</div>}
            {emailLog.map((log, i) => {
              const statusColor = { SENT: { bg:"#0f2d1f", color:"#6ee7b7", border:"#1a5c3a" }, DUMMY: { bg:"#1e3a5f", color:"#93c5fd", border:"#1f3460" }, SIMULATED: { bg:"#1e3a5f", color:"#93c5fd", border:"#1f3460" }, FAILED: { bg:"#2d0f0f", color:"#fca5a5", border:"#5c1a1a" } }[log.status] || { bg:"#1a2a4a", color:"#7a94c1", border:"#1f3460" }
              return (
                <div key={i} style={s.card}>
                  <div style={s.cardLeft}>
                    <div style={{...s.avatar, background:"#1e3a5f", fontSize:"18px"}}>📧</div>
                    <div style={{flex:1}}>
                      <div style={s.nameRow}><p style={s.name}>{log.subject}</p><span style={{...s.badge, background: statusColor.bg, color: statusColor.color, border:`1px solid ${statusColor.border}`}}>{log.status}</span></div>
                      <p style={s.email}>✉ To: {log.to}</p>
                      <p style={s.email}>🕐 {new Date(log.sent_at).toLocaleString("en-US", { month:"short", day:"numeric", year:"numeric", hour:"2-digit", minute:"2-digit" })}</p>
                      {log.error && <p style={{...s.email, color:"#fca5a5"}}>⚠ {log.error}</p>}
                      <details style={{marginTop:"8px"}}>
                        <summary style={{...s.email, cursor:"pointer", color:C.accent}}>View email body</summary>
                        <pre style={s.emailBody}>{log.body}</pre>
                      </details>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>}

      </div>
    </div>
  )
}

const s = {
  page: { display:"flex", minHeight:"100vh", background:C.dark, fontFamily:"'Plus Jakarta Sans', sans-serif" },
  sidebar: { width:"240px", background:C.mid, display:"flex", flexDirection:"column", padding:"2rem 1.25rem", gap:"16px", position:"sticky", top:0, height:"100vh", borderRight:`1px solid ${C.border}` },
  logo: { display:"flex", alignItems:"center", gap:"10px" },
  logoMark: { width:"36px", height:"36px", background:C.accent, borderRadius:"8px", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:"900", fontSize:"12px", color:"#fff", fontFamily:"monospace" },
  logoText: { color:C.text, fontWeight:"700", fontSize:"15px" },
  sideLabel: { fontSize:"11px", color:C.muted, letterSpacing:"2px", textTransform:"uppercase" },
  nav: { display:"flex", flexDirection:"column", gap:"4px", flex:1 },
  navBtn: { display:"flex", alignItems:"center", gap:"10px", background:"none", border:"none", color:C.muted, borderRadius:"10px", padding:"11px 14px", fontSize:"13px", cursor:"pointer", fontFamily:"inherit", textAlign:"left" },
  navActive: { background:C.card, color:C.text, borderLeft:`3px solid ${C.accent}` },
  viewOnlyBadge: { fontSize:"12px", color:C.muted, background:C.card, border:`1px solid ${C.border}`, borderRadius:"8px", padding:"8px 12px", textAlign:"center" },
  logoutBtn: { background:"none", border:`1px solid ${C.border}`, color:C.muted, borderRadius:"10px", padding:"10px", fontSize:"13px", cursor:"pointer", fontFamily:"inherit" },
  main: { flex:1, padding:"2.5rem 3rem", overflowY:"auto" },
  header: { marginBottom:"2rem" },
  pageTitle: { fontSize:"26px", fontWeight:"700", color:C.text, margin:"0 0 4px" },
  pageSub: { color:C.muted, fontSize:"14px", margin:0 },
  list: { display:"flex", flexDirection:"column", gap:"12px" },
  empty: { textAlign:"center", color:C.muted, padding:"2rem", background:C.mid, borderRadius:"16px", border:`1px solid ${C.border}`, fontSize:"14px" },
  card: { background:C.mid, borderRadius:"16px", padding:"1.25rem 1.5rem", display:"flex", justifyContent:"space-between", alignItems:"flex-start", border:`1px solid ${C.border}` },
  cardLeft: { display:"flex", gap:"1rem", flex:1 },
  avatar: { width:"42px", height:"42px", background:C.accent, borderRadius:"10px", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:"700", fontSize:"16px", color:"#fff", flexShrink:0 },
  nameRow: { display:"flex", alignItems:"center", gap:"10px", marginBottom:"4px" },
  name: { fontWeight:"600", color:C.text, margin:0, fontSize:"15px" },
  email: { color:C.muted, fontSize:"12px", margin:"0 0 2px" },
  job: { color:C.accent, fontSize:"12px", margin:"0 0 8px" },
  skills: { display:"flex", flexWrap:"wrap", gap:"6px" },
  skill: { fontSize:"11px", color:C.muted, background:C.card, padding:"3px 8px", borderRadius:"20px", border:`1px solid ${C.border}` },
  score: { fontSize:"20px", fontWeight:"700", border:"2px solid", borderRadius:"50%", width:"52px", height:"52px", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 },
  badge: { display:"inline-flex", alignItems:"center", padding:"3px 10px", borderRadius:"20px", fontSize:"11px", fontWeight:"600", whiteSpace:"nowrap" },
  emailBody: { background:C.card, border:`1px solid ${C.border}`, borderRadius:"8px", padding:"12px", fontSize:"12px", color:C.muted, marginTop:"8px", whiteSpace:"pre-wrap", fontFamily:"monospace", lineHeight:1.6 },
  refreshBtn: { background: C.card, border: `1px solid ${C.border}`, color: C.accent, borderRadius: "8px", padding: "8px 16px", fontSize: "13px", cursor: "pointer", fontFamily: "inherit", fontWeight: "600" },
  autoRefreshNote: { fontSize: "12px", color: "#3d5a8a", fontStyle: "italic" },
  viewResumeBtn: { background:"none", border:`1px solid ${C.border}`, color:C.accent, borderRadius:"6px", padding:"4px 10px", fontSize:"12px", cursor:"pointer", marginTop:"8px", fontFamily:"inherit" },
}