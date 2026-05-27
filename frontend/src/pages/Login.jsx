import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { jwtDecode } from "jwt-decode"
import API from "../api/axios"

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
  setError("")

  if (!email.trim() || !password.trim()) {
    setError("Email and password are required.")
    return
  }

  setLoading(true)

  try {
    const response = await API.post("token/", {
      email: email.trim(),
      password,
    })

    const token = response.data.access
    const refresh = response.data.refresh
    localStorage.setItem("token", token)
    localStorage.setItem("refresh", refresh)

    const decoded = jwtDecode(token)

    console.log("TOKEN:", token)
    console.log("DECODED:", decoded)
    console.log("ROLE:", decoded.role)

    const routes = {
  ADMIN: "/admin",
  EMPLOYEE: "/employee",
  RECRUITER: "/recruiter",
  HR: "/hr",
  JUNIOR_HR: "/junior-hr"
}
navigate(routes[decoded.role] || "/")

  } catch (err) {
    console.log("LOGIN ERROR:", err.response?.data)

    setError(
      err?.response?.data?.detail ||
      "Invalid email or password."
    )
  } finally {
    setLoading(false)
  }
}

  return (
    <div style={s.page}>
      <div style={s.left}>
        <div style={s.brand}>
          <div style={s.brandMark}>EP</div>
          <p style={s.brandSub}>Employee Portal</p>
        </div>
        <div style={s.tagline}>
          <h1 style={s.tagH}>Manage your<br/>team requests<br/>effortlessly.</h1>
          <p style={s.tagP}>Streamlined job request management for modern teams.</p>
        </div>
      </div>
      <div style={s.right}>
        <div style={s.card}>
          <h2 style={s.cardTitle}>Welcome back</h2>
          <p style={s.cardSub}>Sign in to your account</p>
          <div style={s.field}>
            <label style={s.label}>Email</label>
            <input
              style={s.input}
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
            />
          </div>
          <div style={s.field}>
            <label style={s.label}>Password</label>
            <input
              style={s.input}
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
            />
          </div>
          {error && <div style={s.error}>{error}</div>}
          <button style={{...s.btn, opacity: loading ? 0.7 : 1}} onClick={handleLogin} disabled={loading}>
            {loading ? "Signing in..." : "Sign in →"}
          </button>
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
  page: { display:"flex", minHeight:"100vh", fontFamily:"'Plus Jakarta Sans', sans-serif", background:C.dark },
  left: { flex:1, background:C.mid, padding:"3rem", display:"flex", flexDirection:"column", justifyContent:"space-between", borderRight:`1px solid ${C.border}` },
  brand: { display:"flex", alignItems:"center", gap:"12px" },
  brandMark: { width:"42px", height:"42px", background:C.accent, borderRadius:"8px", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:"900", fontSize:"14px", color:"#fff", fontFamily:"monospace", letterSpacing:"-1px" },
  brandSub: { color:C.muted, fontSize:"13px", letterSpacing:"2px", textTransform:"uppercase", margin:0 },
  tagline: { paddingBottom:"3rem" },
  tagH: { fontSize:"clamp(2rem,4vw,3.2rem)", fontWeight:"700", color:C.text, lineHeight:1.15, margin:"0 0 1.5rem" },
  tagP: { color:C.muted, fontSize:"15px", lineHeight:1.7, maxWidth:"320px", margin:0 },
  right: { width:"480px", background:C.dark, display:"flex", alignItems:"center", justifyContent:"center", padding:"2rem", borderLeft:`1px solid ${C.border}` },
  card: { width:"100%", maxWidth:"360px" },
  cardTitle: { fontSize:"26px", fontWeight:"700", color:C.text, margin:"0 0 6px" },
  cardSub: { color:C.muted, fontSize:"14px", margin:"0 0 2.5rem" },
  field: { marginBottom:"1.25rem" },
  label: { display:"block", fontSize:"12px", color:C.muted, letterSpacing:"1px", textTransform:"uppercase", marginBottom:"8px" },
  input: { width:"100%", padding:"12px 14px", background:C.card, border:`1px solid ${C.border}`, borderRadius:"10px", color:C.text, fontSize:"14px", outline:"none", boxSizing:"border-box" },
  error: { background:"#2d0f0f", border:"1px solid #5c1a1a", color:"#fca5a5", padding:"10px 14px", borderRadius:"8px", fontSize:"13px", marginBottom:"1rem" },
  btn: { width:"100%", padding:"13px", background:C.accent, color:"#fff", border:"none", borderRadius:"10px", fontSize:"15px", fontWeight:"700", cursor:"pointer", letterSpacing:"0.5px", marginTop:"0.5rem" },
}