import { useState, useEffect, useRef } from 'react'
import { GROUPS, STATUSES, OWNERS, SEED_TASKS, FREQUENCIES } from './data.js'

const STORAGE_KEY = 'moby-dick-b4-tasks'

function loadTasks() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed) && parsed.length > 0)
        return parsed.map(t => ({ deadline: null, ...t }))
    }
  } catch (e) { console.warn('localStorage load failed:', e) }
  return [...SEED_TASKS]
}

function saveTasks(tasks) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)) }
  catch (e) { console.warn('localStorage save failed:', e) }
}

const RECURRING_KEY = 'moby-dick-b4-recurring'

function loadRecurring() {
  try {
    const stored = localStorage.getItem(RECURRING_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) return parsed
    }
  } catch (e) { console.warn('Recurring load failed:', e) }
  return []
}

function saveRecurring(templates) {
  try { localStorage.setItem(RECURRING_KEY, JSON.stringify(templates)) }
  catch (e) { console.warn('Recurring save failed:', e) }
}

function shouldSkipRecurring(tmpl) {
  if (!tmpl.lastCreatedDate) return false
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  switch (tmpl.frequency) {
    case 'daily':
      return tmpl.lastCreatedDate === todayStr
    case 'weekly': {
      const last = new Date(tmpl.lastCreatedDate + 'T00:00:00')
      return Math.floor((now - last) / (1000 * 60 * 60 * 24)) < 7
    }
    case 'monthly': {
      const last = new Date(tmpl.lastCreatedDate + 'T00:00:00')
      return last.getFullYear() === now.getFullYear() && last.getMonth() === now.getMonth()
    }
    default: return false
  }
}

function processRecurring(templates) {
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  const newTasks = []
  const updatedTemplates = templates.map(tmpl => {
    if (!tmpl.active) return tmpl
    if (currentTime < tmpl.scheduledTime) return tmpl
    if (shouldSkipRecurring(tmpl)) return tmpl

    newTasks.push({
      id: crypto.randomUUID(),
      group: tmpl.group,
      reference: tmpl.reference,
      description: tmpl.description,
      status: 'New',
      owner: tmpl.owner,
      waiting: false,
      deadline: null,
      updatedAt: now.toISOString(),
      recurringTemplateId: tmpl.id,
    })
    return { ...tmpl, lastCreatedDate: todayStr }
  })

  return { newTasks, updatedTemplates }
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatDeadline(dateStr) {
  if (!dateStr) return null
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function isOverdue(deadlineStr) {
  if (!deadlineStr) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(deadlineStr + 'T00:00:00') < today
}

// --- Highlight search matches ---
function Highlight({ text, query }) {
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

const S = {
  mono: "'JetBrains Mono', monospace",
  sans: "'IBM Plex Sans', sans-serif",
  statusColors: {
    'New':         { bg: '#e8f4fd', color: '#1a6fa8' },
    'In Progress': { bg: '#fef3e2', color: '#b5740a' },
    'Waiting':     { bg: '#fce8e8', color: '#b52a2a' },
    'Resolved':    { bg: '#e6f5ea', color: '#1a7a36' },
    'Closed':      { bg: '#eaeaea', color: '#666' },
  },
  inputBase: {
    background: '#0d1117',
    border: '1px solid #58a6ff',
    borderRadius: '4px',
    color: '#e6edf3',
    fontSize: '13px',
    fontFamily: "'IBM Plex Sans', sans-serif",
    padding: '4px 8px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
}

// --- Editable text cell ---
function EditableText({ value, onChange, mono, placeholder, multiline, highlight }) {
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

// --- Editable select cell ---
function EditableSelect({ value, options, onChange, renderValue }) {
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

// --- Status badge ---
function StatusBadge({ status }) {
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

// --- Editable checkbox ---
function EditableCheckbox({ checked, onChange }) {
  return (
    <span
      onClick={() => onChange(!checked)}
      title={checked ? 'Clear waiting flag' : 'Set waiting flag'}
      style={{
        cursor: 'pointer', fontSize: '16px', userSelect: 'none',
        padding: '2px 6px', borderRadius: '4px', transition: 'background 0.1s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = '#1c2333'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {checked ? '⏳' : '—'}
    </span>
  )
}


// --- Editable date cell ---
function EditableDate({ value, onChange }) {
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


// --- Recurring templates modal ---
function RecurringModal({ templates, onSave, onClose }) {
  const [drafts, setDrafts] = useState(templates)

  const addTemplate = () => {
    setDrafts(prev => [...prev, {
      id: crypto.randomUUID(),
      group: GROUPS[0],
      reference: '',
      description: '',
      owner: OWNERS[0],
      frequency: 'daily',
      scheduledTime: '08:00',
      lastCreatedDate: null,
      active: true,
    }])
  }

  const updateDraft = (id, field, value) => {
    setDrafts(prev => prev.map(d => d.id === id ? { ...d, [field]: value } : d))
  }

  const removeDraft = (id) => {
    setDrafts(prev => prev.filter(d => d.id !== id))
  }

  const handleSave = () => { onSave(drafts); onClose() }

  const freqLabels = { daily: 'Giornaliero', weekly: 'Settimanale', monthly: 'Mensile' }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: '#161b22', border: '1px solid #30363d', borderRadius: '12px',
        padding: '24px', width: '90%', maxWidth: '800px', maxHeight: '80vh', overflowY: 'auto',
        color: '#e6edf3', fontFamily: S.sans,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontFamily: S.mono, fontSize: '16px' }}>Recurring Tasks</h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#8b949e', fontSize: '18px', cursor: 'pointer',
          }}>✕</button>
        </div>

        {drafts.length === 0 && (
          <p style={{ color: '#484f58', textAlign: 'center', padding: '20px' }}>
            No recurring templates. Click "+ Add Template" to create one.
          </p>
        )}

        {drafts.map(tmpl => (
          <div key={tmpl.id} style={{
            border: '1px solid #21262d', borderRadius: '8px', padding: '14px',
            marginBottom: '12px', background: '#0d1117',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <label style={{ fontSize: '12px', color: '#8b949e' }}>
                Group
                <select value={tmpl.group} onChange={e => updateDraft(tmpl.id, 'group', e.target.value)}
                  style={{ ...S.inputBase, display: 'block', marginTop: '4px' }}>
                  {GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </label>
              <label style={{ fontSize: '12px', color: '#8b949e' }}>
                Owner
                <select value={tmpl.owner} onChange={e => updateDraft(tmpl.id, 'owner', e.target.value)}
                  style={{ ...S.inputBase, display: 'block', marginTop: '4px' }}>
                  {OWNERS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>

              <label style={{ fontSize: '12px', color: '#8b949e', gridColumn: '1 / -1' }}>
                Reference
                <input value={tmpl.reference} onChange={e => updateDraft(tmpl.id, 'reference', e.target.value)}
                  placeholder="e.g. Daily Backup Check"
                  style={{ ...S.inputBase, display: 'block', marginTop: '4px' }} />
              </label>

              <label style={{ fontSize: '12px', color: '#8b949e', gridColumn: '1 / -1' }}>
                Description
                <textarea value={tmpl.description} onChange={e => updateDraft(tmpl.id, 'description', e.target.value)}
                  placeholder="Task description..."
                  rows={2}
                  style={{ ...S.inputBase, display: 'block', marginTop: '4px', resize: 'vertical' }} />
              </label>

              <label style={{ fontSize: '12px', color: '#8b949e' }}>
                Frequency
                <select value={tmpl.frequency} onChange={e => updateDraft(tmpl.id, 'frequency', e.target.value)}
                  style={{ ...S.inputBase, display: 'block', marginTop: '4px' }}>
                  {FREQUENCIES.map(f => <option key={f} value={f}>{freqLabels[f]}</option>)}
                </select>
              </label>
              <label style={{ fontSize: '12px', color: '#8b949e' }}>
                Scheduled Time
                <input type="time" value={tmpl.scheduledTime}
                  onChange={e => updateDraft(tmpl.id, 'scheduledTime', e.target.value)}
                  style={{ ...S.inputBase, display: 'block', marginTop: '4px', colorScheme: 'dark' }} />
              </label>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '12px', color: '#8b949e', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={tmpl.active}
                    onChange={e => updateDraft(tmpl.id, 'active', e.target.checked)} />
                  Active
                </label>
                {tmpl.lastCreatedDate && (
                  <span style={{ fontSize: '11px', fontFamily: S.mono, color: '#484f58' }}>
                    Last: {formatDeadline(tmpl.lastCreatedDate)}
                  </span>
                )}
                <div style={{ flex: 1 }} />
                <button onClick={() => removeDraft(tmpl.id)} style={{
                  background: 'none', border: '1px solid #30363d', borderRadius: '4px',
                  color: '#f85149', fontSize: '11px', fontFamily: S.mono, padding: '4px 10px', cursor: 'pointer',
                }}>Remove</button>
              </div>
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
          <button onClick={addTemplate} style={{
            padding: '7px 16px', background: 'none', border: '1px solid #30363d',
            borderRadius: '6px', color: '#e6edf3', fontSize: '13px', fontFamily: S.sans, cursor: 'pointer',
          }}>+ Add Template</button>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{
            padding: '7px 16px', background: 'none', border: '1px solid #30363d',
            borderRadius: '6px', color: '#8b949e', fontSize: '13px', fontFamily: S.sans, cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={handleSave} style={{
            padding: '7px 16px', background: '#238636', border: '1px solid #2ea043',
            borderRadius: '6px', color: '#fff', fontSize: '13px', fontFamily: S.sans, fontWeight: 600, cursor: 'pointer',
          }}>Save</button>
        </div>
      </div>
    </div>
  )
}


// ============== MAIN APP ==============
export default function App() {
  const [activeGroup, setActiveGroup] = useState(GROUPS[0])
  const [tasks, setTasks] = useState(loadTasks)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterOwner, setFilterOwner] = useState('')
  const [filterGroup, setFilterGroup] = useState('')
  const [recurring, setRecurring] = useState(loadRecurring)
  const [showRecurringModal, setShowRecurringModal] = useState(false)

  const isStorico = activeGroup === '__storico__'

  useEffect(() => { saveTasks(tasks) }, [tasks])
  useEffect(() => { saveRecurring(recurring) }, [recurring])

  // Process recurring tasks on mount and every 60 seconds
  useEffect(() => {
    const check = () => {
      const freshTemplates = loadRecurring()
      const { newTasks, updatedTemplates } = processRecurring(freshTemplates)
      if (newTasks.length > 0) {
        setTasks(prev => [...newTasks, ...prev])
        setRecurring(updatedTemplates)
      }
    }
    check()
    const interval = setInterval(check, 60000)
    return () => clearInterval(interval)
  }, [])

  const filteredTasks = tasks
    .filter(t => {
      if (isStorico) {
        if (t.status !== 'Closed') return false
        if (filterGroup && t.group !== filterGroup) return false
      } else {
        if (t.group !== activeGroup) return false
        if (t.status === 'Closed') return false
      }
      return true
    })
    .filter(t => {
      if (search) {
        const q = search.toLowerCase()
        if (!t.reference.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) return false
      }
      if (!isStorico && filterStatus && t.status !== filterStatus) return false
      if (filterOwner && t.owner !== filterOwner) return false
      return true
    })
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))

  const totalGroupTasks = isStorico
    ? tasks.filter(t => t.status === 'Closed').length
    : tasks.filter(t => t.group === activeGroup && t.status !== 'Closed').length
  const hasActiveFilters = search || filterStatus || filterOwner || (isStorico && filterGroup)
  const clearFilters = () => { setSearch(''); setFilterStatus(''); setFilterOwner(''); setFilterGroup('') }

  // Update a task field.
  // When field is 'waiting', we NEVER update updatedAt so the row doesn't jump position.
  // All other edits update the timestamp normally.
  const updateTask = (taskId, field, value) => {
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t
      const updated = { ...t, [field]: value }

      // Waiting <-> Status sync
      if (field === 'status' && value === 'Waiting') updated.waiting = true
      if (field === 'status' && value !== 'Waiting') updated.waiting = false
      if (field === 'waiting' && !value && t.status === 'Waiting') updated.status = 'In Progress'
      if (field === 'waiting' && value) updated.status = 'Waiting'

      // Only update timestamp for non-waiting fields
      if (field !== 'waiting') {
        updated.updatedAt = new Date().toISOString()
      }

      return updated
    }))
  }

  const handleReset = () => {
    if (window.confirm('Reset all data to defaults? This cannot be undone.')) {
      setTasks([...SEED_TASKS])
      setRecurring([])
      clearFilters()
    }
  }

  const handleAdd = () => {
    if (hasActiveFilters) clearFilters()
    setTasks(prev => [{
      id: crypto.randomUUID(),
      group: activeGroup,
      reference: '',
      description: '',
      status: 'New',
      owner: OWNERS[0],
      waiting: false,
      deadline: null,
      updatedAt: new Date().toISOString(),
    }, ...prev])
  }

  const handleDelete = (taskId) => {
    const task = tasks.find(t => t.id === taskId)
    if (window.confirm(`Delete "${task?.reference || 'this task'}"?`)) {
      setTasks(prev => prev.filter(t => t.id !== taskId))
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', color: '#e6edf3' }}>

      {/* Header */}
      <header style={{
        padding: '16px 32px', borderBottom: '1px solid #21262d',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <h1 style={{ margin: 0, fontSize: '20px', fontFamily: S.mono, fontWeight: 700, letterSpacing: '-0.02em' }}>
            🐋 Moby Dick B4
          </h1>
          <span style={{
            padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
            fontFamily: S.mono, background: '#1f2937', color: '#f59e0b', border: '1px solid #374151',
          }}>
            Auth: OFF (Demo)
          </span>
        </div>
        <span style={{ fontSize: '12px', color: '#8b949e', fontFamily: S.sans, display: 'flex', alignItems: 'center', gap: '12px' }}>
          Backup Task Tracker
          <button onClick={handleReset} title="Reset data" style={{
            padding: '4px 10px', background: 'none', border: '1px solid #30363d',
            borderRadius: '4px', color: '#8b949e', fontSize: '11px', fontFamily: S.mono, cursor: 'pointer',
          }}>↺ Reset</button>
        </span>
      </header>

      {/* Tabs */}
      <nav style={{ padding: '0 32px', borderBottom: '1px solid #21262d', display: 'flex', alignItems: 'center' }}>
        {GROUPS.map(g => {
          const count = tasks.filter(t => t.group === g && t.status !== 'Closed').length
          const isActive = g === activeGroup
          return (
            <button key={g} onClick={() => setActiveGroup(g)} style={{
              padding: '12px 20px', background: 'none', border: 'none',
              borderBottom: isActive ? '2px solid #58a6ff' : '2px solid transparent',
              color: isActive ? '#58a6ff' : '#8b949e',
              fontFamily: S.sans, fontSize: '14px', fontWeight: isActive ? 600 : 400,
              cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '8px',
            }}>
              {g}
              {count > 0 && <span style={{
                fontSize: '11px', fontFamily: S.mono, padding: '1px 6px', borderRadius: '10px',
                background: isActive ? '#1c3a5e' : '#21262d', color: isActive ? '#58a6ff' : '#8b949e',
              }}>{count}</span>}
            </button>
          )
        })}

        {/* Separator */}
        <div style={{ width: '1px', height: '20px', background: '#30363d', margin: '0 8px' }} />

        {/* Storico tab */}
        {(() => {
          const closedCount = tasks.filter(t => t.status === 'Closed').length
          return (
            <button onClick={() => setActiveGroup('__storico__')} style={{
              padding: '12px 20px', background: 'none', border: 'none',
              borderBottom: isStorico ? '2px solid #8b949e' : '2px solid transparent',
              color: isStorico ? '#e6edf3' : '#484f58',
              fontFamily: S.sans, fontSize: '14px', fontWeight: isStorico ? 600 : 400,
              cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '8px',
              fontStyle: 'italic',
            }}>
              Storico
              {closedCount > 0 && <span style={{
                fontSize: '11px', fontFamily: S.mono, padding: '1px 6px', borderRadius: '10px',
                background: isStorico ? '#21262d' : '#161b22', color: '#8b949e',
              }}>{closedCount}</span>}
            </button>
          )
        })()}
      </nav>

      {/* Toolbar: Search + Filters + Add */}
      <main style={{ padding: '24px 32px' }}>
        <div style={{
          marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
        }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: '320px' }}>
            <span style={{
              position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)',
              color: '#484f58', fontSize: '14px', pointerEvents: 'none',
            }}>🔍</span>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search reference or description…"
              style={{
                width: '100%', padding: '7px 12px 7px 32px',
                background: '#0d1117', border: '1px solid #30363d', borderRadius: '6px',
                color: '#e6edf3', fontSize: '13px', fontFamily: S.sans, outline: 'none',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => e.target.style.borderColor = '#58a6ff'}
              onBlur={e => e.target.style.borderColor = '#30363d'}
            />
          </div>

          {/* Group filter (Storico only) */}
          {isStorico && (
            <select
              value={filterGroup}
              onChange={e => setFilterGroup(e.target.value)}
              style={{
                padding: '7px 10px', background: '#0d1117', border: '1px solid #30363d',
                borderRadius: '6px', color: filterGroup ? '#e6edf3' : '#8b949e',
                fontSize: '13px', fontFamily: S.sans, cursor: 'pointer', outline: 'none',
              }}
            >
              <option value="">All groups</option>
              {GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          )}

          {/* Status filter (hidden in Storico) */}
          {!isStorico && (
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              style={{
                padding: '7px 10px', background: '#0d1117', border: '1px solid #30363d',
                borderRadius: '6px', color: filterStatus ? '#e6edf3' : '#8b949e',
                fontSize: '13px', fontFamily: S.sans, cursor: 'pointer', outline: 'none',
              }}
            >
              <option value="">All statuses</option>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}

          {/* Owner filter */}
          <select
            value={filterOwner}
            onChange={e => setFilterOwner(e.target.value)}
            style={{
              padding: '7px 10px', background: '#0d1117', border: '1px solid #30363d',
              borderRadius: '6px', color: filterOwner ? '#e6edf3' : '#8b949e',
              fontSize: '13px', fontFamily: S.sans, cursor: 'pointer', outline: 'none',
            }}
          >
            <option value="">All owners</option>
            {OWNERS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>

          {/* Clear filters */}
          {hasActiveFilters && (
            <button onClick={clearFilters} style={{
              padding: '7px 12px', background: 'none', border: '1px solid #30363d',
              borderRadius: '6px', color: '#8b949e', fontSize: '12px', fontFamily: S.mono,
              cursor: 'pointer', transition: 'all 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#f85149'; e.currentTarget.style.color = '#f85149' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#30363d'; e.currentTarget.style.color = '#8b949e' }}
            >✕ Clear</button>
          )}

          {/* Result counter */}
          {hasActiveFilters && (
            <span style={{
              fontSize: '12px', fontFamily: S.mono, color: '#8b949e',
            }}>
              {filteredTasks.length} of {totalGroupTasks}
            </span>
          )}

          {/* Recurring button */}
          {!isStorico && (
            <button onClick={() => setShowRecurringModal(true)} title="Manage recurring tasks" style={{
              padding: '7px 12px', background: 'none', border: '1px solid #30363d',
              borderRadius: '6px', color: '#8b949e', fontSize: '13px', fontFamily: S.sans,
              cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '6px',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#58a6ff'; e.currentTarget.style.color = '#58a6ff' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#30363d'; e.currentTarget.style.color = '#8b949e' }}
            >
              Recurring
              {recurring.filter(r => r.active).length > 0 && (
                <span style={{
                  fontSize: '10px', fontFamily: S.mono, padding: '1px 5px', borderRadius: '10px',
                  background: '#1c3a5e', color: '#58a6ff',
                }}>{recurring.filter(r => r.active).length}</span>
              )}
            </button>
          )}

          {/* Spacer + Add */}
          <div style={{ flex: '1' }} />
          {!isStorico && (
            <button onClick={handleAdd} style={{
              padding: '7px 16px', background: '#238636', border: '1px solid #2ea043',
              borderRadius: '6px', color: '#fff', fontSize: '13px', fontFamily: S.sans,
              fontWeight: 600, cursor: 'pointer',
            }}>+ New Task</button>
          )}
        </div>

        {/* Table */}
        <div style={{ border: '1px solid #21262d', borderRadius: '8px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: S.sans, fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#161b22' }}>
                {(isStorico
                  ? ['Gruppo', 'Reference', 'Description', 'Status', 'Owner', 'W', 'Updated', 'Scadenza']
                  : ['Reference', 'Description', 'Status', 'Owner', 'W', 'Updated', 'Scadenza', '']
                ).map(h => (
                  <th key={h || '_act'} style={{
                    padding: '10px 14px', textAlign: 'left', fontWeight: 600,
                    fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em',
                    color: '#8b949e', borderBottom: '1px solid #21262d',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={isStorico ? 8 : 8} style={{ padding: '40px', textAlign: 'center', color: '#484f58' }}>
                    {hasActiveFilters
                      ? 'No tasks match your filters.'
                      : isStorico
                        ? 'No closed tasks yet.'
                        : 'No tasks in this group yet. Click "+ New Task" to add one.'}
                  </td>
                </tr>
              ) : (
                filteredTasks.map(task => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    search={search}
                    onUpdate={(field, val) => updateTask(task.id, field, val)}
                    onDelete={() => handleDelete(task.id)}
                    readOnly={isStorico}
                    showGroup={isStorico}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      {showRecurringModal && (
        <RecurringModal
          templates={recurring}
          onSave={setRecurring}
          onClose={() => setShowRecurringModal(false)}
        />
      )}
    </div>
  )
}


// --- Task row component ---
function TaskRow({ task, search, onUpdate, onDelete, readOnly = false, showGroup = false }) {
  return (
    <tr style={{
      borderBottom: '1px solid #21262d', transition: 'background 0.1s',
    }}
      onMouseEnter={e => e.currentTarget.style.background = '#161b22'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {showGroup && (
        <td style={{ padding: '8px 14px', fontFamily: S.sans, fontSize: '12px', color: '#8b949e', whiteSpace: 'nowrap' }}>
          {task.group}
        </td>
      )}
      <td style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {task.recurringTemplateId && (
            <span title="Created from recurring template" style={{
              fontSize: '12px', color: '#8b949e', flexShrink: 0,
            }}>&#x1f504;</span>
          )}
          {readOnly ? (
            <span style={{ fontFamily: S.mono, fontSize: '12px', color: '#58a6ff', padding: '2px 4px' }}>
              {task.reference ? <Highlight text={task.reference} query={search} /> : '—'}
            </span>
          ) : (
            <EditableText
              value={task.reference}
              onChange={v => onUpdate('reference', v)}
              mono
              placeholder="add reference"
              highlight={search}
            />
          )}
        </div>
      </td>
      <td style={{ padding: '8px 14px', maxWidth: '400px' }}>
        {readOnly ? (
          <span style={{ color: '#c9d1d9', padding: '2px 4px', display: 'block' }}>
            {task.description ? <Highlight text={task.description} query={search} /> : '—'}
          </span>
        ) : (
          <EditableText
            value={task.description}
            onChange={v => onUpdate('description', v)}
            placeholder="add description"
            multiline
            highlight={search}
          />
        )}
      </td>
      <td style={{ padding: '8px 14px' }}>
        {readOnly ? (
          <StatusBadge status={task.status} />
        ) : (
          <EditableSelect
            value={task.status}
            options={STATUSES}
            onChange={v => onUpdate('status', v)}
            renderValue={v => <StatusBadge status={v} />}
          />
        )}
      </td>
      <td style={{ padding: '8px 14px' }}>
        {readOnly ? (
          <span style={{ padding: '2px 4px' }}>{task.owner}</span>
        ) : (
          <EditableSelect
            value={task.owner}
            options={OWNERS}
            onChange={v => onUpdate('owner', v)}
          />
        )}
      </td>
      <td style={{ padding: '8px 14px', textAlign: 'center' }}>
        {readOnly ? (
          <span style={{ fontSize: '16px' }}>{task.waiting ? '⏳' : '—'}</span>
        ) : (
          <EditableCheckbox
            checked={task.waiting}
            onChange={v => onUpdate('waiting', v)}
          />
        )}
      </td>
      <td style={{
        padding: '8px 14px', fontFamily: S.mono, fontSize: '11px',
        color: '#8b949e', whiteSpace: 'nowrap',
      }}>
        {formatDate(task.updatedAt)}
      </td>
      <td style={{
        padding: '8px 14px', whiteSpace: 'nowrap',
        ...(isOverdue(task.deadline) && task.status !== 'Closed' && task.status !== 'Resolved'
          ? { background: '#f8514915' } : {}),
      }}>
        {readOnly ? (
          <span style={{
            fontFamily: S.mono, fontSize: '11px', padding: '2px 4px',
            color: isOverdue(task.deadline) ? '#f85149' : '#8b949e',
            fontWeight: isOverdue(task.deadline) ? 600 : 400,
          }}>
            {task.deadline ? formatDeadline(task.deadline) : '—'}
          </span>
        ) : (
          <EditableDate
            value={task.deadline}
            onChange={v => onUpdate('deadline', v)}
          />
        )}
      </td>
      {!readOnly && (
        <td style={{ padding: '8px 8px', textAlign: 'center' }}>
          <button onClick={onDelete} title="Delete task" style={{
            background: 'none', border: 'none', color: '#484f58',
            cursor: 'pointer', fontSize: '14px', padding: '4px 6px',
            borderRadius: '4px', transition: 'all 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.color = '#f85149'; e.currentTarget.style.background = '#f8514922' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#484f58'; e.currentTarget.style.background = 'none' }}
          >✕</button>
        </td>
      )}
    </tr>
  )
}