import { Navigate } from "react-router-dom"
import { jwtDecode } from "jwt-decode"

// Accepts either:
//   role="ADMIN"                  — single role
//   roles={["ADMIN","EMPLOYEE"]}  — multiple allowed roles
function ProtectedRoute({ children, role, roles }) {
  const token = localStorage.getItem("token")

  if (!token) return <Navigate to="/" />

  try {
    const decoded = jwtDecode(token)

    // Check token expiry
    const now = Math.floor(Date.now() / 1000)
    if (decoded.exp && decoded.exp < now) {
      localStorage.removeItem("token")
      localStorage.removeItem("refresh")
      return <Navigate to="/" />
    }

    // Build allowed list from either prop
    const allowed = roles ?? (role ? [role] : [])
    if (allowed.length > 0 && !allowed.includes(decoded.role)) {
      return <Navigate to="/" />
    }

    return children
  } catch {
    localStorage.removeItem("token")
    localStorage.removeItem("refresh")
    return <Navigate to="/" />
  }
}

export default ProtectedRoute
