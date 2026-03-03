import { useState, useEffect, useRef } from 'react'
import S from '../../styles.js'
import { formatDeadline, isOverdue } from '../../utils.js'

export default function EditableDate({ value, onChange }) {
  const [editing, setEditing] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus()
      ref.current.showPicker?.()
    }
  }, [editing])

  if (editing) {
    return (
      <input
        ref={ref}
        type="date"
        value={value || ''}
        onChange={e => { onChange(e.target.value || null); setEditing(false) }}
        onBlur={() => setEditing(false)}
        style={{
          ...S.inputBase,
          width: 'auto',
          minWidth: '130px',
          cursor: 'pointer',
          colorScheme: 'dark',
        }}
      />
    )
  }

  const overdue = isOverdue(value)
  const display = value ? formatDeadline(value) : null

  return (
    <span
      onClick={() => setEditing(true)}
      title={value ? 'Click to change deadline' : 'Click to set deadline'}
      style={{
        cursor: 'pointer',
        display: 'inline-block',
        padding: '2px 4px',
        borderRadius: '4px',
        transition: 'background 0.1s',
        fontFamily: S.mono,
        fontSize: '11px',
        color: overdue ? '#f85149' : (value ? '#8b949e' : '#484f58'),
        fontWeight: overdue ? 600 : 400,
        fontStyle: value ? 'normal' : 'italic',
      }}
      onMouseEnter={e => e.currentTarget.style.background = '#1c2333'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {display || '—'}
    </span>
  )
}
