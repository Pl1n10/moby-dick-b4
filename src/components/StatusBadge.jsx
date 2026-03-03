import S from '../styles.js'

export default function StatusBadge({ status }) {
  const c = S.statusColors[status] || S.statusColors['New']
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: '4px',
      fontSize: '12px', fontWeight: 600, fontFamily: S.mono,
      background: c.bg, color: c.color, letterSpacing: '0.02em',
    }}>
      {status}
    </span>
  )
}
