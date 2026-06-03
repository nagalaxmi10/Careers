import { useEffect, useState } from "react"
import MyProfile from "../components/MyProfile"
import ChangePassword from "../components/ChangePassword"
import FitSummary from "../components/FitSummary"
import { useNavigate } from "react-router-dom"
import API from "../api/axios"
import { toast } from "../components/Toast"

const C = {
  dark:   "#0a0f1e",
  mid:    "#162040",
  card:   "#1a2a4a",
  accent: "#4f8ef7",
  text:   "#e8f0fe",
  muted:  "#7a94c1",
  border: "#1f3460",
  green:  "#6ee7b7",
  red:    "#fca5a5",
  yellow: "#fbbf24",
  purple: "#a78bfa",
}

const STATUS_STYLE = {
  PENDING:  { bg:"#1e3a5f", color:"#93c5fd", dot:"#60a5fa" },
  APPROVED: { bg:"#0f2d1f", color:"#6ee7b7", dot:"#34d399" },
  REJECTED: { bg:"#2d0f0f", color:"#fca5a5", dot:"#f87171" },
}

const ROLE_STYLE = {
  EMPLOYEE:   { bg:"#0f1e3a", color:"#60a5fa",  dot:"#3b82f6" },
  RECRUITER:  { bg:"#1a0f2e", color:"#a78bfa",  dot:"#8b5cf6" },
  HR:         { bg:"#0f2d1f", color:"#6ee7b7",  dot:"#10b981" },
  JUNIOR_HR:  { bg:"#1a2a0f", color:"#86efac",  dot:"#4ade80" },
}

const toArray = (data) => (Array.isArray(data) ? data : data?.results ?? [])

export default function AdminDashboard() {
  const navigate = useNavigate()
  const [requests, setRequests] = useState([])
  const [users, setUsers] = useState([])
  const [resumes, setResumes] = useState([])
  const [interviews, setInterviews] = useState([])
  const [emails, setEmails] = useState([])
  
  const [filter, setFilter] = useState("ALL")
  const [roleFilter, setRoleFilter] = useState("ALL")
  const [tab, setTab] = useState("overview")
  const [expandedUser, setExpandedUser] = useState(null)
  const [stats, setStats] = useState({})

  const load = async () => {
    try {
      const [r, u, res, int, eml] = await Promise.all([
        API.get("jobs/"),
        API.get("accounts/employees/"),
        API.get("recruitment/resumes/"),
        API.get("recruitment/interviews/"),
        API.get("recruitment/email-log/"),
      ])
      setRequests(toArray(r.data))
      setUsers(toArray(u.data))
      setResumes(toArray(res.data))
      setInterviews(toArray(int.data))
      setEmails(Array.isArray(eml.data) ? eml.data : [])
    } catch (err) {
      console.log(err)
    }
  }

  useEffect(() => { 
    load()
    const loadStats = async () => {
      try {
        const r = await API.get("accounts/stats/")
        setStats(r.data)
      } catch (err) { console.log(err) }
    }
    loadStats()
  }, [])

  const deleteUser = async (id) => {
    if (!window.confirm("Delete this user? This cannot be undone.")) return
    try {
      await API.delete(`accounts/employees/${id}/delete/`)
      toast.success("User deleted")
      load()
    } catch (err) { toast.error("Failed to delete") }
  }

  const updateStatus = async (id, newStatus) => {
    try {
      await API.patch(`jobs/${id}/`, { status: newStatus })
      toast.success(`Job ${newStatus}`)
      load()
    } catch (err) { toast.error("Failed to update") }
  }

  const retryEmail = async (id) => {
    try {
      await API.post(`recruitment/resend-email/${id}/`)
      toast.success("Email resent!")
      load()
    } catch(e) { toast.error("Failed to resend") }
  }

  const logout = () => {
    localStorage.removeItem("token")
    localStorage.removeItem("refresh")
    navigate("/")
  }

  const filtered = filter === "ALL" ? requests : requests.filter(r => r.status === filter)
  const counts = {
    total: requests.length,
    pending: requests.filter(r => r.status === "PENDING").length,
    approved: requests.filter(r => r.status === "APPROVED").length,
    rejected: requests.filter(r => r.status === "REJECTED").length,
  }

  const roles = ["ALL", "EMPLOYEE", "RECRUITER", "HR", "JUNIOR_HR"]
  const filteredUsers = roleFilter === "ALL" ? users : users.filter(u => u.role === roleFilter)
  const userCountByRole = (role) => users.filter(u => u.role === role).length

  // ── RENDER FUNCTIONS ──────────────────────────────────

  const renderOverview = () => (
    <div style={{display:"flex", flexWrap:"wrap", gap:"16px"}}>
      <StatCard label="Total Users" value={users.length} color={C.accent} />
      <StatCard label="Pending Jobs" value={counts.pending} color={C.yellow} />
      <StatCard label="Approved Jobs" value={counts.approved} color={C.green} />
      <StatCard label="Total Resumes" value={resumes.length} color={C.purple} />
      <StatCard label="Shortlisted" value={resumes.filter(r => r.is_shortlisted).length} color={C.green} />
      <StatCard label="Interviews" value={interviews.length} color={C.accent} />
      <StatCard label="Emails Sent" value={emails.filter(e => e.status==="SENT").length} color={C.green} />
      <StatCard label="Emails Failed" value={emails.filter(e => e.status==="FAILED").length} color={C.red} />
    </div>
  )

  const renderResumes = () => (
    <div style={s.list}>
      {resumes.length === 0 && <div style={s.empty}>No resumes uploaded yet.</div>}
      {resumes.map(r => {
        const scoreColor = r.match_percentage >= 65 ? C.green : r.match_percentage >= 40 ? C.yellow : C.red
        return (
          <div key={r.id} style={s.card}>
            <div style={{flex:1}}>
              <p style={s.name}>{r.candidate_name || `Applicant #${r.id}`}</p>
              <p style={s.sub}>✉ {r.email || "No email"} | 📋 {r.job_request_details?.title || "N/A"}</p>
              <div style={{display:"flex", gap:"6px", marginTop:"6px"}}>
                {r.is_shortlisted 
                  ? <span style={{...s.badge, background:"#0f2d1f", color:C.green}}>Shortlisted</span>
                  : <span style={{...s.badge, background:"#2d0f0f", color:C.red}}>Not Shortlisted</span>
                }
              </div>
              <FitSummary summary={r.fit_summary} />
            </div>
            <div style={{...s.scoreCircle, color: scoreColor, borderColor: scoreColor}}>
              {r.match_percentage?.toFixed(0)}%
            </div>
          </div>
        )
      })}
    </div>
  )

  const renderInterviews = () => (
    <div style={s.list}>
      {interviews.length === 0 && <div style={s.empty}>No interviews scheduled.</div>}
      {interviews.map(i => {
        const cand = i.candidate_details?.candidate_details
        return (
          <div key={i.id} style={s.card}>
            <div style={{flex:1}}>
              <p style={s.name}>{cand?.candidate_name || "Candidate"}</p>
              <p style={s.sub}>Job: {cand?.job_request_details?.title || "N/A"}</p>
              <p style={s.sub}>📅 {i.interview_date} at ⏰ {i.interview_time}</p>
            </div>
            <span style={{...s.badge, background: i.mode === "ONLINE" ? "#1e3a5f" : "#1a2a4a", color: i.mode === "ONLINE" ? "#93c5fd" : C.muted}}>
              {i.mode}
            </span>
          </div>
        )
      })}
    </div>
  )

  const renderEmails = () => (
    <div style={s.list}>
      {emails.length === 0 && <div style={s.empty}>No email logs.</div>}
      {emails.map(log => {
        const statusColor = log.status === "SENT" ? C.green : log.status === "FAILED" ? C.red : C.muted
        return (
          <div key={log.id} style={s.card}>
            <div style={{flex:1}}>
              <div style={{display:"flex", alignItems:"center", gap:"10px"}}>
                <p style={s.name}>{log.subject}</p>
                <span style={{...s.badge, color: statusColor, background: statusColor+"22"}}>{log.status}</span>
              </div>
              <p style={s.sub}>✉ To: {log.to}</p>
              <p style={s.sub}>🕐 {new Date(log.sent_at).toLocaleString()}</p>
              {log.error && <p style={{...s.sub, color:C.red, marginTop:"4px"}}>⚠ {log.error}</p>}
            </div>
            {log.status === "FAILED" && (
              <button onClick={() => retryEmail(log.id)} style={s.retryBtn}>🔄 Retry</button>
            )}
          </div>
        )
      })}
    </div>
  )

  return (
    <div style={s.page}>
      <div style={s.sidebar}>
        <div style={s.logo}>
          <div style={s.logoMark}>EP</div>
          <span style={s.logoText}>Portal</span>
        </div>
        <div style={s.sideLabel}>Admin Dashboard</div>
        <nav style={s.nav}>
          <NavButton name="overview" icon="📊" label="System Overview" tab={tab} setTab={setTab} />
          <NavButton name="requests" icon="📋" label="Job Approvals" tab={tab} setTab={setTab} />
          <NavButton name="resumes" icon="📄" label="All Resumes" tab={tab} setTab={setTab} />
          <NavButton name="interviews" icon="📅" label="Interviews" tab={tab} setTab={setTab} />
          <NavButton name="emails" icon="📧" label="Email Logs" tab={tab} setTab={setTab} />
          <NavButton name="users" icon="👥" label="All Users" tab={tab} setTab={setTab} />
          <NavButton name="profile" icon="👤" label="My Profile" tab={tab} setTab={setTab} />
          <NavButton name="password" icon="🔑" label="Change Password" tab={tab} setTab={setTab} />
        </nav>
        <button style={s.createBtn} onClick={() => navigate("/admin/create-employee")}>+ New User</button>
        <button style={s.logoutBtn} onClick={logout}>Sign out</button>
      </div>

      <div style={s.main}>
        {tab === "overview" && <>
          <div style={s.header}><h1 style={s.pageTitle}>System Overview</h1><p style={s.pageSub}>OVERVIEW</p></div>
          {renderOverview()}
        </>}

        {tab === "requests" && <>
          <div style={s.header}><h1 style={s.pageTitle}>Job Requests</h1><p style={s.pageSub}>Review and manage all employee requests</p></div>
          <div style={s.stats}>
            {[
              { label:"Total", val: counts.total, bg: C.card, color: C.text },
              { label:"Pending", val: counts.pending, bg: "#1e3a5f", color: "#93c5fd" },
              { label:"Approved", val: counts.approved, bg: "#0f2d1f", color: "#6ee7b7" },
              { label:"Rejected", val: counts.rejected, bg: "#5f2b2b", color: "#fca5a5" },
            ].map(({ label, val, bg, color }) => (
              <div key={label} style={{...s.statCard, background: bg}}>
                <p style={{...s.statLabel, color}}>{label}</p>
                <p style={{...s.statVal, color}}>{val}</p>
              </div>
            ))}
          </div>
          <div style={s.filters}>
            {["ALL","PENDING","APPROVED","REJECTED"].map(f => (
              <button key={f} style={{...s.filterBtn, ...(filter===f ? s.filterActive : {})}} onClick={() => setFilter(f)}>{f}</button>
            ))}
          </div>
          <div style={s.list}>
            {filtered.length === 0 && <div style={s.empty}>No requests found.</div>}
            {filtered.map(r => {
              const st = STATUS_STYLE[r.status] || STATUS_STYLE.PENDING
              return (
                <div key={r.id} style={s.requestCard} onClick={() => navigate(`/request/${r.id}`)}>
                  <div style={s.cardLeft}>
                    <div style={s.cardTop}>
                      <h3 style={s.reqTitle}>{r.title}</h3>
                      <span style={{...s.badge, background: st.bg, color: st.color}}><span style={{...s.dot, background: st.dot}}/>{r.status}</span>
                    </div>
                    <p style={s.reqDesc}>{r.description}</p>
                    <div style={s.meta}>
                      <span style={s.metaItem}>✉ {r.employee_email}</span>
                      <span style={s.metaItem}>🕐 {new Date(r.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  {r.status === "PENDING" && (
                    <div style={s.actions} onClick={e => e.stopPropagation()}>
                      <button style={s.approveBtn} onClick={() => updateStatus(r.id, "APPROVED")}>Approve</button>
                      <button style={s.rejectBtn} onClick={() => updateStatus(r.id, "REJECTED")}>Reject</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>}

        {tab === "resumes" && <>
          <div style={s.header}><h1 style={s.pageTitle}>All Uploaded Resumes</h1><p style={s.pageSub}>Monitor AI screening across all jobs</p></div>
          {renderResumes()}
        </>}

        {tab === "interviews" && <>
          <div style={s.header}><h1 style={s.pageTitle}>Interview Schedule</h1><p style={s.pageSub}>Global view of all interviews</p></div>
          {renderInterviews()}
        </>}

        {tab === "emails" && <>
          <div style={s.header}><h1 style={s.pageTitle}>Email Logs</h1><p style={s.pageSub}>Monitor email delivery and retry failed sends</p></div>
          {renderEmails()}
        </>}

        {tab === "users" && <>
          <div style={s.header}><h1 style={s.pageTitle}>All Users</h1><p style={s.pageSub}>Everyone in the system — click a row to see full details</p></div>
          <div style={s.roleSummary}>
            {["EMPLOYEE","RECRUITER","HR","JUNIOR_HR"].map(role => {
              const rs = ROLE_STYLE[role] || {}
              return (
                <div key={role} style={{...s.rolePill, background: rs.bg, borderColor: rs.dot + "44"}}>
                  <span style={{...s.roleDot, background: rs.dot}}/>
                  <span style={{color: rs.color, fontSize:"13px", fontWeight:"600"}}>{userCountByRole(role)}</span>
                  <span style={{color: rs.color, fontSize:"12px", opacity:0.8}}>{role.replace("_", " ")}</span>
                </div>
              )
            })}
          </div>
          <div style={s.filters}>
            {roles.map(r => (
              <button key={r} style={{...s.filterBtn, ...(roleFilter===r ? s.filterActive : {})}} onClick={() => setRoleFilter(r)}>{r.replace("_"," ")}</button>
            ))}
          </div>
          <div style={s.list}>
            {filteredUsers.length === 0 && <div style={s.empty}>No users found.</div>}
            {filteredUsers.map(u => {
              const rs = ROLE_STYLE[u.role] || ROLE_STYLE.EMPLOYEE
              const isExpanded = expandedUser === u.id
              const name = `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.email
              return (
                <div key={u.id} style={s.userCard}>
                  <div style={s.userRow} onClick={() => setExpandedUser(isExpanded ? null : u.id)}>
                    <div style={s.avatar}>{(u.first_name?.[0] || u.email[0]).toUpperCase()}</div>
                    <div style={{flex:1, minWidth:0}}>
                      <div style={s.userTopRow}>
                        <p style={s.userName}>{name}</p>
                        <span style={{...s.badge, background: rs.bg, color: rs.color, borderColor: rs.dot + "44"}}><span style={{...s.dot, background: rs.dot}}/>{u.role.replace("_", " ")}</span>
                      </div>
                      <p style={s.userEmail}>{u.email}</p>
                      <div style={s.userTags}>
                        {u.position && <span style={s.tag}>💼 {u.position}</span>}
                        {u.department && <span style={s.tag}>🏢 {u.department}</span>}
                      </div>
                    </div>
                    <div style={s.userActions} onClick={e => e.stopPropagation()}>
                      <button style={s.expandBtn} onClick={() => setExpandedUser(isExpanded ? null : u.id)}>{isExpanded ? "▲ Less" : "▼ More"}</button>
                      <button style={s.deleteBtn} onClick={() => deleteUser(u.id)}>Delete</button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div style={s.expandedSection}>
                      <div style={s.detailGrid}>
                        <DetailRow label="Employee ID" val={u.employee_id} />
                        <DetailRow label="Date of Joining" val={u.date_of_joining} />
                        <DetailRow label="Phone" val={u.phone} />
                        <DetailRow label="Department" val={u.department} />
                        <DetailRow label="Position" val={u.position} />
                        <DetailRow label="Address" val={u.address} />
                        <DetailRow label="Emergency Contact" val={u.emergency_contact} />
                        <DetailRow label="Emergency Phone" val={u.emergency_phone} />
                        <DetailRow label="LinkedIn" val={u.linkedin} link />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>}

        {tab === "profile" && <MyProfile />}
        {tab === "password" && <ChangePassword />}
      </div>
    </div>
  )
}

// ── Reusable Sub-Components ──────────────────────────────

function NavButton({ name, icon, label, tab, setTab }) {
  return (
    <button style={{...s.navItem, ...(tab===name ? s.navActive : {})}} onClick={() => setTab(name)}>
      <span style={s.navIcon}>{icon}</span> {label}
    </button>
  )
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ background: C.mid, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "1.25rem 1.5rem", flex: "1 1 180px" }}>
      <span style={{color: C.muted, fontSize: "13px"}}>{label}</span>
      <div style={{color: color || C.text, fontSize: "28px", fontWeight: "700", marginTop: "4px"}}>{value}</div>
    </div>
  )
}

function DetailRow({ label, val, link }) {
  if (!val) return (
    <div style={dr.item}><span style={dr.label}>{label}</span><span style={{...dr.val, color:"#3d5a8a"}}>—</span></div>
  )
  return (
    <div style={dr.item}>
      <span style={dr.label}>{label}</span>
      {link
        ? <a href={val} target="_blank" rel="noreferrer" style={{...dr.val, color:C.accent}}>{val}</a>
        : <span style={dr.val}>{val}</span>
      }
    </div>
  )
}

const dr = {
  item:  { display:"flex", flexDirection:"column", gap:"4px" },
  label: { fontSize:"10px", color:"#7a94c1", letterSpacing:"1px", textTransform:"uppercase" },
  val:   { fontSize:"13px", color:"#e8f0fe", fontWeight:"500" },
}

const s = {
  page: { display:"flex", minHeight:"100vh", background:C.dark, fontFamily:"'Plus Jakarta Sans', sans-serif" },
  sidebar: { width:"250px", background:C.mid, display:"flex", flexDirection:"column", padding:"2rem 1.25rem", gap:"8px", position:"sticky", top:0, height:"100vh", borderRight:`1px solid ${C.border}` },
  logo: { display:"flex", alignItems:"center", gap:"10px", marginBottom:"1rem" },
  logoMark: { width:"36px", height:"36px", background:C.accent, borderRadius:"8px", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:"900", fontSize:"12px", color:"#fff", fontFamily:"monospace" },
  logoText: { color:C.text, fontWeight:"600", fontSize:"15px" },
  sideLabel: { fontSize:"11px", color:C.muted, letterSpacing:"2px", textTransform:"uppercase", marginBottom:"1rem" },
  nav: { flex:1, display:"flex", flexDirection:"column", gap:"4px" },
  navItem: { display:"flex", alignItems:"center", gap:"10px", padding:"10px 12px", borderRadius:"10px", border:"none", background:"none", color:C.muted, fontSize:"14px", cursor:"pointer", textAlign:"left", fontFamily:"inherit" },
  navActive: { background:C.card, color:C.text, borderLeft:`3px solid ${C.accent}` },
  navIcon: { fontSize:"16px" },
  createBtn: { background:C.accent, color:"#fff", border:"none", borderRadius:"10px", padding:"11px", fontSize:"13px", fontWeight:"700", cursor:"pointer", marginTop:"auto", fontFamily:"inherit" },
  logoutBtn: { background:"none", border:`1px solid ${C.border}`, color:C.muted, borderRadius:"10px", padding:"10px", fontSize:"13px", cursor:"pointer", fontFamily:"inherit", marginTop:"8px" },
  main: { flex:1, padding:"2.5rem 3rem", overflowY:"auto", background:C.dark },
  header: { marginBottom:"2rem" },
  pageTitle: { fontSize:"28px", fontWeight:"700", color:C.text, margin:"0 0 4px" },
  pageSub: { color:C.muted, fontSize:"14px", margin:0 },
  stats: { display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"1rem", marginBottom:"2rem" },
  statCard: { padding:"1.25rem 1.5rem", borderRadius:"14px", border:`1px solid ${C.border}` },
  statLabel: { fontSize:"12px", letterSpacing:"1px", textTransform:"uppercase", margin:"0 0 6px", fontFamily:"monospace" },
  statVal: { fontSize:"32px", fontWeight:"700", margin:0 },
  filters: { display:"flex", gap:"8px", marginBottom:"1.5rem", flexWrap:"wrap" },
  filterBtn: { padding:"7px 16px", borderRadius:"20px", border:`1px solid ${C.border}`, background:C.mid, color:C.muted, fontSize:"12px", letterSpacing:"0.5px", cursor:"pointer", fontFamily:"monospace" },
  filterActive: { background:C.accent, color:"#fff", borderColor:C.accent },
  list: { display:"flex", flexDirection:"column", gap:"12px" },
  empty: { textAlign:"center", color:C.muted, padding:"3rem", fontSize:"14px", background:C.mid, borderRadius:"16px", border:`1px solid ${C.border}` },
  card: { background:C.mid, borderRadius:"16px", padding:"1.25rem 1.5rem", display:"flex", justifyContent:"space-between", alignItems:"center", border:`1px solid ${C.border}`, gap:"1rem" },
  name: { fontWeight:"600", color:C.text, margin:0, fontSize:"15px" },
  sub: { color:C.muted, fontSize:"12px", margin:"2px 0 0" },
  badge: { display:"inline-flex", alignItems:"center", gap:"6px", padding:"4px 10px", borderRadius:"20px", fontSize:"11px", fontWeight:"600", letterSpacing:"0.5px", fontFamily:"monospace", whiteSpace:"nowrap", border:"1px solid transparent" },
  dot: { width:"6px", height:"6px", borderRadius:"50%", display:"inline-block" },
  scoreCircle: { fontSize:"20px", fontWeight:"700", border:"2px solid", borderRadius:"50%", width:"52px", height:"52px", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 },
  requestCard: { background:C.mid, borderRadius:"16px", padding:"1.5rem", display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:"1rem", border:`1px solid ${C.border}`, cursor:"pointer" },
  cardLeft: { flex:1 },
  cardTop: { display:"flex", alignItems:"center", gap:"12px", marginBottom:"8px" },
  reqTitle: { fontSize:"16px", fontWeight:"600", color:C.text, margin:0 },
  reqDesc: { color:C.muted, fontSize:"14px", margin:"0 0 12px", lineHeight:1.6 },
  meta: { display:"flex", gap:"16px" },
  metaItem: { fontSize:"12px", color:"#3d5a8a" },
  actions: { display:"flex", gap:"8px", flexShrink:0 },
  approveBtn: { padding:"8px 16px", background:"#0f2d1f", color:"#6ee7b7", border:"1px solid #1a5c3a", borderRadius:"8px", fontSize:"13px", cursor:"pointer", fontWeight:"600", fontFamily:"inherit" },
  rejectBtn: { padding:"8px 16px", background:"#2d0f0f", color:"#fca5a5", border:"1px solid #5c1a1a", borderRadius:"8px", fontSize:"13px", cursor:"pointer", fontWeight:"600", fontFamily:"inherit" },
  retryBtn: { padding:"8px 16px", background:"#2d0f0f", color:"#fca5a5", border:"1px solid #5c1a1a", borderRadius:"8px", fontSize:"12px", cursor:"pointer", fontWeight:"600", fontFamily:"inherit" },
  roleSummary: { display:"flex", gap:"10px", marginBottom:"1.5rem", flexWrap:"wrap" },
  rolePill: { display:"flex", alignItems:"center", gap:"8px", padding:"10px 16px", borderRadius:"12px", border:"1px solid" },
  roleDot: { width:"8px", height:"8px", borderRadius:"50%" },
  userCard: { background:C.mid, borderRadius:"16px", border:`1px solid ${C.border}`, overflow:"hidden" },
  userRow: { padding:"1.25rem 1.5rem", display:"flex", alignItems:"flex-start", gap:"1rem", cursor:"pointer" },
  avatar: { width:"42px", height:"42px", background:C.accent, borderRadius:"12px", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:"700", fontSize:"16px", flexShrink:0 },
  userTopRow: { display:"flex", alignItems:"center", gap:"10px", marginBottom:"3px", flexWrap:"wrap" },
  userName: { fontWeight:"600", color:C.text, margin:0, fontSize:"15px" },
  userEmail: { color:C.muted, fontSize:"13px", margin:"0 0 8px" },
  userTags: { display:"flex", gap:"6px", flexWrap:"wrap" },
  tag: { fontSize:"12px", color:C.muted, background:C.card, padding:"3px 10px", borderRadius:"20px", border:`1px solid ${C.border}` },
  userActions: { display:"flex", gap:"8px", flexShrink:0, alignItems:"flex-start" },
  expandBtn: { padding:"6px 12px", background:C.card, color:C.muted, border:`1px solid ${C.border}`, borderRadius:"8px", fontSize:"12px", cursor:"pointer", fontFamily:"inherit" },
  deleteBtn: { padding:"6px 12px", background:"#2d0f0f", color:"#fca5a5", border:"1px solid #5c1a1a", borderRadius:"8px", fontSize:"12px", cursor:"pointer", fontFamily:"inherit", fontWeight:"600" },
  expandedSection: { borderTop:`1px solid ${C.border}`, padding:"1.5rem", background:C.card },
  detailGrid: { display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:"1.25rem" },
}