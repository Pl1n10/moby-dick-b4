import S from '../styles.js'

// Renders a task priority as a "P0".."P5" pill. P0 is the most urgent (red),
// P5 the lowest (gray). Defaults to P3 if priority is missing/unknown.
export default function PriorityBadge({ priority }) {
  const p = Number.isInteger(priority) ? priority : 3
  const c = S.priorityColors[p] || S.priorityColors[3]
  return (
    <span style={{
      display: 'inline-block', padding: '3px 8px', borderRadius: '4px',
      fontSize: '12px', fontWeight: 600, fontFamily: S.mono,
      background: c.bg, color: c.color, letterSpacing: '0.02em',
    }}>
      {`P${p}`}
    </span>
  )
}
