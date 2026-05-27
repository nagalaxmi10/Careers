import { useEffect, useState } from "react"
import API from "../api/axios"

const C = {
  dark:   "#0a0f1e",
  mid:    "#162040",
  card:   "#1a2a4a",
  accent: "#4f8ef7",
  text:   "#e8f0fe",
  muted:  "#7a94c1",
  border: "#1f3460",
}

// Read-only field shown in view mode
function ProfileField({ label, value, link }) {
  return (
    <div style={s.fieldItem}>
      <span style={s.fieldLabel}>{label}</span>
      {value
        ? link
          ? <a href={value} target="_blank" rel="noreferrer" style={{...s.fieldValue, color: C.accent}}>{value}</a>
          : <span style={s.fieldValue}>{value}</span>
        : <span style={{...s.fieldValue, color:"#3d5a8a", fontStyle:"italic"}}>Not set</span>
      }
    </div>
  )
}

export default function MyProfile() {
  const [profile, setProfile]       = useState(null)
  const [form, setForm]             = useState(null)
  const [editing, setEditing]       = useState(false)
  const [profileMsg, setProfileMsg] = useState({ text:"", error:false })
  const [tab, setTab]               = useState("profile")   // "profile" | "password"
  const [passwords, setPasswords]   = useState({ old_password:"", new_password:"", confirm:"" })
  const [passMsg, setPassMsg]       = useState({ text:"", error:false })
  const [loading, setLoading]       = useState(false)

  const load = async () => {
    try {
      const res = await API.get("accounts/me/")
      const data = res.data || {}
      setProfile(data)
      setForm({
        first_name:        data.first_name        || "",
        last_name:         data.last_name         || "",
        phone:             data.phone             || "",
        address:           data.address           || "",
        emergency_contact: data.emergency_contact || "",
        emergency_phone:   data.emergency_phone   || "",
        linkedin:          data.linkedin          || "",
      })
    } catch (err) { console.log(err) }
  }

  useEffect(() => { load() }, [])

  const setF = (k, v) => setForm(f => ({...f, [k]: v}))

  const saveProfile = async () => {
    setLoading(true)
    try {
      const res = await API.patch("accounts/update-profile/", form)
      setProfile(res.data)
      setEditing(false)
      setProfileMsg({ text:"Profile updated successfully!", error:false })
      setTimeout(() => setProfileMsg({ text:"", error:false }), 3000)
    } catch (err) {
      const detail = err?.response?.data
      const msg = typeof detail === "object"
        ? Object.values(detail).flat().join(" ")
        : "Failed to update profile."
      setProfileMsg({ text: msg, error:true })
    } finally { setLoading(false) }
  }

  const changePassword = async () => {
    setPassMsg({ text:"", error:false })
    if (passwords.new_password !== passwords.confirm) {
      setPassMsg({ text:"New passwords don't match.", error:true }); return
    }
    if (passwords.new_password.length < 6) {
      setPassMsg({ text:"Password must be at least 6 characters.", error:true }); return
    }
    setLoading(true)
    try {
      await API.post("accounts/change-password/", {
        old_password: passwords.old_password,
        new_password: passwords.new_password,
      })
      setPassMsg({ text:"Password changed successfully!", error:false })
      setPasswords({ old_password:"", new_password:"", confirm:"" })
      setTimeout(() => setPassMsg({ text:"", error:false }), 3000)
    } catch (err) {
      setPassMsg({ text: err?.response?.data?.error || "Failed to change password.", error:true })
    } finally { setLoading(false) }
  }

  if (!profile) return <div style={s.loading}>Loading profile...</div>

  const fullName = `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || "—"
  const avatarLetter = (profile.first_name?.[0] || profile.email?.[0] || "U").toUpperCase()

  return (
    <div style={s.wrapper}>
      {/* Header */}
      <div style={s.header}>
        <h1 style={s.pageTitle}>My Profile</h1>
        <p style={s.pageSub}>Manage your personal information and account security</p>
      </div>

      {/* Profile hero */}
      <div style={s.heroCard}>
        <div style={s.heroAvatar}>{avatarLetter}</div>
        <div style={s.heroInfo}>
          <p style={s.heroName}>{fullName}</p>
          <p style={s.heroEmail}>{profile.email}</p>
          <div style={s.heroTags}>
            <span style={s.roleTag}>{profile.role?.replace("_", " ")}</span>
            {profile.position   && <span style={s.heroTag}>💼 {profile.position}</span>}
            {profile.department && <span style={s.heroTag}>🏢 {profile.department}</span>}
            {profile.employee_id && <span style={s.heroTag}>🪪 {profile.employee_id}</span>}
            {profile.date_of_joining && <span style={s.heroTag}>📅 Joined {profile.date_of_joining}</span>}
          </div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={s.subTabs}>
        <button style={{...s.subTab, ...(tab==="profile" ? s.subTabActive : {})}} onClick={() => setTab("profile")}>
          👤 Profile Info
        </button>
        <button style={{...s.subTab, ...(tab==="password" ? s.subTabActive : {})}} onClick={() => setTab("password")}>
          🔑 Change Password
        </button>
      </div>

      {/* ── PROFILE TAB ── */}
      {tab === "profile" && (
        <div style={s.card}>
          <div style={s.cardHeader}>
            <h2 style={s.cardTitle}>Personal Information</h2>
            {!editing
              ? <button style={s.editBtn} onClick={() => setEditing(true)}>✏️ Edit</button>
              : <div style={s.editActions}>
                  <button style={s.cancelBtn} onClick={() => { setEditing(false); load() }}>Cancel</button>
                  <button style={{...s.saveBtn, opacity: loading ? 0.7 : 1}} onClick={saveProfile} disabled={loading}>
                    {loading ? "Saving..." : "Save Changes"}
                  </button>
                </div>
            }
          </div>

          {profileMsg.text && (
            <div style={{...s.msg, ...(profileMsg.error ? s.msgError : s.msgSuccess)}}>
              {profileMsg.text}
            </div>
          )}

          {/* READ-ONLY view */}
          {!editing && (
            <>
              <p style={s.sectionLabel}>Basic Info</p>
              <div style={s.grid2}>
                <ProfileField label="First Name" value={profile.first_name} />
                <ProfileField label="Last Name"  value={profile.last_name} />
                <ProfileField label="Email"      value={profile.email} />
                <ProfileField label="Phone"      value={profile.phone} />
              </div>

              <div style={s.divider} />
              <p style={s.sectionLabel}>Address & Emergency</p>
              <div style={s.grid2}>
                <ProfileField label="Address"           value={profile.address} />
                <ProfileField label="Emergency Contact" value={profile.emergency_contact} />
                <ProfileField label="Emergency Phone"   value={profile.emergency_phone} />
                <ProfileField label="LinkedIn"          value={profile.linkedin} link />
              </div>

              <div style={s.divider} />
              <p style={s.sectionLabel}>Work Info <span style={s.readOnlyNote}>(set by admin)</span></p>
              <div style={s.grid2}>
                <ProfileField label="Position"        value={profile.position} />
                <ProfileField label="Department"      value={profile.department} />
                <ProfileField label="Employee ID"     value={profile.employee_id} />
                <ProfileField label="Date of Joining" value={profile.date_of_joining} />
              </div>
            </>
          )}

          {/* EDIT view */}
          {editing && (
            <>
              <p style={s.sectionLabel}>Basic Info</p>
              <div style={s.grid2}>
                <div style={s.field}>
                  <label style={s.label}>First Name</label>
                  <input style={s.input} value={form.first_name} onChange={e => setF("first_name", e.target.value)} />
                </div>
                <div style={s.field}>
                  <label style={s.label}>Last Name</label>
                  <input style={s.input} value={form.last_name} onChange={e => setF("last_name", e.target.value)} />
                </div>
                <div style={s.field}>
                  <label style={s.label}>Phone</label>
                  <input style={s.input} placeholder="+1 234 567 8900" value={form.phone} onChange={e => setF("phone", e.target.value)} />
                </div>
              </div>

              <div style={s.divider} />
              <p style={s.sectionLabel}>Address & Emergency</p>
              <div style={s.grid2}>
                <div style={{...s.field, gridColumn:"1 / -1"}}>
                  <label style={s.label}>Address</label>
                  <textarea style={s.textarea} value={form.address} onChange={e => setF("address", e.target.value)} placeholder="Your full address" />
                </div>
                <div style={s.field}>
                  <label style={s.label}>Emergency Contact Name</label>
                  <input style={s.input} value={form.emergency_contact} onChange={e => setF("emergency_contact", e.target.value)} placeholder="e.g. Jane Doe" />
                </div>
                <div style={s.field}>
                  <label style={s.label}>Emergency Phone</label>
                  <input style={s.input} value={form.emergency_phone} onChange={e => setF("emergency_phone", e.target.value)} placeholder="+1 234 567 8900" />
                </div>
                <div style={{...s.field, gridColumn:"1 / -1"}}>
                  <label style={s.label}>LinkedIn URL</label>
                  <input style={s.input} value={form.linkedin} onChange={e => setF("linkedin", e.target.value)} placeholder="https://linkedin.com/in/yourname" />
                </div>
              </div>

              <div style={s.divider} />
              <p style={s.sectionLabel}>Work Info <span style={s.readOnlyNote}>(set by admin — read only)</span></p>
              <div style={s.grid2}>
                <ProfileField label="Position"        value={profile.position} />
                <ProfileField label="Department"      value={profile.department} />
                <ProfileField label="Employee ID"     value={profile.employee_id} />
                <ProfileField label="Date of Joining" value={profile.date_of_joining} />
              </div>
            </>
          )}
        </div>
      )}

      {/* ── PASSWORD TAB ── */}
      {tab === "password" && (
        <div style={{...s.card, maxWidth:"460px"}}>
          <h2 style={s.cardTitle}>Change Password</h2>
          <p style={{color:C.muted, fontSize:"13px", margin:"0 0 1.5rem"}}>
            Your new password must be at least 6 characters.
          </p>

          <div style={s.field}>
            <label style={s.label}>Current Password</label>
            <input style={s.input} type="password" placeholder="••••••••"
              value={passwords.old_password}
              onChange={e => setPasswords({...passwords, old_password: e.target.value})} />
          </div>
          <div style={s.field}>
            <label style={s.label}>New Password</label>
            <input style={s.input} type="password" placeholder="••••••••"
              value={passwords.new_password}
              onChange={e => setPasswords({...passwords, new_password: e.target.value})} />
          </div>
          <div style={s.field}>
            <label style={s.label}>Confirm New Password</label>
            <input style={s.input} type="password" placeholder="••••••••"
              value={passwords.confirm}
              onChange={e => setPasswords({...passwords, confirm: e.target.value})} />
          </div>

          {passMsg.text && (
            <div style={{...s.msg, ...(passMsg.error ? s.msgError : s.msgSuccess)}}>
              {passMsg.text}
            </div>
          )}

          <button
            style={{...s.saveBtn, opacity: loading ? 0.7 : 1}}
            onClick={changePassword}
            disabled={loading}
          >
            {loading ? "Updating..." : "Update Password"}
          </button>
        </div>
      )}
    </div>
  )
}

const s = {
  wrapper: { flex:1 },
  loading: { color:C.muted, padding:"2rem", fontSize:"14px" },
  header: { marginBottom:"2rem" },
  pageTitle: { fontSize:"28px", fontWeight:"700", color:C.text, margin:"0 0 4px" },
  pageSub: { color:C.muted, fontSize:"14px", margin:0 },

  heroCard: { background:C.mid, borderRadius:"20px", padding:"2rem", marginBottom:"1.5rem", border:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:"1.5rem" },
  heroAvatar: { width:"64px", height:"64px", background:C.accent, borderRadius:"16px", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:"800", fontSize:"24px", color:"#fff", flexShrink:0 },
  heroInfo: { flex:1 },
  heroName: { fontSize:"20px", fontWeight:"700", color:C.text, margin:"0 0 4px" },
  heroEmail: { fontSize:"13px", color:C.muted, margin:"0 0 10px" },
  heroTags: { display:"flex", flexWrap:"wrap", gap:"8px" },
  roleTag: { fontSize:"11px", fontWeight:"700", letterSpacing:"1px", color:C.accent, background:"#0f1e3a", border:`1px solid ${C.accent}44`, padding:"4px 12px", borderRadius:"20px", textTransform:"uppercase" },
  heroTag: { fontSize:"12px", color:C.muted, background:C.card, padding:"4px 10px", borderRadius:"20px", border:`1px solid ${C.border}` },

  subTabs: { display:"flex", gap:"8px", marginBottom:"1.5rem" },
  subTab: { padding:"9px 20px", borderRadius:"10px", border:`1px solid ${C.border}`, background:"none", color:C.muted, fontSize:"13px", cursor:"pointer", fontFamily:"inherit", fontWeight:"500" },
  subTabActive: { background:C.card, color:C.text, borderColor:C.accent },

  card: { background:C.mid, borderRadius:"20px", padding:"2rem", border:`1px solid ${C.border}`, marginBottom:"1.5rem" },
  cardHeader: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"1.5rem" },
  cardTitle: { fontSize:"17px", fontWeight:"600", color:C.text, margin:0 },

  sectionLabel: { fontSize:"11px", color:C.muted, letterSpacing:"1px", textTransform:"uppercase", margin:"0 0 1rem", fontFamily:"monospace" },
  readOnlyNote: { color:"#3d5a8a", textTransform:"none", letterSpacing:0, fontFamily:"inherit", fontSize:"11px" },

  grid2: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:"1.25rem", marginBottom:"0.5rem" },

  fieldItem: { display:"flex", flexDirection:"column", gap:"5px" },
  fieldLabel: { fontSize:"10px", color:C.muted, letterSpacing:"1px", textTransform:"uppercase" },
  fieldValue: { fontSize:"14px", fontWeight:"500", color:C.text },

  field: { display:"flex", flexDirection:"column", gap:"7px" },
  label: { fontSize:"11px", color:C.muted, letterSpacing:"1px", textTransform:"uppercase" },
  input: { padding:"11px 14px", background:C.card, border:`1px solid ${C.border}`, borderRadius:"10px", fontSize:"14px", color:C.text, outline:"none", fontFamily:"inherit" },
  textarea: { padding:"11px 14px", background:C.card, border:`1px solid ${C.border}`, borderRadius:"10px", fontSize:"14px", color:C.text, outline:"none", fontFamily:"inherit", resize:"vertical", minHeight:"80px" },

  editBtn: { padding:"8px 18px", background:C.card, color:C.accent, border:`1px solid ${C.accent}44`, borderRadius:"8px", fontSize:"13px", cursor:"pointer", fontFamily:"inherit", fontWeight:"600" },
  editActions: { display:"flex", gap:"8px" },
  cancelBtn: { padding:"8px 16px", background:"none", color:C.muted, border:`1px solid ${C.border}`, borderRadius:"8px", fontSize:"13px", cursor:"pointer", fontFamily:"inherit" },
  saveBtn: { padding:"8px 20px", background:C.accent, color:"#fff", border:"none", borderRadius:"8px", fontSize:"13px", cursor:"pointer", fontFamily:"inherit", fontWeight:"600" },

  divider: { height:"1px", background:C.border, margin:"1.5rem 0" },

  msg: { padding:"10px 14px", borderRadius:"8px", fontSize:"13px", marginBottom:"1.25rem" },
  msgSuccess: { background:"#0f2d1f", border:"1px solid #1a5c3a", color:"#6ee7b7" },
  msgError:   { background:"#2d0f0f", border:"1px solid #5c1a1a", color:"#fca5a5" },
}
