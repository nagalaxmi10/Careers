import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { jwtDecode } from "jwt-decode"
import API from "../api/axios"

const STATUS_STYLE = {
  PENDING:  { bg:"#1e3a5f", color:"#93c5fd", dot:"#60a5fa" },
  APPROVED: { bg:"#0f2d1f", color:"#6ee7b7", dot:"#34d399" },
  REJECTED: { bg:"#2d0f0f", color:"#fca5a5", dot:"#f87171" },
}

export default function RequestDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [request, setRequest] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [actionMsg, setActionMsg] = useState({ text:"", error:false })

  const token = localStorage.getItem("token")
  const role = token ? jwtDecode(token).role : null
  const isAdmin = role === "ADMIN"

  const load = async () => {
    setLoading(true)
    try {
      const res = await API.get(`jobs/${id}/`)
      setRequest(res.data)
    } catch (err) {
      setError("Could not load request. It may not exist or you don't have access.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  const updateStatus = async (status) => {
    try {
      await API.patch(`jobs/${id}/`, { status })
      setActionMsg({ text: `Request ${status.toLowerCase()} successfully.`, error: false })
      load()
      setTimeout(() => setActionMsg({ text:"", error:false }), 3000)
    } catch (err) {
      setActionMsg({ text: "Action failed. Please try again.", error: true })
    }
  }

  const backPath = isAdmin ? "/admin" : "/employee"

  const st = request ? (STATUS_STYLE[request.status] || STATUS_STYLE.PENDING) : STATUS_STYLE.PENDING

  return (
    <div style={s.page}>
      {/* TOPBAR */}
      <div style={s.topbar}>
        <button style={s.back} onClick={() => navigate(backPath)}>← Back to Dashboard</button>
        <div style={s.topbarRole}>{isAdmin ? "Admin View" : "My Request"}</div>
      </div>

      <div style={s.content}>
        {loading && <div style={s.stateBox}>Loading...</div>}
        {error && <div style={{...s.stateBox, color:"#fca5a5"}}>{error}</div>}

        {!loading && !error && request && <>
          {/* HEADER CARD */}
          <div style={s.headerCard}>
            <div style={s.headerTop}>
              <div>
                <h1 style={s.title}>{request.title}</h1>
                {isAdmin && (
                  <p style={s.submittedBy}>Submitted by <strong style={{color: C.accent}}>{request.employee_email}</strong></p>
                )}
              </div>
              <span style={{...s.badge, background: st.bg, color: st.color}}>
                <span style={{...s.dot, background: st.dot}} />
                {request.status}
              </span>
            </div>

            <p style={s.description}>{request.description}</p>
            {request.key_responsibilities && (
  <div style={s.section}>
    <p style={s.metaLabel}>Key Responsibilities</p>
    <pre style={s.preText}>{request.key_responsibilities}</pre>
  </div>
)}
{request.basic_qualifications && (
  <div style={s.section}>
    <p style={s.metaLabel}>Basic Qualifications</p>
    <pre style={s.preText}>{request.basic_qualifications}</pre>
  </div>
)}
{request.preferred_qualifications && (
  <div style={s.section}>
    <p style={s.metaLabel}>Preferred Qualifications</p>
    <pre style={s.preText}>{request.preferred_qualifications}</pre>
  </div>
)}

            <div style={s.metaRow}>
              <div style={s.metaItem}>
                <span style={s.metaLabel}>Department</span>
                <span style={s.metaVal}>{request.department || "—"}</span>
              </div>
              <div style={s.metaItem}>
                <span style={s.metaLabel}>Experience Required</span>
                <span style={s.metaVal}>{request.experience_required ? `${request.experience_required} yrs` : "—"}</span>
              </div>
              <div style={s.metaItem}>
                <span style={s.metaLabel}>Vacancies</span>
                <span style={s.metaVal}>{request.vacancies ?? "—"}</span>
              </div>
              <div style={s.metaItem}>
                <span style={s.metaLabel}>Submitted</span>
                <span style={s.metaVal}>
                  {new Date(request.created_at).toLocaleDateString("en-US", { month:"long", day:"numeric", year:"numeric" })}
                </span>
              </div>
              {request.updated_at !== request.created_at && (
                <div style={s.metaItem}>
                  <span style={s.metaLabel}>Last Updated</span>
                  <span style={s.metaVal}>
                    {new Date(request.updated_at).toLocaleDateString("en-US", { month:"long", day:"numeric", year:"numeric" })}
                  </span>
                </div>
              )}
            </div>

            {request.skills_required && (
              <div style={s.skillsSection}>
                <p style={s.metaLabel}>Skills Required</p>
                <div style={s.skillsRow}>
                  {request.skills_required.split(",").map((sk, i) => (
                    <span key={i} style={s.skillTag}>{sk.trim()}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* RESUME STATS (shown when approved) */}
          {request.status === "APPROVED" && (
            <div style={s.statsRow}>
              <div style={s.statCard}>
                <p style={s.statVal}>{request.resume_count ?? 0}</p>
                <p style={s.statLabel}>Resumes Uploaded</p>
              </div>
              <div style={{...s.statCard, background:"#0f2d1f"}}>
                <p style={{...s.statVal, color:"#6ee7b7"}}>{request.shortlisted_count ?? 0}</p>
                <p style={s.statLabel}>Shortlisted</p>
              </div>
            </div>
          )}

          {/* ADMIN ACTIONS */}
          {isAdmin && request.status === "PENDING" && (
            <div style={s.actionsCard}>
              <h2 style={s.actionsTitle}>Review this request</h2>
              <p style={s.actionsSub}>Approving will make this job visible to recruiters for resume collection.</p>
              {actionMsg.text && (
                <div style={{...s.msg, ...(actionMsg.error ? s.msgError : s.msgSuccess)}}>
                  {actionMsg.text}
                </div>
              )}
              <div style={s.btnRow}>
                <button style={s.approveBtn} onClick={() => updateStatus("APPROVED")}>✓ Approve Request</button>
                <button style={s.rejectBtn} onClick={() => updateStatus("REJECTED")}>✗ Reject Request</button>
              </div>
            </div>
          )}

          {/* ALREADY ACTIONED MESSAGE */}
          {isAdmin && request.status !== "PENDING" && (
            <div style={{...s.actionsCard, opacity: 0.6}}>
              <p style={{color: C.muted, fontSize:"14px", margin:0}}>
                This request has already been <strong>{request.status.toLowerCase()}</strong>. No further action needed.
              </p>
            </div>
          )}

          {/* SUCCESS/ERROR from action */}
          {actionMsg.text && request.status !== "PENDING" && (
            <div style={{...s.msg, ...(actionMsg.error ? s.msgError : s.msgSuccess), marginTop:"1rem"}}>
              {actionMsg.text}
            </div>
          )}
        </>}
      </div>
    </div>
  )
}

const C = {
  dark:   "#0a0f1e",
  mid:    "#162040",
  card:   "#1a2a4a",
  accent: "#4f8ef7",
  text:   "#e8f0fe",
  muted:  "#7a94c1",
  border: "#1f3460",
}

const s = {
  page: { minHeight:"100vh", background:C.dark, fontFamily:"'Plus Jakarta Sans', sans-serif" },
  topbar: { padding:"1.25rem 2.5rem", borderBottom:`1px solid ${C.border}`, background:C.mid, display:"flex", alignItems:"center", justifyContent:"space-between" },
  back: { background:"none", border:`1px solid ${C.border}`, borderRadius:"8px", padding:"8px 16px", cursor:"pointer", fontSize:"13px", color:C.muted, fontFamily:"inherit" },
  topbarRole: { fontSize:"12px", color:C.muted, letterSpacing:"1px", textTransform:"uppercase" },

  content: { maxWidth:"760px", margin:"0 auto", padding:"3rem 2rem" },

  stateBox: { textAlign:"center", padding:"3rem", color:C.muted, fontSize:"15px", background:C.mid, borderRadius:"16px", border:`1px solid ${C.border}` },

  headerCard: { background:C.mid, borderRadius:"20px", padding:"2rem", border:`1px solid ${C.border}`, marginBottom:"1.5rem" },
  headerTop: { display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:"1rem", marginBottom:"1rem" },
  title: { fontSize:"24px", fontWeight:"700", color:C.text, margin:"0 0 6px" },
  submittedBy: { fontSize:"13px", color:C.muted, margin:0 },
  badge: { display:"inline-flex", alignItems:"center", gap:"6px", padding:"6px 14px", borderRadius:"20px", fontSize:"12px", fontWeight:"600", letterSpacing:"0.5px", whiteSpace:"nowrap", flexShrink:0 },
  dot: { width:"7px", height:"7px", borderRadius:"50%", display:"inline-block" },

  description: { color:C.muted, fontSize:"15px", lineHeight:1.7, margin:"0 0 1.75rem" },

  metaRow: { display:"flex", flexWrap:"wrap", gap:"1.5rem", marginBottom:"1.5rem" },
  metaItem: { display:"flex", flexDirection:"column", gap:"5px" },
  metaLabel: { fontSize:"11px", color:C.muted, letterSpacing:"1px", textTransform:"uppercase" },
  metaVal: { fontSize:"14px", fontWeight:"600", color:C.text },

  skillsSection: { marginTop:"0.5rem" },
  skillsRow: { display:"flex", flexWrap:"wrap", gap:"8px", marginTop:"8px" },
  skillTag: { fontSize:"12px", color:C.accent, background:"#0f1e3a", padding:"4px 12px", borderRadius:"20px", border:`1px solid ${C.border}` },

  statsRow: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:"1rem", marginBottom:"1.5rem" },
  statCard: { background:C.card, borderRadius:"16px", padding:"1.5rem", border:`1px solid ${C.border}`, textAlign:"center" },
  statVal: { fontSize:"36px", fontWeight:"700", color:C.text, margin:"0 0 6px" },
  statLabel: { fontSize:"12px", color:C.muted, letterSpacing:"1px", textTransform:"uppercase", margin:0 },

  actionsCard: { background:C.mid, borderRadius:"20px", padding:"1.75rem 2rem", border:`1px solid ${C.border}` },
  actionsTitle: { fontSize:"16px", fontWeight:"600", color:C.text, margin:"0 0 6px" },
  actionsSub: { fontSize:"13px", color:C.muted, margin:"0 0 1.25rem" },
  btnRow: { display:"flex", gap:"12px" },
  approveBtn: { padding:"11px 24px", background:"#0f2d1f", color:"#6ee7b7", border:"1px solid #1a5c3a", borderRadius:"10px", fontSize:"14px", cursor:"pointer", fontWeight:"600", fontFamily:"inherit" },
  rejectBtn: { padding:"11px 24px", background:"#2d0f0f", color:"#fca5a5", border:"1px solid #5c1a1a", borderRadius:"10px", fontSize:"14px", cursor:"pointer", fontWeight:"600", fontFamily:"inherit" },

  msg: { padding:"10px 14px", borderRadius:"8px", fontSize:"13px", marginBottom:"1rem" },
  msgSuccess: { background:"#0f2d1f", border:"1px solid #1a5c3a", color:"#6ee7b7" },
  msgError: { background:"#2d0f0f", border:"1px solid #5c1a1a", color:"#fca5a5" },
  section: { marginBottom:"1.25rem" },
preText: { color:C.muted, fontSize:"13px", lineHeight:1.7, margin:"6px 0 0", whiteSpace:"pre-wrap", fontFamily:"inherit" },
}
