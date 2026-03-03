import { useState, useEffect, useRef } from 'react'
import S from '../../styles.js'

export default function EditableSelect({ value, options, onChange, renderValue }) {
  const [editing, setEditing] = useState(false)
  const ref = useRef(null)

  useEffect(() => { if (editing && ref.current) ref.current.focus() }, [editing])

  if (editing) {
    return (
      <select
        ref={ref}
        value={value}
        onChange={e => { onChange(e.target.value); setEditing(false) }}
        onBlur={() => setEditing(false)}
        style={{
          ...S.inputBase,
          cursor: 'pointer',
          width: 'auto',
          minWidth: '100px',
        }}
      >
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }

  return (
    <span
      onClick={() => setEditing(true)}
      title="Click to change"
      style={{
        cursor: 'pointer',
        display: 'inline-block',
        padding: '2px 4px',
        borderRadius: '4px',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = '#1c2333'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {renderValue ? renderValue(value) : value}
    </span>
  )
}
