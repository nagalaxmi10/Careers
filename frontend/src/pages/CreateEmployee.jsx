import { useState } from "react"
import { useNavigate } from "react-router-dom"
import API from "../api/axios"

export default function CreateEmployee() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    role: "EMPLOYEE",
    position: "",
    department: "",
    phone: "",
    employee_id: "",
    date_of_joining: "", // FIX: was "joining_date", backend field is "date_of_joining"
  })
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const set = (k, v) => setForm(f => ({...f, [k]: v}))

  const handleSubmit = async () => {
    setError("")
    if (!form.email || !form.password || !form.first_name) {
      setError("First name, email and password are required.")
      return
    }
    setLoading(true)
    try {
      await API.post("accounts/create-employee/", form)
      setSuccess(true)
      setForm({
        first_name: "",
        last_name: "",
        email: "",
        password: "",
        role: "EMPLOYEE",
        position: "",
        department: "",
        phone: "",
        employee_id: "",
        date_of_joining: "",
      })
    } catch (err) {
      setError(err.response?.data?.email?.[0] || "Failed to create employee.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={s.page}>
      <div style={s.topbar}>
        <button style={s.back} onClick={() => navigate("/admin")}>← Back to Dashboard</button>
      </div>
      <div style={s.center}>
        <div style={s.card}>
          <div style={s.iconWrap}><div style={s.icon}>+</div></div>
          <h1 style={s.title}>Create Employee</h1>
          <p style={s.sub}>Add a new employee account to the portal</p>

          {success && (
            <div style={s.successBox}>
              ✓ Employee created successfully!
              <button style={s.anotherBtn} onClick={() => setSuccess(false)}>Create another</button>
            </div>
          )}

          {!success && <>
            {/* FIX: was a single "full_name" field — backend has first_name + last_name separately */}
            <div style={s.row}>
              <div style={s.field}>
                <label style={s.label}>First Name *</label>
                <input style={s.input} placeholder="John" value={form.first_name}
                  onChange={e => set("first_name", e.target.value)} />
              </div>
              <div style={s.field}>
                <label style={s.label}>Last Name</label>
                <input style={s.input} placeholder="Smith" value={form.last_name}
                  onChange={e => set("last_name", e.target.value)} />
              </div>
            </div>

            <div style={s.field}>
              <label style={s.label}>Work Email *</label>
              <input style={s.input} type="email" placeholder="john@company.com" value={form.email}
                onChange={e => set("email", e.target.value)} />
            </div>
            <div style={s.field}>
              <label style={s.label}>Password *</label>
              <input style={s.input} type="password" placeholder="••••••••" value={form.password}
                onChange={e => set("password", e.target.value)} />
            </div>

            {/* FIX: was "JR_HR" — backend Role.choices uses "JUNIOR_HR" */}
            <div style={s.field}>
              <label style={s.label}>Role</label>
              <select style={s.input} value={form.role} onChange={e => set("role", e.target.value)}>
                <option value="EMPLOYEE">Employee</option>
                <option value="RECRUITER">Recruiter</option>
                <option value="HR">HR</option>
                <option value="JUNIOR_HR">Junior HR</option>
              </select>
            </div>

            <div style={s.row}>
              <div style={s.field}>
                <label style={s.label}>Position</label>
                <input style={s.input} placeholder="e.g. Developer" value={form.position}
                  onChange={e => set("position", e.target.value)} />
              </div>
              <div style={s.field}>
                <label style={s.label}>Department</label>
                <input style={s.input} placeholder="e.g. Engineering" value={form.department}
                  onChange={e => set("department", e.target.value)} />
              </div>
            </div>

            <div style={s.row}>
              <div style={s.field}>
                <label style={s.label}>Employee ID</label>
                <input style={s.input} value={form.employee_id}
                  onChange={e => set("employee_id", e.target.value)} />
              </div>
              <div style={s.field}>
                {/* FIX: removed nonexistent "designation"; was "joining_date" → "date_of_joining" */}
                <label style={s.label}>Date of Joining</label>
                <input type="date" style={s.input} value={form.date_of_joining}
                  onChange={e => set("date_of_joining", e.target.value)} />
              </div>
            </div>

            <div style={s.field}>
              <label style={s.label}>Phone</label>
              <input style={s.input} placeholder="+1 234 567 8900" value={form.phone}
                onChange={e => set("phone", e.target.value)} />
            </div>

            {error && <div style={s.errorBox}>{error}</div>}
            <button style={{...s.btn, opacity: loading ? 0.7 : 1}} onClick={handleSubmit} disabled={loading}>
              {loading ? "Creating..." : "Create Employee →"}
            </button>
          </>}
        </div>
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
  topbar: { padding:"1.5rem 2rem", borderBottom:`1px solid ${C.border}`, background:C.mid },
  back: { background:"none", border:`1px solid ${C.border}`, borderRadius:"8px", padding:"8px 16px", cursor:"pointer", fontSize:"13px", color:C.muted, fontFamily:"inherit" },
  center: { display:"flex", alignItems:"center", justifyContent:"center", padding:"3rem 1rem" },
  card: { background:C.mid, borderRadius:"20px", padding:"3rem", width:"100%", maxWidth:"520px", border:`1px solid ${C.border}` },
  iconWrap: { marginBottom:"1.5rem" },
  icon: { width:"52px", height:"52px", background:C.accent, borderRadius:"14px", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"24px", color:"#fff", fontWeight:"300" },
  title: { fontSize:"26px", fontWeight:"700", color:C.text, margin:"0 0 6px" },
  sub: { color:C.muted, fontSize:"14px", margin:"0 0 2.5rem" },
  row: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:"1rem" },
  field: { marginBottom:"1.25rem" },
  label: { display:"block", fontSize:"11px", color:C.muted, letterSpacing:"1px", textTransform:"uppercase", marginBottom:"7px" },
  input: { width:"100%", padding:"12px 14px", border:`1px solid ${C.border}`, borderRadius:"10px", fontSize:"14px", color:C.text, outline:"none", boxSizing:"border-box", background:C.card, fontFamily:"inherit" },
  errorBox: { background:"#2d0f0f", border:"1px solid #5c1a1a", color:"#fca5a5", padding:"10px 14px", borderRadius:"8px", fontSize:"13px", marginBottom:"1rem" },
  successBox: { background:"#0f2d1f", border:"1px solid #1a5c3a", color:"#6ee7b7", padding:"16px", borderRadius:"10px", fontSize:"14px", marginBottom:"1rem", display:"flex", flexDirection:"column", gap:"12px", alignItems:"flex-start" },
  anotherBtn: { background:C.accent, color:"#fff", border:"none", borderRadius:"7px", padding:"8px 14px", fontSize:"13px", cursor:"pointer", fontFamily:"inherit" },
  btn: { width:"100%", padding:"13px", background:C.accent, color:"#fff", border:"none", borderRadius:"10px", fontSize:"15px", fontWeight:"600", cursor:"pointer", marginTop:"0.5rem", fontFamily:"inherit" },
}
