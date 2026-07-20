import { useState, useEffect, useRef, useCallback } from 'react'
import apiFetch from '../auth/apiFetch.js'
import { DEFAULT_PRIORITY } from '../data.js'
import { apiErrorReason, shortQuote } from '../utils.js'
import { pushUndo, registerTasksAccessor, getCurrentTasks, emitSubtasksRefresh } from '../undo/undoStore.js'

const API = '/api'

// Human labels for the undo tooltip ("Annulla: cambio status su "INC123"").
const FIELD_LABELS = {
  reference: 'modifica reference',
  description: 'modifica descrizione',
  status: 'cambio status',
  owner: 'cambio owner',
  priority: 'cambio priorità',
  deadline: 'modifica scadenza',
  reperibile: 'flag info reperibile',
  group: 'cambio gruppo',
}

const taskLabel = (t) => shortQuote(t?.reference) ?? 'task senza reference'

// Fields whose change must NOT bump updatedAt — mirrors NO_TOUCH_FIELDS in
// backend/src/routes/tasks.js. Sorting is by updatedAt desc, so bumping it
// here would make the row jump to the top and then snap back on the next
// refetch (the server didn't bump it). Keep the two lists in sync.
const NO_TOUCH_FIELDS = new Set(['reperibile'])

// Loose equality for conflict checks: the server normalizes deadline '' → null,
// so null and '' must count as the same value.
const sameValue = (a, b) => (a ?? '') === (b ?? '')

// Normalizes a fetch promise so HTTP errors reject like network errors do:
// the undo prelude and the discard-on-failure hook treat them the same.
const rejectOnHttpError = (r) => {
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r
}

export default function useTasks() {
  const [tasks, setTasks] = useState([])
  const lastUpdateRef = useRef(0)
  const tasksRef = useRef(tasks)
  tasksRef.current = tasks

  // Undo entries conflict-check against the freshest client state.
  useEffect(() => {
    registerTasksAccessor(() => tasksRef.current)
  }, [])

  // ── Fetch tasks on mount + poll every 60s ──────────────
  // `force` bypasses the 5s local-update debounce (used after an undo,
  // which mutates server state at API level and needs an authoritative sync).
  const refetchTasks = useCallback((force = false) => {
    if (!force && Date.now() - lastUpdateRef.current < 5000) return
    apiFetch(`${API}/tasks`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setTasks(data) })
      .catch(err => console.error('Failed to fetch tasks:', err))
  }, [])

  useEffect(() => {
    refetchTasks()
    const interval = setInterval(refetchTasks, 60_000)

    // Also refetch when tab regains focus (picks up recurring tasks)
    const onFocus = () => refetchTasks()
    window.addEventListener('focus', onFocus)

    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [refetchTasks])

  // ── Update a single field (optimistic + API sync) ──────
  // Undo entries are pushed synchronously at action time so a fast Ctrl+Z
  // targets THIS action; each entry's run() awaits the original request
  // first, so the inverse can never overtake it on the wire.
  const updateTask = (taskId, field, value) => {
    const before = tasksRef.current.find(t => t.id === taskId)

    lastUpdateRef.current = Date.now()
    const touchesUpdatedAt = !NO_TOUCH_FIELDS.has(field)
    setTasks(prev => prev.map(t => (
      t.id === taskId
        ? {
            ...t,
            [field]: value,
            ...(touchesUpdatedAt ? { updatedAt: new Date().toISOString() } : {}),
          }
        : t
    )))

    const request = apiFetch(`${API}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field, value }),
    }).then(rejectOnHttpError)

    let discard = null
    if (before && !sameValue(before[field], value)) {
      const prevValue = before[field]
      discard = pushUndo(`${FIELD_LABELS[field] || `modifica ${field}`} su ${taskLabel(before)}`, async () => {
        try {
          await request
        } catch {
          return { ok: false, reason: 'la modifica non era stata salvata' }
        }
        const current = getCurrentTasks().find(t => t.id === taskId)
        if (!current) return { ok: false, reason: 'il task non esiste più' }
        if (!sameValue(current[field], value)) {
          return { ok: false, reason: 'il campo è stato modificato nel frattempo' }
        }
        // skipNotify: restoring the previous owner is not a new assignment —
        // don't re-email them. Ignored by the backend for other fields.
        const r = await apiFetch(`${API}/tasks/${taskId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ field, value: prevValue, skipNotify: true }),
        })
        if (!r.ok) return { ok: false, reason: await apiErrorReason(r) }
        return { ok: true }
      })
    }
    request.catch(err => {
      console.error('Failed to update task:', err)
      discard?.()
    })
  }

  // ── Add new task ───────────────────────────────────────
  // `defaultOwner` comes from /api/me (the logged-in user's display_owner)
  // with a fallback to the first available owner — caller picks both.
  const handleAdd = (activeGroup, clearFilters, defaultOwner) => {
    clearFilters()
    lastUpdateRef.current = Date.now()

    const newTask = {
      id: crypto.randomUUID(),
      group: activeGroup,
      reference: '',
      description: '',
      status: 'New',
      owner: defaultOwner || '',
      priority: DEFAULT_PRIORITY,
      reperibile: false,
      deadline: null,
      updatedAt: new Date().toISOString(),
    }

    // Optimistic insert
    setTasks(prev => [newTask, ...prev])

    // Persist to server
    const request = apiFetch(`${API}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTask),
    }).then(rejectOnHttpError)

    const discard = pushUndo('creazione nuovo task', async () => {
      try {
        await request
      } catch {
        return { ok: false, reason: 'la creazione non era andata a buon fine' }
      }
      const current = getCurrentTasks().find(t => t.id === newTask.id)
      if (!current) return { ok: false, reason: 'il task non esiste più' }
      const r = await apiFetch(`${API}/tasks/${newTask.id}`, { method: 'DELETE' })
      if (!r.ok) return { ok: false, reason: await apiErrorReason(r) }
      return { ok: true }
    })
    request.catch(err => {
      console.error('Failed to create task:', err)
      discard()
    })
  }

  // ── Delete task ────────────────────────────────────────
  const handleDelete = (taskId) => {
    const task = tasksRef.current.find(t => t.id === taskId)
    if (!task) return
    if (!window.confirm(`Delete "${task.reference || 'this task'}"?`)) return

    // The row disappears instantly (optimistic, as before the undo feature).
    lastUpdateRef.current = Date.now()
    setTasks(prev => prev.filter(t => t.id !== taskId))

    // In the background: snapshot the checklist BEFORE the DELETE cascades
    // over it (always — the client-side subtask counter can be stale, and a
    // missed snapshot means the undo silently loses the checklist), then
    // delete. The undo entry awaits this whole flow.
    const flow = (async () => {
      let checklist = []
      try {
        const r = await apiFetch(`${API}/tasks/${taskId}/subtasks`)
        const data = r.ok ? await r.json() : null
        if (Array.isArray(data)) checklist = data
      } catch (err) {
        // Restore would lose the checklist, but the task itself stays undoable.
        console.error('Failed to snapshot subtasks before delete:', err)
      }
      await apiFetch(`${API}/tasks/${taskId}`, { method: 'DELETE' }).then(rejectOnHttpError)
      return checklist
    })()

    const discard = pushUndo(`eliminazione di ${taskLabel(task)}`, async () => {
      let checklist
      try {
        checklist = await flow
      } catch {
        return { ok: false, reason: "l'eliminazione non era andata a buon fine" }
      }
      if (getCurrentTasks().some(t => t.id === taskId)) {
        return { ok: false, reason: 'il task esiste ancora' }
      }
      // Same UUID as the original: links and habits keep working. skipNotify
      // avoids re-sending the assignment email on restore.
      const payload = {
        id: task.id,
        group: task.group,
        reference: task.reference,
        description: task.description,
        status: task.status,
        owner: task.owner,
        priority: task.priority,
        reperibile: task.reperibile,
        deadline: task.deadline,
        recurringTemplateId: task.recurringTemplateId || null,
        skipNotify: true,
      }
      const post = (body) => apiFetch(`${API}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      let r = await post(payload)
      // The recurring template may have been deleted in the meantime (FK):
      // better a restored task without the 🔄 badge than a failed undo.
      if (!r.ok && payload.recurringTemplateId) {
        r = await post({ ...payload, recurringTemplateId: null })
      }
      if (!r.ok) return { ok: false, reason: await apiErrorReason(r) }

      // Re-create the checklist in original order (POST appends, so relative
      // order is preserved); done flags restored with a follow-up PATCH.
      for (const item of checklist) {
        try {
          const cr = await apiFetch(`${API}/tasks/${taskId}/subtasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description: item.description }),
          })
          const created = cr.ok ? await cr.json() : null
          if (created && item.done) {
            await apiFetch(`${API}/tasks/${taskId}/subtasks/${created.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ field: 'done', value: true }),
            })
          }
        } catch (err) {
          console.error('Failed to restore a subtask:', err)
        }
      }
      emitSubtasksRefresh(taskId)
      return { ok: true }
    })
    flow.catch(err => {
      console.error('Failed to delete task:', err)
      discard()
    })
  }

  // Bumps the parent task's subtask counters after a checklist mutation.
  // Avoids a full /api/tasks refetch on every add/toggle/delete.
  const updateSubtaskCounters = (taskId, { totalDelta = 0, openDelta = 0, subtasksText } = {}) => {
    setTasks(prev => prev.map(t => t.id === taskId
      ? {
          ...t,
          subtasksTotal: Math.max(0, (t.subtasksTotal ?? 0) + totalDelta),
          subtasksOpen:  Math.max(0, (t.subtasksOpen  ?? 0) + openDelta),
          ...(subtasksText != null ? { subtasksText } : {}),
        }
      : t
    ))
  }

  return { tasks, setTasks, updateTask, handleAdd, handleDelete, updateSubtaskCounters, refetchTasks }
}
