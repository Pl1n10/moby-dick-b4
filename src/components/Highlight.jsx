export default function Highlight({ text, query }) {
  if (!query || !text) return text
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${escaped})`, 'gi')
  const parts = text.split(regex)
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} style={{ background: '#58a6ff44', color: 'inherit', borderRadius: '2px', padding: '0 1px' }}>{part}</mark>
      : part
  )
}
