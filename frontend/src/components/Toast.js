import { useEffect } from "react"
import React from "react"
let addToastFn = null

export function toast(message, type = "success") {
  if (addToastFn) addToastFn(message, type)
}

toast.success = (msg) => toast(msg, "success")
toast.error   = (msg) => toast(msg, "error")
toast.info    = (msg) => toast(msg, "info")       // ✅ FIX: added missing .info

export default function Toast() {
  const [toasts, setToasts] = React.useState([])

  useEffect(() => {
    addToastFn = (message, type) => {
      const id = Date.now()
      setToasts(prev => [...prev, { id, message, type }])
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500)
    }
    return () => { addToastFn = null }
  }, [])

  const getStyles = (type) => {
    if (type === "success") return { bg: "#0f2d1f", border: "#1a5c3a", color: "#6ee7b7", icon: "✓ " }
    if (type === "error")   return { bg: "#2d0f0f", border: "#5c1a1a", color: "#fca5a5", icon: "✗ " }
    if (type === "info")    return { bg: "#0f1e3a", border: "#1f3460", color: "#93c5fd", icon: "ℹ " }
    return                         { bg: "#0f2d1f", border: "#1a5c3a", color: "#6ee7b7", icon: "✓ " }
  }

  return (
    <div style={{
      position: "fixed", top: "20px", right: "20px", zIndex: 9999,
      display: "flex", flexDirection: "column", gap: "10px"
    }}>
      {toasts.map(t => {
        const st = getStyles(t.type)
        return (
          <div key={t.id} style={{
            background: st.bg,
            border: `1px solid ${st.border}`,
            color: st.color,
            padding: "12px 20px", borderRadius: "10px",
            fontSize: "14px", fontFamily: "'Plus Jakarta Sans', sans-serif",
            boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
            animation: "slideIn 0.3s ease-out",
          }}>
            {st.icon}{t.message}
          </div>
        )
      })}
    </div>
  )
}