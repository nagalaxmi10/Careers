import { useEffect, useState } from "react"
import API from "../api/axios"

const C = {
  dark:"#0a0f1e", mid:"#162040", card:"#1a2a4a",
  accent:"#4f8ef7", text:"#e8f0fe", muted:"#7a94c1", border:"#1f3460",
}

const s = {
  page:        { maxWidth:"600px" },
  header:      { marginBottom:"2rem" },
  pageTitle:   { fontSize:"28px", fontWeight:"700", color:C.text, margin:"0 0 4px" },
  pageSub:     { color:C.muted, fontSize:"14px", margin:0 },
  card:        { background:C.mid, borderRadius:"20px", padding:"2rem", marginBottom:"1.5rem", border:`1px solid ${C.border}` },
  cardTitle:   { fontSize:"16px", fontWeight:"600", color:C.text, margin:"0 0 1.5rem" },
  twoCol:      { display:"grid", gridTemplateColumns:"1fr 1fr", gap:"1rem" },
  field:       { marginBottom:"1.25rem" },
  label:       { display:"block", fontSize:"11px", color:C.muted, letterSpacing:"1px", textTransform:"uppercase", marginBottom:"8px" },
  input:       { width:"100%", padding:"12px 14px", background:C.card, border:`1px solid ${C.border}`, borderRadius:"10px", fontSize:"14px", color:C.text, outline:"none", boxSizing:"border-box", fontFamily:"inherit" },
  readOnly:    { width:"100%", padding:"12px 14px", background:"#0d1525", border:`1px solid ${C.border}`, borderRadius:"10px", fontSize:"14px", color:C.muted, boxSizing:"border-box", fontFamily:"inherit", cursor:"default" },
  btnRow:      { display:"flex", gap:"10px", alignItems:"center", marginTop:"0.5rem" },
  saveBtn:     { padding:"11px 24px", background:C.accent, color:"#fff", border:"none", borderRadius:"10px", fontSize:"14px", fontWeight:"600", cursor:"pointer", fontFamily:"inherit" },
  editBtn:     { padding:"11px 20px", background:"none", border:`1px solid ${C.border}`, color:C.muted, borderRadius:"10px", fontSize:"14px", cursor:"pointer", fontFamily:"inherit" },
  cancelBtn:   { padding:"11px 20px", background:"none", border:`1px solid ${C.border}`, color:C.muted, borderRadius:"10px", fontSize:"14px", cursor:"pointer", fontFamily:"inherit" },
  successMsg:  { background:"#0f2d1f", border:"1px solid #1a5c3a", color:"#6ee7b7", padding:"10px 14px", borderRadius:"8px", fontSize:"13px", marginBottom:"1rem" },
  errorMsg:    { background:"#2d0f0f", border:"1px solid #5c1a1a", color:"#fca5a5", padding:"10px 14px", borderRadius:"8px", fontSize:"13px", marginBottom:"1rem" },
  divider:     { height:"1px", background:C.border, margin:"0 0 1.5rem" },
  badge:       { display:"inline-block", padding:"3px 10px", borderRadius:"20px", fontSize:"11px", fontWeight:"600", background:"#1e3a5f", color:"#93c5fd", border:"1px solid #1f3460", letterSpacing:"0.5px" },
}

export default function MyProfile({ tab }) {
  const [profile, setProfile]           = useState(null)
  const [profileForm, setProfileForm]   = useState(null)
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileMsg, setProfileMsg]     = useState({ text:"", error:false })

  const [passwords, setPasswords]       = useState({ old_password:"", new_password:"", confirm:"" })
  const [passMsg, setPassMsg]           = useState({ text:"", error:false })
  const [passLoading, setPassLoading]   = useState(false)

  const setPF = (k, v) => setProfileForm(f => ({...f, [k]: v}))
  const setPW = (k, v) => setPasswords(p => ({...p, [k]: v}))

  useEffect(() => {
    API.get("accounts/me/").then(res => {
      const data = res.data || {}
      setProfile(data)
      setProfileForm({
        first_name:        data.first_name || "",
        last_name:         data.last_name || "",
        phone:             data.phone || "",
        address:           data.address || "",
        emergency_contact: data.emergency_contact || "",
        emergency_phone:   data.emergency_phone || "",
        linkedin:          data.linkedin || "",
      })
    }).catch(console.error)
  }, [])

  const saveProfile = async () => {
    try {
      const res = await API.patch("accounts/update-profile/", profileForm)
      setProfile(res.data)
      setEditingProfile(false)
      setProfileMsg({ text:"Profile updated successfully!", error:false })
      setTimeout(() => setProfileMsg({ text:"", error:false }), 3000)
    } catch (err) {
      const detail = err?.response?.data
      const msg = typeof detail === "object"
        ? Object.values(detail).flat().join(" ")
        : "Failed to update profile."
      setProfileMsg({ text: msg, error:true })
    }
  }

  const cancelEdit = () => {
    // reset form back to current saved profile
    setProfileForm({
      first_name:        profile?.first_name || "",
      last_name:         profile?.last_name || "",
      phone:             profile?.phone || "",
      address:           profile?.address || "",
      emergency_contact: profile?.emergency_contact || "",
      emergency_phone:   profile?.emergency_phone || "",
      linkedin:          profile?.linkedin || "",
    })
    setEditingProfile(false)
    setProfileMsg({ text:"", error:false })
  }

  const changePassword = async () => {
    setPassMsg({ text:"", error:false })
    if (!passwords.old_password) { setPassMsg({ text:"Enter your current password.", error:true }); return }
    if (passwords.new_password.length < 6) { setPassMsg({ text:"New password must be at least 6 characters.", error:true }); return }
    if (passwords.new_password !== passwords.confirm) { setPassMsg({ text:"Passwords don't match.", error:true }); return }
    setPassLoading(true)
    try {
      await API.post("accounts/change-password/", {
        old_password: passwords.old_password,
        new_password: passwords.new_password,
      })
      setPassMsg({ text:"Password changed successfully!", error:false })
      setPasswords({ old_password:"", new_password:"", confirm:"" })
    } catch (err) {
      setPassMsg({ text: err?.response?.data?.error || "Failed to change password.", error:true })
    } finally {
      setPassLoading(false)
    }
  }

  if (!profile || !profileForm) {
    return <div style={{ color:C.muted, padding:"3rem", textAlign:"center" }}>Loading...</div>
  }

  // ── MY PROFILE TAB ──────────────────────────────────────────────────────────
  if (!tab || tab === "profile") return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.pageTitle}>My Profile</h1>
        <p style={s.pageSub}>View and update your personal information</p>
      </div>

      {/* Read-only info from admin */}
      <div style={s.card}>
        <p style={s.cardTitle}>Account Info <span style={{...s.badge, marginLeft:"8px"}}>Set by admin</span></p>
        <div style={s.divider} />
        <div style={s.twoCol}>
          <div style={s.field}>
            <label style={s.label}>Email</label>
            <div style={s.readOnly}>{profile.email || "—"}</div>
          </div>
          <div style={s.field}>
            <label style={s.label}>Role</label>
            <div style={s.readOnly}>{profile.role || "—"}</div>
          </div>
          <div style={s.field}>
            <label style={s.label}>Position</label>
            <div style={s.readOnly}>{profile.position || "—"}</div>
          </div>
          <div style={s.field}>
            <label style={s.label}>Department</label>
            <div style={s.readOnly}>{profile.department || "—"}</div>
          </div>
        </div>
      </div>

      {/* Editable info */}
      <div style={s.card}>
        <p style={s.cardTitle}>Personal Details</p>
        <div style={s.divider} />

        {profileMsg.text && (
          <div style={profileMsg.error ? s.errorMsg : s.successMsg}>{profileMsg.text}</div>
        )}

        <div style={s.twoCol}>
          <div style={s.field}>
            <label style={s.label}>First Name</label>
            {editingProfile
              ? <input style={s.input} value={profileForm.first_name} onChange={e => setPF("first_name", e.target.value)} />
              : <div style={s.readOnly}>{profile.first_name || "—"}</div>
            }
          </div>
          <div style={s.field}>
            <label style={s.label}>Last Name</label>
            {editingProfile
              ? <input style={s.input} value={profileForm.last_name} onChange={e => setPF("last_name", e.target.value)} />
              : <div style={s.readOnly}>{profile.last_name || "—"}</div>
            }
          </div>
        </div>

        <div style={s.field}>
          <label style={s.label}>Phone</label>
          {editingProfile
            ? <input style={s.input} value={profileForm.phone} onChange={e => setPF("phone", e.target.value)} placeholder="+91 9999999999" />
            : <div style={s.readOnly}>{profile.phone || "—"}</div>
          }
        </div>

        <div style={s.field}>
          <label style={s.label}>Address</label>
          {editingProfile
            ? <input style={s.input} value={profileForm.address} onChange={e => setPF("address", e.target.value)} placeholder="123 Main St, City" />
            : <div style={s.readOnly}>{profile.address || "—"}</div>
          }
        </div>

        <div style={s.twoCol}>
          <div style={s.field}>
            <label style={s.label}>Emergency Contact</label>
            {editingProfile
              ? <input style={s.input} value={profileForm.emergency_contact} onChange={e => setPF("emergency_contact", e.target.value)} placeholder="Full name" />
              : <div style={s.readOnly}>{profile.emergency_contact || "—"}</div>
            }
          </div>
          <div style={s.field}>
            <label style={s.label}>Emergency Phone</label>
            {editingProfile
              ? <input style={s.input} value={profileForm.emergency_phone} onChange={e => setPF("emergency_phone", e.target.value)} placeholder="+91 9999999999" />
              : <div style={s.readOnly}>{profile.emergency_phone || "—"}</div>
            }
          </div>
        </div>

        <div style={s.field}>
          <label style={s.label}>LinkedIn</label>
          {editingProfile
            ? <input style={s.input} value={profileForm.linkedin} onChange={e => setPF("linkedin", e.target.value)} placeholder="https://linkedin.com/in/yourname" />
            : <div style={s.readOnly}>{profile.linkedin || "—"}</div>
          }
        </div>

        <div style={s.btnRow}>
          {editingProfile ? (
            <>
              <button style={s.saveBtn} onClick={saveProfile}>Save Changes</button>
              <button style={s.cancelBtn} onClick={cancelEdit}>Cancel</button>
            </>
          ) : (
            <button style={s.editBtn} onClick={() => setEditingProfile(true)}>✏️ Edit Profile</button>
          )}
        </div>
      </div>
    </div>
  )

  // ── CHANGE PASSWORD TAB ─────────────────────────────────────────────────────
  if (tab === "password") return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.pageTitle}>Change Password</h1>
        <p style={s.pageSub}>Update your account password</p>
      </div>

      <div style={s.card}>
        <p style={s.cardTitle}>New Password</p>
        <div style={s.divider} />

        {passMsg.text && (
          <div style={passMsg.error ? s.errorMsg : s.successMsg}>{passMsg.text}</div>
        )}

        <div style={s.field}>
          <label style={s.label}>Current Password</label>
          <input style={s.input} type="password" value={passwords.old_password}
            onChange={e => setPW("old_password", e.target.value)}
            placeholder="Enter current password" />
        </div>

        <div style={s.field}>
          <label style={s.label}>New Password</label>
          <input style={s.input} type="password" value={passwords.new_password}
            onChange={e => setPW("new_password", e.target.value)}
            placeholder="At least 6 characters" />
        </div>

        <div style={s.field}>
          <label style={s.label}>Confirm New Password</label>
          <input style={s.input} type="password" value={passwords.confirm}
            onChange={e => setPW("confirm", e.target.value)}
            placeholder="Repeat new password"
            onKeyDown={e => e.key === "Enter" && changePassword()} />
        </div>

        <div style={s.btnRow}>
          <button style={{...s.saveBtn, opacity: passLoading ? 0.7 : 1}}
            onClick={changePassword} disabled={passLoading}>
            {passLoading ? "Saving..." : "Update Password"}
          </button>
        </div>
      </div>
    </div>
  )

  return null
}
