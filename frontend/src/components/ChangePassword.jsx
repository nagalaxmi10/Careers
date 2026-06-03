import { useState } from "react"
import API from "../api/axios"
import { toast } from "./Toast"

const C = {
  dark:"#0a0f1e", mid:"#162040", card:"#1a2a4a",
  accent:"#4f8ef7", text:"#e8f0fe", muted:"#7a94c1", border:"#1f3460",
}

export default function ChangePassword() {
  const [passwords, setPasswords] = useState({ old_password: "", new_password: "", confirm: "" })
  const [loading, setLoading] = useState(false)

  const handleChange = async () => {
    if (!passwords.old_password) { toast.error("Enter your current password."); return }
    if (passwords.new_password.length < 6) { toast.error("New password must be at least 6 characters."); return }
    if (passwords.new_password !== passwords.confirm) { toast.error("Passwords don't match."); return }

    setLoading(true)
    try {
      await API.post("accounts/change-password/", {
        old_password: passwords.old_password,
        new_password: passwords.new_password,
      })
      toast.success("Password changed successfully!")
      setPasswords({ old_password: "", new_password: "", confirm: "" })
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to change password.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: "600px" }}>
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "28px", fontWeight: "700", color: C.text, margin: "0 0 4px" }}>🔑 Change Password</h1>
        <p style={{ color: C.muted, fontSize: "14px", margin: 0 }}>Update your account security</p>
      </div>

      <div style={{ background: C.mid, borderRadius: "20px", padding: "2rem", border: `1px solid ${C.border}` }}>
        <div style={{ marginBottom: "1.25rem" }}>
          <label style={{ display: "block", fontSize: "11px", color: C.muted, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "8px" }}>Current Password</label>
          <input 
            style={s.input} 
            type="password" 
            value={passwords.old_password}
            onChange={e => setPasswords({...passwords, old_password: e.target.value})} 
          />
        </div>
        
        <div style={{ marginBottom: "1.25rem" }}>
          <label style={{ display: "block", fontSize: "11px", color: C.muted, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "8px" }}>New Password</label>
          <input 
            style={s.input} 
            type="password" 
            value={passwords.new_password}
            onChange={e => setPasswords({...passwords, new_password: e.target.value})} 
          />
        </div>

        <div style={{ marginBottom: "1.25rem" }}>
          <label style={{ display: "block", fontSize: "11px", color: C.muted, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "8px" }}>Confirm New Password</label>
          <input 
            style={s.input} 
            type="password" 
            value={passwords.confirm}
            onChange={e => setPasswords({...passwords, confirm: e.target.value})} 
            onKeyDown={e => e.key === "Enter" && handleChange()}
          />
        </div>

        <button 
          onClick={handleChange} 
          disabled={loading} 
          style={{ padding: "11px 24px", background: C.accent, color: "#fff", border: "none", borderRadius: "10px", fontSize: "14px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit", opacity: loading ? 0.7 : 1 }}
        >
          {loading ? "Saving..." : "Update Password"}
        </button>
      </div>
    </div>
  )
}

const s = {
  input: { width: "100%", padding: "12px 14px", background: "#1a2a4a", border: "1px solid #1f3460", borderRadius: "10px", fontSize: "14px", color: "#e8f0fe", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }
}