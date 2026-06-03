import { useEffect, useState } from "react"
import MyProfile from "../components/MyProfile"
import ChangePassword from "../components/ChangePassword"
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

// ─── Custom Zero-Dependency Dark Calendar ─────────────────────────────────────
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
    `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`

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
                fontSize: "13px", fontFamily: "inherit",
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
    fontSize: "18px", display: "flex", alignItems: "center", justifyContent: "center",
  }
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────
export default function HRDashboard() {
  const navigate = useNavigate()
  const [shortlisted, setShortlisted] = useState([])
  const [interviews, setInterviews] = useState([])
  const [jobs, setJobs] = useState([])
  const [selectedJobId, setSelectedJobId] = useState("ALL")
  const [tab, setTab] = useState("pipeline")
  const [selected, setSelected] = useState(null)
  const [stats, setStats] = useState({})
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [dragOverCol, setDragOverCol] = useState(null)
  const [form, setForm] = useState({
    interview_date: "", interview_time: "", mode: "ONLINE",
    meeting_link: "", location: "", feedback: "",
    round1_done: false, round2_done: false,
  })

  const load = async () => {
    try {
      const [s, i, j] = await Promise.all([
        API.get("recruitment/shortlisted/"),
        API.get("recruitment/interviews/"),
        API.get("jobs/"),
      ])
      setShortlisted(toArray(s.data))
      setInterviews(toArray(i.data))
      setJobs(toArray(j.data))
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
    if (!form.interview_date || !form.interview_time) {
      toast.error("Date and time are required.")
      return
    }
    try {
      await API.post("recruitment/interviews/", {
        candidate:      selected.id,
        interview_date: form.interview_date,
        interview_time: form.interview_time,
        mode:           form.mode,
        meeting_link:   form.meeting_link,
        location:       form.location,
        feedback:       form.feedback,
      })
      await API.patch(`recruitment/shortlisted/${selected.id}/`, { status: "INTERVIEW_SCHEDULED" })
      toast.success("✅ Interview scheduled! Candidate moved to Scheduled column.")
      setSelected(null)
      setForm({ interview_date: "", interview_time: "", mode: "ONLINE", meeting_link: "", location: "", feedback: "", round1_done: false, round2_done: false })
      setTab("pipeline")
      load()
    } catch (err) {
      toast.error("Failed to schedule interview.")
    }
  }

  const updateStatus = async (id, newStatus) => {
    try {
      await API.patch(`recruitment/shortlisted/${id}/`, { status: newStatus })
      toast.success(`Candidate moved to ${newStatus.replace(/_/g, " ")}`)
      load()
    } catch (err) {
      toast.error("Failed to update status")
    }
  }

  // ── DRAG AND DROP ──────────────────────────────────────────────────────────

  const handleDragStart = (e, candId) => {
    e.dataTransfer.setData("candId", String(candId))
    e.dataTransfer.effectAllowed = "move"
    const target = e.currentTarget
    setTimeout(() => { target.style.opacity = "0.5" }, 0)
  }

  const handleDragEnd = (e) => {
    e.currentTarget.style.opacity = "1"
    setDragOverCol(null)
  }

  const handleDragOver = (e, status) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setDragOverCol(status)
  }

  const handleDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverCol(null)
    }
  }

  const handleDrop = async (e, newStatus) => {
    e.preventDefault()
    const candId = e.dataTransfer.getData("candId")
    setDragOverCol(null)
    if (!candId) return

    // Dragging to INTERVIEW_SCHEDULED → open schedule form
    if (newStatus === "INTERVIEW_SCHEDULED") {
      const candidate = shortlisted.find(c => c.id === parseInt(candId))
      if (candidate) {
        setSelected(candidate)
        setTab("schedule")
      }
      return
    }

    // Dragging to SELECTED → confirm
    if (newStatus === "SELECTED") {
      if (!window.confirm("Mark this candidate as Selected?")) return
    }

    // Dragging to REJECTED → confirm
    if (newStatus === "REJECTED") {
      if (!window.confirm("Mark this candidate as Rejected? This cannot be undone.")) return
    }

    // For PENDING / SELECTED / REJECTED — cancel any existing interviews first
    if (newStatus === "PENDING" || newStatus === "SELECTED" || newStatus === "REJECTED") {
      try {
        const freshRes = await API.get("recruitment/interviews/")
        const freshInterviews = toArray(freshRes.data)
        const candIdInt = parseInt(candId)

        const candidateInterviews = freshInterviews.filter(i => {
          if (typeof i.candidate === "object" && i.candidate !== null) {
            return i.candidate.id === candIdInt
          }
          return i.candidate === candIdInt
        })

        for (const interview of candidateInterviews) {
          await API.delete(`recruitment/interviews/${interview.id}/`)
        }
        if (candidateInterviews.length > 0) {
          toast.info("Interview cancelled")
        }
      } catch (err) {
        console.error("Interview cancellation error:", err)
        // Don't block status update
      }
    }

    await updateStatus(candId, newStatus)
  }

  const logout = () => {
    localStorage.removeItem("token")
    localStorage.removeItem("refresh")
    navigate("/")
  }

  const interviewDates = interviews.reduce((acc, curr) => {
    const date = curr.interview_date
    if (!acc[date]) acc[date] = []
    acc[date].push(curr)
    return acc
  }, {})

  const formatDate = (date) => {
    const d = new Date(date)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  }

  const selectedDateStr = formatDate(selectedDate)
  const interviewsForSelectedDate = interviewDates[selectedDateStr] || []

  const filteredShortlisted = selectedJobId === "ALL"
    ? shortlisted
    : shortlisted.filter(c => c.candidate_details?.job_request_details?.id === parseInt(selectedJobId))

  // ── KANBAN — 4 columns only ────────────────────────────────────────────────
  const renderPipeline = () => {
    const columns = [
      { status: "PENDING",             title: "⏳ Pending",          color: "#93c5fd", bg: "#1e3a5f" },
      { status: "INTERVIEW_SCHEDULED", title: "📅 Interview Scheduled", color: "#a78bfa", bg: "#1a2a4a" },
      { status: "SELECTED",            title: "✅ Selected",          color: "#6ee7b7", bg: "#0f2d1f" },
      { status: "REJECTED",            title: "❌ Rejected",          color: "#fca5a5", bg: "#2d0f0f" },
    ]

    return (
      <>
        {/* Job filter */}
        <div style={{ marginBottom: "1.5rem", display: "flex", gap: "12px", alignItems: "center" }}>
          <label style={{ color: C.muted, fontSize: "13px", fontWeight: "600" }}>Filter by Job:</label>
          <select
            value={selectedJobId}
            onChange={e => setSelectedJobId(e.target.value)}
            style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "8px", color: C.text, padding: "8px 12px", fontSize: "13px", outline: "none", fontFamily: "inherit", cursor: "pointer" }}
          >
            <option value="ALL">All Jobs</option>
            {jobs.map(job => (
              <option key={job.id} value={job.id}>{job.title} ({job.department || "N/A"})</option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", gap: "1rem", overflowX: "auto", paddingBottom: "1rem" }}>
          {columns.map(col => {
            const colCandidates = filteredShortlisted.filter(c => {
              // INTERVIEW_SCHEDULED column also shows ROUND_1 and ROUND_2 candidates
              // since those are sub-stages within scheduled interviews
              if (col.status === "INTERVIEW_SCHEDULED") {
                return c.status === "INTERVIEW_SCHEDULED" || c.status === "ROUND_1" || c.status === "ROUND_2"
              }
              return c.status === col.status
            })
            const isHovered = dragOverCol === col.status

            return (
              <div
                key={col.status}
                style={{
                  ...kanban.col,
                  border:     isHovered ? `2px dashed ${col.color}` : `2px solid ${C.border}`,
                  background: isHovered ? col.bg : C.mid,
                  transform:  isHovered ? "scale(1.02)" : "scale(1)",
                  transition: "all 0.2s ease",
                }}
                onDragOver={e => handleDragOver(e, col.status)}
                onDragLeave={handleDragLeave}
                onDrop={e => handleDrop(e, col.status)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                  <h3 style={{ color: col.color, fontSize: "13px", margin: 0, whiteSpace: "nowrap" }}>{col.title}</h3>
                  <span style={{ background: C.card, color: col.color, padding: "2px 8px", borderRadius: "20px", fontSize: "11px", fontWeight: "700" }}>{colCandidates.length}</span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {colCandidates.length === 0 && (
                    <div style={kanban.emptyDrop}>Drag candidates here</div>
                  )}
                  {colCandidates.map(c => {
                    const candidate = c.candidate_details
                    const displayName = candidate?.candidate_name?.trim() || candidate?.email?.split("@")[0] || `Applicant #${c.id}`
                    const score = candidate?.match_percentage || 0
                    const scoreColor = score >= 65 ? "#6ee7b7" : score >= 40 ? "#fbbf24" : "#f87171"

                    // Show round badge inside the scheduled column
                    const roundBadge = c.status === "ROUND_1" ? "R1" : c.status === "ROUND_2" ? "R2" : null

                    return (
                      <div
                        key={c.id}
                        style={kanban.card}
                        draggable
                        onDragStart={e => handleDragStart(e, c.id)}
                        onDragEnd={handleDragEnd}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <p style={{ color: C.text, fontSize: "13px", fontWeight: "600", margin: 0 }}>{displayName}</p>
                            {roundBadge && (
                              <span style={{ fontSize: "10px", background: "#1e3a5f", color: "#93c5fd", padding: "1px 6px", borderRadius: "10px", fontWeight: "700" }}>{roundBadge}</span>
                            )}
                          </div>
                          <div style={{ ...kanban.miniScore, color: scoreColor, borderColor: scoreColor }}>
                            {score.toFixed(0)}%
                          </div>
                        </div>
                        <p style={{ color: C.muted, fontSize: "11px", margin: "0 0 6px" }}>📋 {candidate?.job_request_details?.title || "—"}</p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "8px" }}>
                          {toSkillArray(candidate?.skills).slice(0, 3).map((sk, i) => (
                            <span key={i} style={kanban.miniSkill}>{sk}</span>
                          ))}
                        </div>
                        {c.status === "PENDING" && (
                          <button
                            onClick={() => { setSelected(c); setTab("schedule") }}
                            style={kanban.scheduleBtn}
                          >
                            📅 Schedule Interview
                          </button>
                        )}
                        {(c.status === "INTERVIEW_SCHEDULED" || c.status === "ROUND_1" || c.status === "ROUND_2") && (
                          <button
                            onClick={() => { setSelected(c); setTab("schedule") }}
                            style={{ ...kanban.scheduleBtn, color: "#a78bfa", borderColor: "#a78bfa44" }}
                          >
                            ✏️ Edit / View Details
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </>
    )
  }

  return (
    <div style={s.page}>
      {/* SIDEBAR */}
      <div style={s.sidebar}>
        <div style={s.logo}><div style={s.logoMark}>EP</div><span style={s.logoText}>Portal</span></div>
        <div style={s.sideLabel}>HR Manager</div>
        <nav style={s.nav}>
          <button style={{...s.navBtn, ...(tab==="pipeline"   ? s.navActive : {})}} onClick={() => setTab("pipeline")}><span>📌</span> Candidate Pipeline</button>
          <button style={{...s.navBtn, ...(tab==="interviews" ? s.navActive : {})}} onClick={() => setTab("interviews")}><span>📅</span> Interview Calendar</button>
          <button style={{...s.navBtn, ...(tab==="profile"    ? s.navActive : {})}} onClick={() => setTab("profile")}><span>👤</span> My Profile</button>
          <button style={{...s.navBtn, ...(tab==="password"   ? s.navActive : {})}} onClick={() => setTab("password")}><span>🔑</span> Change Password</button>
        </nav>
        <button style={s.logoutBtn} onClick={logout}>Sign out</button>
      </div>

      {/* MAIN */}
      <div style={s.main}>

        {/* Stats bar */}
        {Object.keys(stats).length > 0 && (
          <div style={{ display: "flex", gap: "16px", marginBottom: "2rem", flexWrap: "wrap" }}>
            {Object.entries(stats).map(([key, value]) => {
              const labels = { shortlisted: "⭐ Shortlisted", interviews_scheduled: "📅 Interviews", emails_sent: "📧 Emails Sent", pending_jobs: "⏳ Pending Approvals" }
              return (
                <div key={key} style={{ background: C.mid, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "1.25rem 1.5rem", flex: "1 1 180px", display: "flex", flexDirection: "column", gap: "4px" }}>
                  <span style={{ color: C.muted, fontSize: "13px" }}>{labels[key] || key}</span>
                  <span style={{ color: C.text, fontSize: "28px", fontWeight: "700" }}>{value}</span>
                </div>
              )
            })}
          </div>
        )}

        {tab === "profile"  && <MyProfile />}
        {tab === "password" && <ChangePassword />}

        {/* ── SCHEDULE FORM TAB ── */}
        {tab === "schedule" && selected && (
          <>
            <div style={s.header}>
              <button onClick={() => { setSelected(null); setTab("pipeline") }} style={s.backBtn}>← Back to Pipeline</button>
              <h1 style={s.pageTitle}>Schedule Interview</h1>
              <p style={s.pageSub}>
                {selected.candidate_details?.candidate_name || "Candidate"} · {selected.candidate_details?.job_request_details?.title || "Open Position"}
              </p>
            </div>

            <div style={s.formCard}>
              <div style={s.formGrid}>
                <div style={s.field}>
                  <label style={s.label}>Interview Date *</label>
                  <input style={s.input} type="date" value={form.interview_date} onChange={e => setForm({...form, interview_date: e.target.value})} />
                </div>
                <div style={s.field}>
                  <label style={s.label}>Interview Time *</label>
                  <input style={s.input} type="time" value={form.interview_time} onChange={e => setForm({...form, interview_time: e.target.value})} />
                </div>
                <div style={s.field}>
                  <label style={s.label}>Mode</label>
                  <select style={s.input} value={form.mode} onChange={e => setForm({...form, mode: e.target.value})}>
                    <option value="ONLINE">Online</option>
                    <option value="OFFLINE">In Person</option>
                  </select>
                </div>
                <div style={s.field}>
                  <label style={s.label}>{form.mode === "ONLINE" ? "Meeting Link" : "Location"}</label>
                  <input
                    style={s.input}
                    placeholder={form.mode === "ONLINE" ? "https://meet.google.com/..." : "Office address"}
                    value={form.mode === "ONLINE" ? form.meeting_link : form.location}
                    onChange={e => setForm({...form, [form.mode === "ONLINE" ? "meeting_link" : "location"]: e.target.value})}
                  />
                </div>
              </div>

              {/* ── Round checkboxes ── */}
              <div style={s.field}>
                <label style={s.label}>Interview Rounds</label>
                <div style={s.roundsBox}>
                  <label style={s.checkLabel}>
                    <input
                      type="checkbox"
                      checked={form.round1_done}
                      onChange={e => {
                        const checked = e.target.checked
                        setForm(f => ({ ...f, round1_done: checked }))
                        // Update candidate status to ROUND_1 when checked
                        if (checked) updateStatus(selected.id, "ROUND_1")
                      }}
                      style={{ accentColor: C.accent }}
                    />
                    <span style={{ color: form.round1_done ? "#60a5fa" : C.muted }}>
                      Round 1 completed
                    </span>
                    {form.round1_done && <span style={s.roundTick}>✓</span>}
                  </label>
                  <label style={s.checkLabel}>
                    <input
                      type="checkbox"
                      checked={form.round2_done}
                      disabled={!form.round1_done}
                      onChange={e => {
                        const checked = e.target.checked
                        setForm(f => ({ ...f, round2_done: checked }))
                        // Update candidate status to ROUND_2 when checked
                        if (checked) updateStatus(selected.id, "ROUND_2")
                        else updateStatus(selected.id, "ROUND_1")
                      }}
                      style={{ accentColor: C.accent, opacity: form.round1_done ? 1 : 0.4 }}
                    />
                    <span style={{ color: form.round2_done ? "#818cf8" : C.muted, opacity: form.round1_done ? 1 : 0.4 }}>
                      Round 2 completed
                    </span>
                    {form.round2_done && <span style={{...s.roundTick, color:"#818cf8"}}>✓</span>}
                  </label>
                </div>
                {!form.round1_done && (
                  <p style={{ color: "#3d5a8a", fontSize: "11px", margin: "6px 0 0" }}>Complete Round 1 before enabling Round 2</p>
                )}
              </div>

              <div style={s.field}>
                <label style={s.label}>Notes (optional)</label>
                <textarea
                  style={{ ...s.input, minHeight: "80px", resize: "vertical" }}
                  placeholder="Interview preparation notes, topics to cover..."
                  value={form.feedback}
                  onChange={e => setForm({...form, feedback: e.target.value})}
                />
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                <button style={s.scheduleSubmitBtn} onClick={scheduleInterview}>
                  Schedule Interview
                </button>
                <button style={s.cancelBtn} onClick={() => { setSelected(null); setTab("pipeline") }}>
                  Cancel
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── KANBAN PIPELINE TAB ── */}
        {tab === "pipeline" && <>
          <div style={s.header}>
            <h1 style={s.pageTitle}>Candidate Pipeline</h1>
            <p style={s.pageSub}>Drag candidates between columns · Use schedule form to mark interview rounds</p>
          </div>
          {renderPipeline()}
        </>}

        {/* ── CALENDAR TAB ── */}
        {tab === "interviews" && <>
          <div style={s.header}>
            <h1 style={s.pageTitle}>Interview Calendar</h1>
            <p style={s.pageSub}>Select a date to view scheduled interviews</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: "1.5rem", alignItems: "flex-start" }}>
            <MiniCalendar interviewDates={interviewDates} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
            <div>
              <h3 style={{ color: C.text, margin: "0 0 1rem", fontSize: "16px" }}>
                {selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                <span style={{ color: C.muted, fontSize: "14px", marginLeft: "8px" }}>
                  {interviewsForSelectedDate.length} interview{interviewsForSelectedDate.length !== 1 ? "s" : ""}
                </span>
              </h3>
              <div style={s.list}>
                {interviewsForSelectedDate.length === 0 && <div style={s.empty}>No interviews on this date.</div>}
                {interviewsForSelectedDate.map(i => {
                  const cand = i.candidate_details?.candidate_details
                  const displayName = cand?.candidate_name?.trim() || cand?.email?.split("@")[0]?.replace(/[._]/g, " ") || "Candidate"
                  const initial = displayName[0].toUpperCase()
                  const jobTitle = cand?.job_request_details?.title || "Open Position"
                  return (
                    <div key={i.id} style={s.interviewCard}>
                      <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                        <div style={s.avatar}>{initial}</div>
                        <div>
                          <p style={s.interviewName}>{displayName}</p>
                          <p style={s.interviewJob}>{jobTitle}</p>
                          <p style={s.interviewMeta}>⏰ {i.interview_time}</p>
                          <p style={s.interviewMeta}>{i.mode === "ONLINE" ? `🔗 ${i.meeting_link || "Online"}` : `📍 ${i.location || "In Person"}`}</p>
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-end" }}>
                        <span style={{ ...s.badge, background: "#1e3a5f", color: "#93c5fd" }}>{i.mode}</span>
                        <button
                          style={s.cancelInterviewBtn}
                          onClick={async () => {
                            if (window.confirm("Cancel this interview?")) {
                              try {
                                await API.delete(`recruitment/interviews/${i.id}/`)
                                toast.success("Interview cancelled")
                                load()
                              } catch (e) { toast.error("Failed") }
                            }
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </>}

      </div>
    </div>
  )
}

// ── Kanban Styles ──────────────────────────────────────────────────────────────
const kanban = {
  col:         { flex: 1, minWidth: "240px", maxWidth: "320px", borderRadius: "16px", padding: "1.25rem", display: "flex", flexDirection: "column", transition: "all 0.2s ease" },
  card:        { background: C.card, padding: "1rem", borderRadius: "12px", border: `1px solid ${C.border}`, cursor: "grab", transition: "0.2s" },
  miniScore:   { fontSize: "12px", fontWeight: "700", border: "1.5px solid", borderRadius: "50%", width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  miniSkill:   { fontSize: "10px", background: C.mid, color: C.muted, padding: "2px 6px", borderRadius: "10px", border: `1px solid ${C.border}` },
  scheduleBtn: { width: "100%", background: C.mid, color: C.accent, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "6px", fontSize: "11px", cursor: "pointer", fontFamily: "inherit", fontWeight: "600" },
  emptyDrop:   { border: `2px dashed ${C.border}`, borderRadius: "12px", padding: "1.5rem", textAlign: "center", color: "#3d5a8a", fontSize: "12px" },
}

// ── Main Styles ────────────────────────────────────────────────────────────────
const s = {
  page:               { display: "flex", minHeight: "100vh", background: "#0a0f1e", fontFamily: "'Plus Jakarta Sans', sans-serif" },
  sidebar:            { width: "240px", background: "#162040", display: "flex", flexDirection: "column", padding: "2rem 1.25rem", gap: "16px", position: "sticky", top: 0, height: "100vh", borderRight: "1px solid #1f3460" },
  logo:               { display: "flex", alignItems: "center", gap: "10px" },
  logoMark:           { width: "36px", height: "36px", background: "#4f8ef7", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "900", fontSize: "12px", color: "#fff", fontFamily: "monospace" },
  logoText:           { color: "#e8f0fe", fontWeight: "700", fontSize: "15px" },
  sideLabel:          { fontSize: "11px", color: "#7a94c1", letterSpacing: "2px", textTransform: "uppercase" },
  nav:                { display: "flex", flexDirection: "column", gap: "4px", flex: 1 },
  navBtn:             { display: "flex", alignItems: "center", gap: "10px", background: "none", border: "none", color: "#7a94c1", borderRadius: "10px", padding: "11px 14px", fontSize: "13px", cursor: "pointer", fontFamily: "inherit", textAlign: "left" },
  navActive:          { background: "#1a2a4a", color: "#e8f0fe", borderLeft: "3px solid #4f8ef7" },
  logoutBtn:          { background: "none", border: "1px solid #1f3460", color: "#7a94c1", borderRadius: "10px", padding: "10px", fontSize: "13px", cursor: "pointer", fontFamily: "inherit" },
  main:               { flex: 1, padding: "2.5rem 3rem", overflowY: "auto" },
  header:             { marginBottom: "2rem" },
  pageTitle:          { fontSize: "26px", fontWeight: "700", color: "#e8f0fe", margin: "0 0 4px" },
  pageSub:            { color: "#7a94c1", fontSize: "14px", margin: 0 },
  backBtn:            { background: "none", border: "1px solid #1f3460", color: "#7a94c1", borderRadius: "8px", padding: "6px 14px", cursor: "pointer", fontSize: "13px", fontFamily: "inherit", marginBottom: "1rem", display: "inline-block" },
  formCard:           { background: "#162040", borderRadius: "16px", padding: "2rem", border: "1px solid #1f3460", maxWidth: "800px" },
  formGrid:           { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" },
  field:              { marginBottom: "1rem" },
  label:              { display: "block", fontSize: "11px", color: "#7a94c1", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "6px" },
  input:              { width: "100%", padding: "10px 12px", background: "#1a2a4a", border: "1px solid #1f3460", borderRadius: "8px", color: "#e8f0fe", fontSize: "13px", outline: "none", boxSizing: "border-box", fontFamily: "inherit" },
  roundsBox:          { display: "flex", flexDirection: "column", gap: "12px", background: "#1a2a4a", border: "1px solid #1f3460", borderRadius: "10px", padding: "14px 16px" },
  checkLabel:         { display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "13px", userSelect: "none" },
  roundTick:          { color: "#60a5fa", fontWeight: "700", fontSize: "14px" },
  scheduleSubmitBtn:  { padding: "11px 24px", background: "#4f8ef7", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", cursor: "pointer", fontFamily: "inherit", fontWeight: "600" },
  cancelBtn:          { padding: "11px 20px", background: "none", border: "1px solid #1f3460", color: "#7a94c1", borderRadius: "8px", fontSize: "13px", cursor: "pointer", fontFamily: "inherit" },
  list:               { display: "flex", flexDirection: "column", gap: "12px" },
  empty:              { textAlign: "center", color: "#7a94c1", padding: "2rem", background: "#162040", borderRadius: "16px", border: "1px solid #1f3460", fontSize: "14px" },
  avatar:             { width: "42px", height: "42px", background: "#4f8ef7", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700", fontSize: "16px", color: "#fff", flexShrink: 0 },
  interviewCard:      { background: "#162040", borderRadius: "16px", padding: "1.25rem 1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid #1f3460" },
  interviewName:      { fontWeight: "600", color: "#e8f0fe", margin: "0 0 4px", fontSize: "15px" },
  interviewJob:       { color: "#4f8ef7", fontSize: "12px", margin: "0 0 6px" },
  interviewMeta:      { color: "#7a94c1", fontSize: "12px", margin: 0 },
  cancelInterviewBtn: { padding: "5px 12px", background: "#2d0f0f", color: "#fca5a5", border: "1px solid #5c1a1a", borderRadius: "8px", fontSize: "12px", cursor: "pointer", fontFamily: "inherit" },
  badge:              { display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: "600", whiteSpace: "nowrap" },
}