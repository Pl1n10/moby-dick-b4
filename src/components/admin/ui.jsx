import { useState } from 'react'
import S from '../../styles.js'

// Shared bits of the admin console panels.

export const thStyle = {
  padding: '8px 12px', textAlign: 'left', fontWeight: 600,
  fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em',
  color: '#8b949e', borderBottom: '1px solid #21262d',
}

export const tdStyle = { padding: '8px 12px', verticalAlign: 'middle' }

export const smallSelect = {
  ...S.inputBase, padding: '3px 6px', fontSize: '12px', width: 'auto', minWidth: '90px', cursor: 'pointer',
}

export const actionButtonStyle = {
  padding: '4px 10px', background: 'none', border: '1px solid #30363d',
  borderRadius: '4px', color: '#8b949e', fontSize: '11px', fontFamily: S.mono,
  cursor: 'pointer',
}

export const dangerButtonStyle = { ...actionButtonStyle, borderColor: '#f85149aa', color: '#f85149' }

export function PrimaryButton({ disabled, children, ...props }) {
  return (
    <button disabled={disabled} {...props} style={{
      padding: '6px 14px', background: '#238636', border: '1px solid #2ea043',
      borderRadius: '6px', color: '#fff', fontSize: '13px', fontFamily: S.sans,
      fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
    }}>{children}</button>
  )
}

export function Hint({ children }) {
  return (
    <p style={{ fontSize: '12px', color: '#8b949e', marginTop: 0, marginBottom: '12px', lineHeight: 1.5 }}>
      {children}
    </p>
  )
}

export function YouBadge() {
  return (
    <span style={{
      marginLeft: '6px', fontSize: '10px', padding: '1px 5px',
      borderRadius: '8px', background: '#1c3a5e', color: '#58a6ff',
    }}>tu</span>
  )
}

// Click-to-edit text: span → input; saves on blur or Enter, Escape cancels.
// `emptyLabel` is shown (italic) when the value is null/empty.
export function InlineText({ value, onSave, emptyLabel = '—', placeholder, mono = false, maxWidth = '220px' }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')

  const commit = () => {
    setEditing(false)
    const next = draft.trim()
    if ((next || null) !== (value || null)) onSave(next || null)
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false) }
        }}
        placeholder={placeholder}
        style={{ ...S.inputBase, padding: '3px 6px', fontSize: '12px', maxWidth, fontFamily: mono ? S.mono : S.sans }}
      />
    )
  }
  return (
    <span
      onClick={() => { setDraft(value ?? ''); setEditing(true) }}
      title="Click per modificare"
      style={{
        cursor: 'pointer', padding: '3px 6px', borderRadius: '4px',
        color: value ? '#c9d1d9' : '#484f58', fontStyle: value ? 'normal' : 'italic',
        fontFamily: mono ? S.mono : 'inherit', border: '1px dashed transparent',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#30363d' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent' }}
    >{value || emptyLabel}</span>
  )
}
