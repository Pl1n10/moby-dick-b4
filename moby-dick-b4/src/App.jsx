import { useState, useEffect, useRef } from 'react'
import { GROUPS, STATUSES, OWNERS, SEED_TASKS } from './data.js'

const STORAGE_KEY = 'moby-dick-b4-tasks'

function loadTasks() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch (e) { console.warn('localStorage load failed:', e) }
  return [...SEED_TASKS]
}

function saveTasks(tasks) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)) }
  catch (e) { console.warn('localStorage save failed:', e) }
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
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
function EditableText({ value, onChange, mono, placeholder, multiline }) {
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
      {isEmpty ? (placeholder || 'click to edit') : value}
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


// ============== MAIN APP ==============
export default function App() {
  const [activeGroup, setActiveGroup] = useState(GROUPS[0])
  const [tasks, setTasks] = useState(loadTasks)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterOwner, setFilterOwner] = useState('')

  useEffect(() => { saveTasks(tasks) }, [tasks])

  const filteredTasks = tasks
    .filter(t => t.group === activeGroup)
    .filter(t => {
      if (search) {
        const q = search.toLowerCase()
        if (!t.reference.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) return false
      }
      if (filterStatus && t.status !== filterStatus) return false
      if (filterOwner && t.owner !== filterOwner) return false
      return true
    })
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))

  const hasActiveFilters = search || filterStatus || filterOwner
  const clearFilters = () => { setSearch(''); setFilterStatus(''); setFilterOwner('') }

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
      <nav style={{ padding: '0 32px', borderBottom: '1px solid #21262d', display: 'flex' }}>
        {GROUPS.map(g => {
          const count = tasks.filter(t => t.group === g).length
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

          {/* Status filter */}
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

          {/* Spacer + Add */}
          <div style={{ flex: '1' }} />
          <button onClick={handleAdd} style={{
            padding: '7px 16px', background: '#238636', border: '1px solid #2ea043',
            borderRadius: '6px', color: '#fff', fontSize: '13px', fontFamily: S.sans,
            fontWeight: 600, cursor: 'pointer',
          }}>+ New Task</button>
        </div>

        {/* Table */}
        <div style={{ border: '1px solid #21262d', borderRadius: '8px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: S.sans, fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#161b22' }}>
                {['Reference', 'Description', 'Status', 'Owner', 'W', 'Updated', ''].map(h => (
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
                  <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#484f58' }}>
                    {hasActiveFilters
                      ? 'No tasks match your filters.'
                      : 'No tasks in this group yet. Click "+ New Task" to add one.'}
                  </td>
                </tr>
              ) : (
                filteredTasks.map(task => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onUpdate={(field, val) => updateTask(task.id, field, val)}
                    onDelete={() => handleDelete(task.id)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}


// --- Task row component ---
function TaskRow({ task, onUpdate, onDelete }) {
  return (
    <tr style={{ borderBottom: '1px solid #21262d', transition: 'background 0.1s' }}
      onMouseEnter={e => e.currentTarget.style.background = '#161b22'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <td style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>
        <EditableText
          value={task.reference}
          onChange={v => onUpdate('reference', v)}
          mono
          placeholder="add reference"
        />
      </td>
      <td style={{ padding: '8px 14px', maxWidth: '400px' }}>
        <EditableText
          value={task.description}
          onChange={v => onUpdate('description', v)}
          placeholder="add description"
          multiline
        />
      </td>
      <td style={{ padding: '8px 14px' }}>
        <EditableSelect
          value={task.status}
          options={STATUSES}
          onChange={v => onUpdate('status', v)}
          renderValue={v => <StatusBadge status={v} />}
        />
      </td>
      <td style={{ padding: '8px 14px' }}>
        <EditableSelect
          value={task.owner}
          options={OWNERS}
          onChange={v => onUpdate('owner', v)}
        />
      </td>
      <td style={{ padding: '8px 14px', textAlign: 'center' }}>
        <EditableCheckbox
          checked={task.waiting}
          onChange={v => onUpdate('waiting', v)}
        />
      </td>
      <td style={{
        padding: '8px 14px', fontFamily: S.mono, fontSize: '11px',
        color: '#8b949e', whiteSpace: 'nowrap',
      }}>
        {formatDate(task.updatedAt)}
      </td>
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
    </tr>
  )
}