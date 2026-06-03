/**
 * FitSummary component
 * Shows the RAG-generated fit assessment on candidate cards.
 * Used in HRDashboard and RecruiterDashboard.
 *
 * Props:
 *   summary  : string  — the fit_summary from the backend
 *   compact  : bool    — if true, truncates to 1 line with expand toggle
 */

import { useState } from "react"

const C = {
  card:   "#1a2a4a",
  accent: "#4f8ef7",
  text:   "#e8f0fe",
  muted:  "#7a94c1",
  border: "#1f3460",
}

export default function FitSummary({ summary, compact = true }) {
  const [expanded, setExpanded] = useState(false)

  if (!summary || !summary.trim()) return null

  const isLong = summary.length > 120
  const displayed = compact && !expanded && isLong
    ? summary.slice(0, 120) + "…"
    : summary

  return (
    <div style={s.wrap}>
      <span style={s.label}>🤖 AI fit assessment</span>
      <p style={s.text}>{displayed}</p>
      {compact && isLong && (
        <button style={s.toggle} onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}>
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  )
}

const s = {
  wrap: {
    background: "#0f1e3a",
    border: `1px solid ${C.border}`,
    borderLeft: `3px solid ${C.accent}`,
    borderRadius: "8px",
    padding: "10px 12px",
    marginTop: "10px",
  },
  label: {
    fontSize: "10px",
    color: C.accent,
    letterSpacing: "1px",
    textTransform: "uppercase",
    display: "block",
    marginBottom: "5px",
    fontWeight: "600",
  },
  text: {
    fontSize: "12px",
    color: C.muted,
    margin: 0,
    lineHeight: 1.6,
  },
  toggle: {
    background: "none",
    border: "none",
    color: C.accent,
    fontSize: "11px",
    cursor: "pointer",
    padding: "4px 0 0",
    fontFamily: "inherit",
    display: "block",
  },
}