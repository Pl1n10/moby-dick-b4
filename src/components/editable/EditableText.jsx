import { useState, useEffect, useRef } from 'react'
import S from '../../styles.js'
import Highlight from '../Highlight.jsx'

export default function EditableText({ value, onChange, mono, placeholder, multiline, highlight }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef(null)

  useEffect(() => { if (editing && ref.current) ref.current.focus() }, [editing])
  useEffect(() => { setDraft(value) }, [value])

  const commit = () => {
    setEditing(false)
    if (draft !== value) onChange(draft)
  }

  if (editing) {
    const style = {
      ...S.inputBase,
      ...(mono ? { fontFamily: S.mono, fontSize: '12px' } : {}),
    }
    if (multiline) {
      return (
        <textarea
          ref={ref}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Escape') { setDraft(value); setEditing(false) } }}
          rows={3}
          style={{ ...style, resize: 'vertical', minHeight: '60px' }}
        />
      )
    }
    return (
      <input
        ref={ref}
        type="text"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') { setDraft(value); setEditing(false) }
        }}
        style={style}
      />
    )
  }

  const isEmpty = !value
  return (
    <span
      onClick={() => setEditing(true)}
      title="Click to edit"
      style={{
        cursor: 'pointer',
        display: 'block',
        padding: '2px 4px',
        borderRadius: '4px',
        transition: 'background 0.1s',
        minHeight: '20px',
        ...(mono ? { fontFamily: S.mono, fontSize: '12px', color: '#58a6ff' } : { color: '#c9d1d9' }),
        ...(isEmpty ? { color: '#484f58', fontStyle: 'italic' } : {}),
      }}
      onMouseEnter={e => e.currentTarget.style.background = '#1c2333'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {isEmpty ? (placeholder || 'click to edit') : (highlight ? <Highlight text={value} query={highlight} /> : value)}
    </span>
  )
}
