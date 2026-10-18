// Task number → "MD001" (board prefix + number padded to 3 digits; MD1000
// follows MD999). Same format as formatTaskCode in backend/src/notify.js.
// null while a new task is still waiting for the server to assign its number.
export function formatTaskCode(n, prefix = '#') {
  return n == null ? null : `${prefix}${String(n).padStart(3, '0')}`
}

// ── Manual order (drag & drop, migration 015) ──────────
// `position` ascending = top of the section, ties broken like the server does
// (updated_at desc, then id). Positions only mean something within a section.
export function compareByPosition(a, b) {
  return (a.position ?? 0) - (b.position ?? 0)
    || new Date(b.updatedAt) - new Date(a.updatedAt)
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

// Ids of a section's tasks, top first — closed ones included, as on the server.
export function sectionOrder(tasks, group) {
  return tasks.filter(t => t.group === group).sort(compareByPosition).map(t => t.id)
}

// Position for a task entering a section on top (new task, section change).
export function topPosition(tasks, group) {
  const ps = tasks.filter(t => t.group === group).map(t => t.position ?? 0)
  return (ps.length ? Math.min(...ps) : 0) - 1
}

// Client mirror of POST /tasks/:id/move: puts the task right above beforeId
// (null = bottom) and renumbers its section 0..n-1. Returns a new array.
export function moveInSection(tasks, taskId, beforeId) {
  const task = tasks.find(t => t.id === taskId)
  if (!task) return tasks
  const order = sectionOrder(tasks, task.group).filter(id => id !== taskId)
  const at = beforeId == null ? order.length : order.indexOf(beforeId)
  if (at < 0) return tasks
  order.splice(at, 0, taskId)
  const pos = new Map(order.map((id, i) => [id, i]))
  return tasks.map(t => (pos.has(t.id) ? { ...t, position: pos.get(t.id) } : t))
}

export function formatDate(iso) {
  return new Date(iso).toLocaleDateString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function formatDeadline(dateStr) {
  if (!dateStr) return null
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

export function isOverdue(deadlineStr) {
  if (!deadlineStr) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(deadlineStr + 'T00:00:00') < today
}

// Extracts a human-readable error from a failed API response ("Cannot close
// task: …" or "HTTP 500"). Never throws.
export async function apiErrorReason(response) {
  const data = await response.json().catch(() => null)
  return data?.error || `HTTP ${response.status}`
}

// Quoted, ellipsis-truncated snippet for undo labels/toasts. Null when empty
// so callers can supply their own fallback wording.
export function shortQuote(text, max = 30) {
  const t = (text || '').trim()
  if (!t) return null
  return `"${t.length > max ? t.slice(0, max) + '…' : t}"`
}
