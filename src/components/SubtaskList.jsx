import { useEffect, useState } from 'react'
import S from '../styles.js'
import useSubtasks from '../hooks/useSubtasks.js'
import Linkify from './Linkify.jsx'

function EditableSubtaskDescription({ item, update }) {
  const [draft, setDraft] = useState(item.description)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft(item.description)
  }, [item.description])

  const reset = () => setDraft(item.description)
  const commit = () => {
    if (draft === item.description || saving) return
    setSaving(true)
    update(item.id, 'description', draft)
      .catch(reset)
      .finally(() => setSaving(false))
  }

  return (
    <input
      type="text"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          reset()
          e.currentTarget.blur()
        }
      }}
      placeholder="(testo vuoto)"
      disabled={saving}
      style={{
        flex: 1, background: 'transparent', border: 'none', outline: 'none',
        color: item.done ? '#484f58' : '#e6edf3', fontSize: '13px',
        fontFamily: S.sans, padding: '2px 4px',
        textDecoration: item.done ? 'line-through' : 'none',
        opacity: saving ? 0.7 : 1,
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
                <EditableSubtaskDescription item={item} update={update} />
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
