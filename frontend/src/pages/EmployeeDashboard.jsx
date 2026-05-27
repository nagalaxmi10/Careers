import { useEffect, useState, useRef } from "react"
import { useNavigate } from "react-router-dom"
import API from "../api/axios"
import MyProfile from "./MyProfile"
import { toast } from "../components/Toast"// ✅ Toast import

// ─── Skill library ───────────────────────────────────────────────────────────
const SKILL_CATEGORIES = {
  "Frontend": ["React", "Vue.js", "Angular", "Next.js", "TypeScript", "JavaScript", "HTML", "CSS", "Tailwind CSS", "Redux", "GraphQL", "Webpack", "Vite", "Sass/SCSS"],
  "Backend": ["Node.js", "Python", "Django", "FastAPI", "Flask", "Java", "Spring Boot", "Go", "Ruby on Rails", "PHP", "Laravel", "Express.js", "NestJS", "REST APIs"],
  "Mobile": ["React Native", "Flutter", "Swift", "Kotlin", "iOS", "Android", "Expo"],
  "Database": ["PostgreSQL", "MySQL", "MongoDB", "Redis", "SQLite", "Elasticsearch", "Firebase", "DynamoDB", "Supabase"],
  "DevOps & Cloud": ["Docker", "Kubernetes", "AWS", "GCP", "Azure", "CI/CD", "Jenkins", "GitHub Actions", "Terraform", "Linux", "Nginx"],
  "Data & AI": ["Machine Learning", "Deep Learning", "TensorFlow", "PyTorch", "Pandas", "NumPy", "Scikit-learn", "NLP", "Computer Vision", "LLMs", "Data Analysis", "SQL", "Power BI", "Tableau"],
  "Design": ["Figma", "Adobe XD", "UI/UX Design", "Wireframing", "Prototyping", "Sketch"],
  "Testing": ["Jest", "Pytest", "Selenium", "Cypress", "Unit Testing", "Integration Testing", "TDD"],
  "Tools & Practices": ["Git", "Agile", "Scrum", "Jira", "Postman", "Microservices", "System Design", "Code Review"],
  "Other": ["Communication", "Leadership", "Project Management", "Technical Writing", "Excel", "Problem Solving"],
}

const ALL_SKILLS = Object.values(SKILL_CATEGORIES).flat()

// ─── SkillPicker component ────────────────────────────────────────────────────
function SkillPicker({ selected, onChange }) {
  const [search, setSearch] = useState("")
  const [open, setOpen] = useState(false)
  const [activeCategory, setActiveCategory] = useState("All")
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const toggle = (skill) => {
    if (selected.includes(skill)) onChange(selected.filter(s => s !== skill))
    else onChange([...selected, skill])
  }

  const addCustom = () => {
    const val = search.trim()
    if (!val || selected.includes(val)) return
    onChange([...selected, val])
    setSearch("")
  }

  const categories = ["All", ...Object.keys(SKILL_CATEGORIES)]
  const filtered = (() => {
    const pool = activeCategory === "All" ? ALL_SKILLS : (SKILL_CATEGORIES[activeCategory] || [])
    if (!search.trim()) return pool
    return pool.filter(s => s.toLowerCase().includes(search.toLowerCase()))
  })()
  const customNotInList = search.trim() && !ALL_SKILLS.some(s => s.toLowerCase() === search.trim().toLowerCase())

  return (
    <div ref={ref} style={{ position:"relative" }}>
      <div style={sp.tagBox} onClick={() => setOpen(true)}>
        {selected.length === 0 && <span style={sp.placeholder}>Search or select skills...</span>}
        {selected.map(sk => (
          <span key={sk} style={sp.tag}>{sk}<button style={sp.tagRemove} onClick={e => { e.stopPropagation(); toggle(sk) }}>×</button></span>
        ))}
        <input style={sp.searchInput} placeholder={selected.length > 0 ? "Add more..." : ""} value={search} onChange={e => { setSearch(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustom() } if (e.key === "Backspace" && !search && selected.length > 0) onChange(selected.slice(0, -1)) }}
        />
      </div>
      {open && (
        <div style={sp.dropdown}>
          <div style={sp.catRow}>{categories.map(cat => (<button key={cat} style={{...sp.catBtn, ...(activeCategory===cat ? sp.catActive : {})}} onMouseDown={e => { e.preventDefault(); setActiveCategory(cat) }}>{cat}</button>))}</div>
          <div style={sp.skillGrid}>
            {filtered.length === 0 && !customNotInList && <p style={sp.noResults}>No matching skills found.</p>}
            {filtered.map(sk => { const isSelected = selected.includes(sk); return (<button key={sk} style={{...sp.skillBtn, ...(isSelected ? sp.skillSelected : {})}} onMouseDown={e => { e.preventDefault(); toggle(sk) }}>{isSelected && <span style={sp.checkmark}>✓ </span>}{sk}</button>) })}
            {customNotInList && <button style={{...sp.skillBtn, ...sp.customBtn}} onMouseDown={e => { e.preventDefault(); addCustom() }}>+ Add "{search.trim()}"</button>}
          </div>
          <div style={sp.dropFooter}>{selected.length} skill{selected.length !== 1 ? "s" : ""} selected{selected.length > 0 && <button style={sp.clearAll} onMouseDown={e => { e.preventDefault(); onChange([]) }}>Clear all</button>}</div>
        </div>
      )}
    </div>
  )
}

const C = { dark:"#0a0f1e", mid:"#162040", card:"#1a2a4a", accent:"#4f8ef7", text:"#e8f0fe", muted:"#7a94c1", border:"#1f3460" }

const sp = {
  tagBox: { minHeight:"46px", padding:"6px 10px", background:C.card, border:`1px solid ${C.border}`, borderRadius:"10px", display:"flex", flexWrap:"wrap", gap:"6px", alignItems:"center", cursor:"text" },
  placeholder: { color:"#3d5a8a", fontSize:"14px", userSelect:"none" },
  tag: { display:"inline-flex", alignItems:"center", gap:"5px", background:"#0f1e3a", color:"#60a5fa", border:"1px solid #1f3460", borderRadius:"20px", padding:"3px 10px", fontSize:"12px", fontWeight:"500" },
  tagRemove: { background:"none", border:"none", color:"#60a5fa", cursor:"pointer", fontSize:"14px", lineHeight:1, padding:0, display:"flex", alignItems:"center" },
  searchInput: { background:"none", border:"none", outline:"none", color:C.text, fontSize:"13px", fontFamily:"inherit", minWidth:"120px", flex:1 },
  dropdown: { position:"absolute", top:"calc(100% + 6px)", left:0, right:0, background:"#0d1a33", border:`1px solid ${C.border}`, borderRadius:"12px", zIndex:100, boxShadow:"0 8px 32px rgba(0,0,0,0.5)", overflow:"hidden" },
  catRow: { display:"flex", gap:"4px", padding:"10px 10px 0", overflowX:"auto", flexWrap:"nowrap" },
  catBtn: { padding:"5px 12px", borderRadius:"20px", border:`1px solid ${C.border}`, background:"none", color:C.muted, fontSize:"11px", cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap", flexShrink:0 },
  catActive: { background:C.accent, color:"#fff", borderColor:C.accent },
  skillGrid: { display:"flex", flexWrap:"wrap", gap:"6px", padding:"10px", maxHeight:"220px", overflowY:"auto" },
  skillBtn: { padding:"5px 12px", borderRadius:"20px", border:`1px solid ${C.border}`, background:C.card, color:C.muted, fontSize:"12px", cursor:"pointer", fontFamily:"inherit" },
  skillSelected: { background:"#0f1e3a", color:"#60a5fa", borderColor:"#3b82f6" },
  checkmark: { color:"#60a5fa", fontSize:"10px" },
  customBtn: { background:"#1a2a0f", color:"#86efac", borderColor:"#4ade8044" },
  noResults: { color:C.muted, fontSize:"13px", padding:"1rem", margin:0 },
  dropFooter: { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 12px", borderTop:`1px solid ${C.border}`, fontSize:"12px", color:C.muted },
  clearAll: { background:"none", border:"none", color:"#f87171", fontSize:"12px", cursor:"pointer", fontFamily:"inherit" },
}

const STATUS_STYLE = {
  PENDING:  { bg:"#1e3a5f", color:"#93c5fd", dot:"#60a5fa" },
  APPROVED: { bg:"#0f2d1f", color:"#6ee7b7", dot:"#34d399" },
  REJECTED: { bg:"#2d0f0f", color:"#fca5a5", dot:"#f87171" },
}

// ✅ Feature 2: Visual Status Stepper Component
function StatusStepper({ status }) {
  const steps = [
    { key: "PENDING", label: "Pending" },
    { key: "APPROVED", label: "Approved" },
    { key: "INTERVIEW_SCHEDULED", label: "Interviewing" },
    { key: "SELECTED", label: "Selected" },
  ]
  
  // Handle REJECTED as a special case
  if (status === "REJECTED") {
    return (
      <div style={{display:"flex", alignItems:"center", gap:"8px", marginTop:"12px"}}>
        <div style={{width:"10px", height:"10px", borderRadius:"50%", background:"#f87171", boxShadow:"0 0 8px #f8717188"}} />
        <span style={{color:"#fca5a5", fontSize:"12px", fontWeight:"600"}}>Rejected</span>
      </div>
    )
  }

  const currentIndex = steps.findIndex(s => s.key === status)

  return (
    <div style={{display:"flex", alignItems:"center", gap:"0", marginTop:"16px"}}>
      {steps.map((step, i) => {
        const isCompleted = i <= currentIndex
        const isCurrent = i === currentIndex
        const color = isCompleted ? "#34d399" : "#1f3460"
        const textColor = isCompleted ? "#6ee7b7" : "#3d5a8a"

        return (
          <div key={step.key} style={{display:"flex", alignItems:"center", flex: i < steps.length - 1 ? 1 : "none"}}>
            <div style={{display:"flex", flexDirection:"column", alignItems:"center"}}>
              <div style={{
                width: isCurrent ? "14px" : "10px", 
                height: isCurrent ? "14px" : "10px", 
                borderRadius:"50%", 
                background: color,
                border: isCurrent ? "2px solid #34d39988" : "none",
                boxShadow: isCurrent ? "0 0 10px #34d39966" : "none",
                transition: "all 0.3s"
              }} />
              <span style={{fontSize:"9px", color: textColor, marginTop:"4px", whiteSpace:"nowrap", fontWeight: isCurrent ? "700" : "400"}}>{step.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div style={{flex:1, height:"2px", background: isCompleted ? "#34d399" : "#1f3460", margin:"0 4px", marginBottom:"16px", transition: "all 0.3s"}} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Main dashboard ───────────────────────────────────────────────────────────
export default function EmployeeDashboard() {
  const navigate = useNavigate()
  const [requests, setRequests] = useState([])
  const [form, setForm] = useState({ title: "", description: "", key_responsibilities: "", basic_qualifications: "", preferred_qualifications: "", selectedSkills: [], department: "", experience_required: "", vacancies: "" })
  const [formError, setFormError] = useState("")
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const setF = (k, v) => setForm(f => ({...f, [k]: v}))

  const [profile, setProfile] = useState(null)
  const [tab, setTab] = useState("requests")

  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ title: "", description: "", key_responsibilities: "", basic_qualifications: "", preferred_qualifications: "", selectedSkills: [], department: "", experience_required: "", vacancies: "" })
  const [editMsg, setEditMsg] = useState({ text:"", error:false })
  const setEF = (k, v) => setEditForm(f => ({...f, [k]: v}))

  const load = async () => {
    try {
      const r = await API.get("jobs/")
      setRequests(Array.isArray(r.data) ? r.data : r.data?.results ?? [])
    } catch (err) { console.log(err) }
  }

  const loadProfile = async () => {
    try { const res = await API.get("accounts/me/"); setProfile(res.data || {}) } catch (err) { console.log(err) }
  }

  useEffect(() => { load(); loadProfile() }, [])

  const handleGenerateJD = async () => {
    if (!form.title.trim()) { toast.error("Please enter a Job Title first!"); return }
    setGenerating(true)
    try {
      const r = await API.post("jobs/generate-jd/", { title: form.title })
      setForm(prev => ({
        ...prev,
        description: r.data.description || "",
        key_responsibilities: r.data.key_responsibilities || "",
        basic_qualifications: r.data.basic_qualifications || "",
        preferred_qualifications: r.data.preferred_qualifications || "",
        selectedSkills: r.data.skills_required ? r.data.skills_required.split(",").map(s => s.trim()).filter(Boolean) : prev.selectedSkills,
      }))
      toast.success("JD Generated successfully!")
    } catch (err) { toast.error("Failed to generate. Is Ollama running?") }
    finally { setGenerating(false) }
  }

  const submit = async () => {
    setFormError("")
    if (!form.title.trim()) { setFormError("Position title is required."); return }
    if (form.selectedSkills.length === 0) { setFormError("Select at least one skill."); return }
    setLoading(true)
    try {
      await API.post("jobs/", {
        title: form.title, description: form.description, key_responsibilities: form.key_responsibilities,
        basic_qualifications: form.basic_qualifications, preferred_qualifications: form.preferred_qualifications,
        skills_required: form.selectedSkills.join(", "), department: form.department,
        experience_required: parseFloat(form.experience_required) || 0, vacancies: parseInt(form.vacancies) || 1,
      })
      setForm({ title:"", description:"", key_responsibilities:"", basic_qualifications:"", preferred_qualifications:"", selectedSkills:[], department:"", experience_required:"", vacancies:"" })
      toast.success("Request submitted successfully!")
      load()
    } catch (err) { toast.error("Failed to submit request.") }
    finally { setLoading(false) }
  }

  const startEdit = (r) => {
    setEditingId(r.id)
    setEditForm({ title: r.title || "", description: r.description || "", key_responsibilities: r.key_responsibilities || "", basic_qualifications: r.basic_qualifications || "", preferred_qualifications: r.preferred_qualifications || "", selectedSkills: r.skills_required ? r.skills_required.split(",").map(s => s.trim()) : [], department: r.department || "", experience_required: r.experience_required || "", vacancies: r.vacancies || "" })
  }

  const saveEdit = async () => {
    try {
      await API.patch(`jobs/${editingId}/`, { title: editForm.title, description: editForm.description, key_responsibilities: editForm.key_responsibilities, basic_qualifications: editForm.basic_qualifications, preferred_qualifications: editForm.preferred_qualifications, skills_required: editForm.selectedSkills.join(", "), department: editForm.department, experience_required: parseFloat(editForm.experience_required) || 0, vacancies: parseInt(editForm.vacancies) || 1 })
      toast.success("Request updated!")
      setEditingId(null)
      load()
    } catch (err) { toast.error("Failed to update. Request may already be approved.") }
  }

  const logout = () => { localStorage.removeItem("token"); localStorage.removeItem("refresh"); navigate("/") }
  const pending = requests.filter(r => r?.status === "PENDING").length
  const approved = requests.filter(r => r?.status === "APPROVED").length

  return (
    <div style={s.page}>
      <div style={s.sidebar}>
        <div style={s.logo}><div style={s.logoMark}>EP</div><span style={s.logoText}>Portal</span></div>
        <div style={s.userBox}>
          <div style={s.userAvatar}>{(profile?.email?.[0] || "E").toUpperCase()}</div>
          <div><p style={s.userName}>{profile?.first_name} {profile?.last_name}</p><p style={s.userRole}>{profile?.position || "Employee"}</p></div>
        </div>
        <div style={s.sideStats}>
          <div style={s.sideStat}><span style={s.sideStatVal}>{requests.length}</span><span style={s.sideStatLabel}>Total</span></div>
          <div style={s.sideStat}><span style={{...s.sideStatVal, color:"#60a5fa"}}>{pending}</span><span style={s.sideStatLabel}>Pending</span></div>
          <div style={s.sideStat}><span style={{...s.sideStatVal, color:"#34d399"}}>{approved}</span><span style={s.sideStatLabel}>Approved</span></div>
        </div>
        <nav style={s.nav}>
          <button style={{...s.navBtn, ...(tab==="requests" ? s.navActive : {})}} onClick={() => setTab("requests")}><span style={s.navIcon}>📋</span> My Requests</button>
          <button style={{...s.navBtn, ...(tab==="profile" ? s.navActive : {})}} onClick={() => setTab("profile")}><span style={s.navIcon}>👤</span> My Profile</button>
          <button style={{...s.navBtn, ...(tab==="password" ? s.navActive : {})}} onClick={() => setTab("password")}><span style={s.navIcon}>🔑</span> Change Password</button>
        </nav>
        <button style={s.logoutBtn} onClick={logout}>Sign out</button>
      </div>

      <div style={s.main}>
        {tab === "requests" && <>
          <div style={s.header}><h1 style={s.pageTitle}>My Requests</h1><p style={s.pageSub}>Submit and track your job position requests</p></div>
          <div style={s.formCard}>
            <h2 style={s.formTitle}>New Request</h2>
            <p style={s.formHint}>The more detail you provide, the better the AI can screen resumes for this role.</p>
            <div style={s.field}>
              <label style={s.label}>Position Title *</label>
              <div style={{display:"flex", gap:"10px", alignItems:"center"}}>
                <input style={{...s.input, flex:1}} placeholder="e.g. Senior Frontend Developer" value={form.title} onChange={e => setF("title", e.target.value)} />
                <button onClick={handleGenerateJD} disabled={generating} style={{ background: generating ? "#3d5a8a" : "#4f8ef7", color:"#fff", border:"none", borderRadius:"10px", padding:"12px 20px", fontSize:"14px", fontWeight:"600", cursor: generating ? "not-allowed" : "pointer", whiteSpace:"nowrap", fontFamily:"inherit" }}>
                  {generating ? "Generating..." : "✨ Generate with AI"}
                </button>
              </div>
            </div>
            <div style={s.field}><label style={s.label}>Description</label><textarea style={s.textarea} placeholder="Describe the role..." value={form.description} onChange={e => setF("description", e.target.value)} /></div>
            <div style={s.field}><label style={s.label}>Key Responsibilities</label><textarea style={s.textarea} value={form.key_responsibilities} onChange={e => setF("key_responsibilities", e.target.value)} /></div>
            <div style={s.field}><label style={s.label}>Basic Qualifications</label><textarea style={s.textarea} value={form.basic_qualifications} onChange={e => setF("basic_qualifications", e.target.value)} /></div>
            <div style={s.field}><label style={s.label}>Preferred Qualifications</label><textarea style={s.textarea} value={form.preferred_qualifications} onChange={e => setF("preferred_qualifications", e.target.value)} /></div>
            <div style={s.field}>
              <label style={s.label}>Skills Required * <span style={s.labelHint}>— used for AI resume screening</span></label>
              <SkillPicker selected={form.selectedSkills} onChange={skills => setF("selectedSkills", skills)} />
              {form.selectedSkills.length > 0 && <p style={s.skillCount}>{form.selectedSkills.length} skill{form.selectedSkills.length !== 1 ? "s" : ""} selected</p>}
            </div>
            <div style={s.twoCol}>
              <div style={s.field}><label style={s.label}>Department</label><input style={s.input} value={form.department} onChange={e => setF("department", e.target.value)} /></div>
              <div style={s.field}><label style={s.label}>Experience Required <span style={s.labelHint}>years</span></label><input style={s.input} type="number" min="0" step="0.5" value={form.experience_required} onChange={e => setF("experience_required", e.target.value)} /></div>
            </div>
            <div style={s.field}><label style={s.label}>Number of Vacancies</label><input style={s.input} type="number" min="1" value={form.vacancies} onChange={e => setF("vacancies", e.target.value)} /></div>
            {formError && <div style={s.errorMsg}>{formError}</div>}
            <button style={{...s.submitBtn, opacity: loading ? 0.7 : 1}} onClick={submit} disabled={loading}>{loading ? "Submitting..." : "Submit Request →"}</button>
          </div>

          <h2 style={s.sectionTitle}>Request History</h2>
          <div style={s.list}>
            {requests.length === 0 && <div style={s.empty}>No requests yet. Submit your first one above.</div>}
            {requests.map(r => {
              const isEditing = editingId === r.id
              return (
                <div key={r.id} style={s.card}>
                  {isEditing ? (
                    <>
                      <div style={s.cardTop}><h3 style={s.cardTitle}>✏️ Editing Request</h3><div style={{display:"flex", gap:"8px"}}><button style={s.saveEditBtn} onClick={saveEdit}>Save</button><button style={s.cancelEditBtn} onClick={() => setEditingId(null)}>Cancel</button></div></div>
                      <div style={s.field}><label style={s.label}>Title *</label><input style={s.input} value={editForm.title} onChange={e => setEF("title", e.target.value)} /></div>
                      <div style={s.field}><label style={s.label}>Description</label><textarea style={s.textarea} value={editForm.description} onChange={e => setEF("description", e.target.value)} /></div>
                      <div style={s.field}><label style={s.label}>Key Responsibilities</label><textarea style={s.textarea} value={editForm.key_responsibilities} onChange={e => setEF("key_responsibilities", e.target.value)} /></div>
                      <div style={s.field}><label style={s.label}>Basic Qualifications</label><textarea style={s.textarea} value={editForm.basic_qualifications} onChange={e => setEF("basic_qualifications", e.target.value)} /></div>
                      <div style={s.field}><label style={s.label}>Preferred Qualifications</label><textarea style={s.textarea} value={editForm.preferred_qualifications} onChange={e => setEF("preferred_qualifications", e.target.value)} /></div>
                      <div style={s.field}><label style={s.label}>Skills Required</label><SkillPicker selected={editForm.selectedSkills} onChange={skills => setEF("selectedSkills", skills)} /></div>
                      <div style={s.twoCol}>
                        <div style={s.field}><label style={s.label}>Department</label><input style={s.input} value={editForm.department} onChange={e => setEF("department", e.target.value)} /></div>
                        <div style={s.field}><label style={s.label}>Experience (yrs)</label><input style={s.input} type="number" value={editForm.experience_required} onChange={e => setEF("experience_required", e.target.value)} /></div>
                      </div>
                      <div style={s.field}><label style={s.label}>Vacancies</label><input style={s.input} type="number" value={editForm.vacancies} onChange={e => setEF("vacancies", e.target.value)} /></div>
                    </>
                  ) : (
                    <div onClick={() => navigate(`/my-request/${r.id}`)} style={{cursor:"pointer"}}>
                      <div style={s.cardTop}>
                        <h3 style={s.cardTitle}>{r.title}</h3>
                        <div style={{display:"flex", gap:"8px", alignItems:"center"}}>
                          <button style={s.editBtn} onClick={e => { e.stopPropagation(); startEdit(r) }}>✏️ Edit</button>
                        </div>
                      </div>
                      <p style={s.cardDesc}>{r.description}</p>
                      <div style={s.cardMeta}>
                        {r.department && <span style={s.cardTag}>🏢 {r.department}</span>}
                        {r.experience_required > 0 && <span style={s.cardTag}>💼 {r.experience_required} yrs</span>}
                        {r.vacancies > 0 && <span style={s.cardTag}>👥 {r.vacancies} {r.vacancies === 1 ? "vacancy" : "vacancies"}</span>}
                      </div>
                      {r.skills_required && <div style={s.skillsRow}>{r.skills_required.split(",").map((sk, i) => (<span key={i} style={s.skillTag}>{sk.trim()}</span>))}</div>}
                      
                      {/* ✅ Feature 2: Status Stepper added here! */}
                      <StatusStepper status={r.status} />
                      
                      <p style={s.cardDate}>{new Date(r.created_at).toLocaleDateString("en-US", { month:"long", day:"numeric", year:"numeric" })}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>}
        {(tab === "profile" || tab === "password") && <MyProfile tab={tab} />}
      </div>
    </div>
  )
}

const s = {
  page: { display:"flex", minHeight:"100vh", background:C.dark, fontFamily:"'Plus Jakarta Sans', sans-serif" },
  sidebar: { width:"250px", background:C.mid, display:"flex", flexDirection:"column", padding:"2rem 1.25rem", gap:"20px", position:"sticky", top:0, height:"100vh", borderRight:`1px solid ${C.border}` },
  logo: { display:"flex", alignItems:"center", gap:"10px" },
  logoMark: { width:"38px", height:"38px", background:C.accent, borderRadius:"10px", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:"900", fontSize:"13px", color:"#fff", fontFamily:"monospace" },
  logoText: { color:C.text, fontWeight:"700", fontSize:"16px", letterSpacing:"0.5px" },
  userBox: { display:"flex", alignItems:"center", gap:"12px", background:C.card, borderRadius:"14px", padding:"12px 14px", border:`1px solid ${C.border}` },
  userAvatar: { width:"38px", height:"38px", background:C.accent, borderRadius:"10px", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:"700", fontSize:"15px", color:"#fff", flexShrink:0 },
  userName: { color:C.text, fontSize:"13px", margin:0, fontWeight:"600" },
  userRole: { color:C.muted, fontSize:"11px", margin:0, letterSpacing:"1px", textTransform:"uppercase" },
  sideStats: { display:"flex", gap:"8px" },
  sideStat: { flex:1, background:C.card, borderRadius:"10px", padding:"10px 6px", textAlign:"center", display:"flex", flexDirection:"column", gap:"4px", border:`1px solid ${C.border}` },
  sideStatVal: { color:C.text, fontSize:"20px", fontWeight:"700" },
  sideStatLabel: { color:C.muted, fontSize:"10px", letterSpacing:"1px", textTransform:"uppercase" },
  nav: { display:"flex", flexDirection:"column", gap:"4px" },
  navBtn: { display:"flex", alignItems:"center", gap:"10px", background:"none", border:"none", color:C.muted, borderRadius:"10px", padding:"11px 14px", fontSize:"13px", cursor:"pointer", fontFamily:"inherit", textAlign:"left" },
  navActive: { background:C.card, color:C.text, borderLeft:`3px solid ${C.accent}` },
  navIcon: { fontSize:"15px" },
  logoutBtn: { background:"none", border:`1px solid ${C.border}`, color:C.muted, borderRadius:"10px", padding:"10px", fontSize:"13px", cursor:"pointer", fontFamily:"inherit", marginTop:"auto" },
  main: { flex:1, padding:"2.5rem 3rem", overflowY:"auto", background:C.dark },
  header: { marginBottom:"2rem" },
  pageTitle: { fontSize:"28px", fontWeight:"700", color:C.text, margin:"0 0 4px" },
  pageSub: { color:C.muted, fontSize:"14px", margin:0 },
  formCard: { background:C.mid, borderRadius:"20px", padding:"2rem", marginBottom:"2rem", border:`1px solid ${C.border}` },
  formHint: { color:C.muted, fontSize:"13px", margin:"-0.75rem 0 1.5rem", lineHeight:1.5 },
  formTitle: { fontSize:"17px", fontWeight:"600", color:C.text, margin:"0 0 0.5rem" },
  twoCol: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:"1rem" },
  field: { marginBottom:"1.25rem" },
  label: { display:"block", fontSize:"11px", color:C.muted, letterSpacing:"1px", textTransform:"uppercase", marginBottom:"8px" },
  labelHint: { color:"#3d5a8a", fontWeight:"400", textTransform:"none", letterSpacing:"0", fontSize:"11px" },
  skillCount: { fontSize:"12px", color:C.muted, margin:"6px 0 0" },
  input: { width:"100%", padding:"12px 14px", background:C.card, border:`1px solid ${C.border}`, borderRadius:"10px", fontSize:"14px", color:C.text, outline:"none", boxSizing:"border-box", fontFamily:"inherit" },
  textarea: { width:"100%", padding:"12px 14px", border:`1px solid ${C.border}`, borderRadius:"10px", fontSize:"14px", color:C.text, outline:"none", boxSizing:"border-box", background:C.card, minHeight:"100px", resize:"vertical", fontFamily:"inherit" },
  submitBtn: { padding:"12px 28px", background:C.accent, color:"#fff", border:"none", borderRadius:"10px", fontSize:"14px", fontWeight:"600", cursor:"pointer", fontFamily:"inherit" },
  successMsg: { background:"#0f2d1f", border:"1px solid #1a5c3a", color:"#6ee7b7", padding:"10px 14px", borderRadius:"8px", fontSize:"13px", marginBottom:"1rem" },
  errorMsg: { background:"#2d0f0f", border:"1px solid #5c1a1a", color:"#fca5a5", padding:"10px 14px", borderRadius:"8px", fontSize:"13px", marginBottom:"1rem" },
  sectionTitle: { fontSize:"17px", fontWeight:"600", color:C.text, margin:"0 0 1rem" },
  list: { display:"flex", flexDirection:"column", gap:"12px" },
  empty: { textAlign:"center", color:C.muted, padding:"3rem", fontSize:"14px", background:C.mid, borderRadius:"16px", border:`1px solid ${C.border}` },
  card: { background:C.mid, borderRadius:"16px", padding:"1.5rem", border:`1px solid ${C.border}` },
  cardTop: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"8px" },
  cardTitle: { fontSize:"15px", fontWeight:"600", color:C.text, margin:0 },
  cardDesc: { color:C.muted, fontSize:"14px", margin:"0 0 10px", lineHeight:1.6 },
  cardMeta: { display:"flex", gap:"8px", flexWrap:"wrap", margin:"0 0 10px" },
  cardTag: { fontSize:"12px", color:C.muted, background:C.card, padding:"3px 10px", borderRadius:"20px", border:`1px solid ${C.border}` },
  skillsRow: { display:"flex", gap:"6px", flexWrap:"wrap", margin:"0 0 10px" },
  skillTag: { fontSize:"11px", color:"#4f8ef7", background:"#0f1e3a", padding:"3px 8px", borderRadius:"20px", border:`1px solid ${C.border}` },
  cardDate: { color:"#3d5a8a", fontSize:"12px", margin:"0", marginTop:"8px" },
  editBtn: { padding:"5px 12px", background:"none", border:`1px solid ${C.border}`, color:C.muted, borderRadius:"8px", fontSize:"12px", cursor:"pointer", fontFamily:"inherit" },
  saveEditBtn: { padding:"6px 14px", background:C.accent, color:"#fff", border:"none", borderRadius:"8px", fontSize:"12px", cursor:"pointer", fontFamily:"inherit", fontWeight:"600" },
  cancelEditBtn: { padding:"6px 14px", background:"none", border:`1px solid ${C.border}`, color:C.muted, borderRadius:"8px", fontSize:"12px", cursor:"pointer", fontFamily:"inherit" },
}