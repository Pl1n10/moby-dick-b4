import { useSyncExternalStore } from 'react'

// Per-user undo stack. Lives in module memory: the history contains only the
// actions performed in THIS browser tab, so undoing never replays a
// colleague's work — and a page refresh starts from a clean slate
// (deliberate: no persistence, this is a safety net, not an audit trail).
//
// Each entry carries a human-readable label ("spunta su 'INC0012345'") and a
// `run` callback that performs the inverse mutation via the API. `run`
// resolves to:
//   { ok: true }                  → undone
//   { ok: false, reason: '...' }  → skipped (conflict, target gone, HTTP error)
// Conflict checks live inside each entry: an undo must never blindly
// overwrite a value someone else changed in the meantime.

const MAX_ENTRIES = 30

let entries = []
let busy = false

// ── UI subscription (useSyncExternalStore) ──────────────
const listeners = new Set()
let snapshot = { canUndo: false, nextLabel: null, busy: false }

function refreshSnapshot() {
  const last = entries[entries.length - 1]
  snapshot = { canUndo: entries.length > 0 && !busy, nextLabel: last ? last.label : null, busy }
  listeners.forEach(fn => fn())
}

export function useUndoState() {
  return useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
    () => snapshot,
  )
}

// ── Stack ───────────────────────────────────────────────

// Returns a discard callback: callers invoke it when the original request
// fails (and the optimistic state rolled back) — a dead entry must not sit on
// top of the stack eating a Ctrl+Z as a no-op skip.
export function pushUndo(label, run) {
  const entry = { label, run }
  entries.push(entry)
  if (entries.length > MAX_ENTRIES) entries.shift()
  refreshSnapshot()
  return () => {
    const i = entries.indexOf(entry)
    if (i !== -1) {
      entries.splice(i, 1)
      refreshSnapshot()
    }
  }
}

export async function undoLast() {
  if (busy || entries.length === 0) return null
  const entry = entries.pop()
  busy = true
  refreshSnapshot()
  try {
    const result = await entry.run()
    return { ...result, label: entry.label }
  } catch (err) {
    console.error('Undo failed:', err)
    return { ok: false, label: entry.label, reason: 'errore di rete o server' }
  } finally {
    busy = false
    refreshSnapshot()
  }
}

// ── Current tasks accessor ──────────────────────────────
// Registered by useTasks so undo entries can conflict-check task fields
// against the freshest client state (kept warm by polling + optimistic
// updates) without an extra GET per undo.

let tasksAccessor = () => []

export function registerTasksAccessor(fn) {
  tasksAccessor = fn
}

export function getCurrentTasks() {
  return tasksAccessor()
}

// ── Subtask refresh channel ─────────────────────────────
// Undoing a checklist mutation happens at API level; any mounted SubtaskList
// for that task (the row may well be expanded) must refetch to show it.

const subtaskListeners = new Set()

export function subscribeSubtasksRefresh(fn) {
  subtaskListeners.add(fn)
  return () => subtaskListeners.delete(fn)
}

export function emitSubtasksRefresh(taskId) {
  subtaskListeners.forEach(fn => fn(taskId))
}
