import { useEffect, useRef, useState } from 'react'
import S from '../styles.js'
import useSubtasks from '../hooks/useSubtasks.js'
import Linkify from './Linkify.jsx'

// Click-to-edit, same pattern as EditableText: a display span (so search
// highlighting and clickable links work for writable rows too) that swaps to
// an <input> on click. Draft committed on blur/Enter, Escape cancels — the
// per-keystroke concurrent PATCH problem stays fixed.
function EditableSubtaskDescription({ item, update, search }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.description)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus()
  }, [editing])

  const commit = () => {
    setEditing(false)
    if (draft === item.description || saving) return
    setSaving(true)
    update(item.id, 'description', draft)
      .catch(() => {})
      .finally(() => setSaving(false))
  }

  if (!editing) {
    return (
      <span
        onClick={() => {
          if (saving) return
          setDraft(item.description)
          setEditing(true)
        }}
        title="Click to edit"
        style={{
          flex: 1, cursor: 'pointer', padding: '2px 4px', borderRadius: '4px',
          minHeight: '18px', fontSize: '13px', fontFamily: S.sans,
          color: item.done ? '#484f58' : '#e6edf3',
          textDecoration: item.done ? 'line-through' : 'none',
          opacity: saving ? 0.7 : 1,
          transition: 'background 0.1s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = '#1c2333'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        {item.description
          ? <Linkify text={item.description} query={search} />
          : <span style={{ color: '#484f58', fontStyle: 'italic' }}>(testo vuoto)</span>}
      </span>
    )
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setDraft(item.description)
          setEditing(false)
        }
      }}
      placeholder="(testo vuoto)"
      style={{
        flex: 1, background: 'transparent', border: 'none', outline: 'none',
        color: item.done ? '#484f58' : '#e6edf3', fontSize: '13px',
        fontFamily: S.sans, padding: '2px 4px',
        textDecoration: item.done ? 'line-through' : 'none',
      }}
    />
  )
}

export default function SubtaskList({ taskId, readOnly, search, onCountChange }) {
  const { items, loading, add, update, remove } = useSubtasks(taskId, onCountChange)
  const [draft, setDraft] = useState('')

  const submit = () => {
    if (!draft.trim()) return
    add(draft)
    setDraft('')
  }

  return (
    <div style={{
      padding: '12px 24px 16px 64px', background: '#0a0d12',
      borderTop: '1px dashed #21262d', fontFamily: S.sans,
    }}>
      {loading ? (
        <div style={{ color: '#484f58', fontSize: '12px' }}>Loading…</div>
      ) : items.length === 0 && readOnly ? (
        <div style={{ color: '#484f58', fontSize: '12px', fontStyle: 'italic' }}>
          Nessun item nella checklist.
        </div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {items.map(item => (
            <li key={item.id} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '4px 0', fontSize: '13px',
            }}>
              <input
                type="checkbox"
                checked={item.done}
                disabled={readOnly}
                onChange={e => update(item.id, 'done', e.target.checked).catch(() => {})}
                style={{ width: '16px', height: '16px', cursor: readOnly ? 'default' : 'pointer', accentColor: '#58a6ff' }}
              />
              {readOnly ? (
                <span style={{
                  flex: 1, color: item.done ? '#484f58' : '#c9d1d9',
                  textDecoration: item.done ? 'line-through' : 'none',
                }}>
                  <Linkify text={item.description} query={search} />
                </span>
              ) : (
                <EditableSubtaskDescription item={item} update={update} search={search} />
              )}
              {!readOnly && (
                <button
                  onClick={() => remove(item.id)}
                  title="Rimuovi item"
                  style={{
                    background: 'none', border: 'none', color: '#484f58',
                    cursor: 'pointer', fontSize: '13px', padding: '2px 6px', borderRadius: '4px',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#f85149' }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#484f58' }}
                >✕</button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && !loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
          <span style={{ color: '#484f58', fontSize: '14px', paddingLeft: '2px' }}>+</span>
          <input
            type="text"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit() }}
            placeholder="Aggiungi item…"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: '#e6edf3', fontSize: '13px', fontFamily: S.sans, padding: '4px',
              borderBottom: '1px dashed #30363d',
            }}
          />
          {draft.trim() && (
            <button onClick={submit} style={{
              padding: '4px 10px', background: '#238636', border: '1px solid #2ea043',
              borderRadius: '4px', color: '#fff', fontSize: '11px', fontFamily: S.mono,
              fontWeight: 600, cursor: 'pointer',
            }}>Add</button>
          )}
        </div>
      )}
    </div>
  )
}
