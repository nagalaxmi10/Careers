import { useEffect } from "react"
import React from "react"
let addToastFn = null

export function toast(message, type = "success") {
  if (addToastFn) addToastFn(message, type)
}

toast.success = (msg) => toast(msg, "success")
toast.error = (msg) => toast(msg, "error")

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

  return (
    <div style={{
      position: "fixed", top: "20px", right: "20px", zIndex: 9999,
      display: "flex", flexDirection: "column", gap: "10px"
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: t.type === "success" ? "#0f2d1f" : "#2d0f0f",
          border: `1px solid ${t.type === "success" ? "#1a5c3a" : "#5c1a1a"}`,
          color: t.type === "success" ? "#6ee7b7" : "#fca5a5",
          padding: "12px 20px", borderRadius: "10px",
          fontSize: "14px", fontFamily: "'Plus Jakarta Sans', sans-serif",
          boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
          animation: "slideIn 0.3s ease-out",
        }}>
          {t.type === "success" ? "✓ " : "✗ "}{t.message}
        </div>
      ))}
    </div>
  )
}

// Need React import for useState
