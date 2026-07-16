import { useState, useEffect, useRef, useCallback } from 'react'
import apiFetch from '../auth/apiFetch.js'
import { apiErrorReason, shortQuote } from '../utils.js'
import { pushUndo, subscribeSubtasksRefresh, emitSubtasksRefresh } from '../undo/undoStore.js'

async function readJsonOrThrow(response) {
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.error || `HTTP ${response.status}`)
  }
  return data
}

const itemLabel = (text) => shortQuote(text) ?? 'item vuoto'

// Fetches the current server-side checklist of a task; undo entries use it to
// conflict-check before inverting (never trust the possibly-unmounted local
// state of a collapsed row).
async function fetchServerItems(taskId) {
  const r = await apiFetch(`/api/tasks/${taskId}/subtasks`)
  if (!r.ok) return { error: await apiErrorReason(r) }
  const data = await r.json().catch(() => null)
  return { items: Array.isArray(data) ? data : [] }
}

/**
 * CRUD hook for a single task's checklist.
 * Fetches on mount (when the row is expanded). Optimistic updates locally,
 * then persists via API. `onCountChange({ totalDelta, openDelta })` lets the
 * parent table keep its "N/M" badge in sync without refetching everything.
 * Every successful mutation records its inverse on the per-user undo stack.
 */
export default function useSubtasks(taskId, onCountChange) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const onCountChangeRef = useRef(onCountChange)

  useEffect(() => {
    onCountChangeRef.current = onCountChange
  }, [onCountChange])

  // Always resolves (errors are logged): mount effect and the undo-refresh
  // subscription share the same fetch path.
  const refetch = useCallback(() => {
    return apiFetch(`/api/tasks/${taskId}/subtasks`)
      .then(readJsonOrThrow)
      .then(data => { if (Array.isArray(data)) setItems(data) })
      .catch(err => console.error('Failed to fetch subtasks:', err))
  }, [taskId])

  useEffect(() => {
    setLoading(true)
    refetch().finally(() => setLoading(false))
  }, [refetch])

  // Resync when an undo touches this task's checklist (undo mutates at API
  // level, so the local optimistic state knows nothing about it).
  useEffect(() => subscribeSubtasksRefresh(id => {
    if (id === taskId) refetch()
  }), [taskId, refetch])

  useEffect(() => {
    if (!loading) {
      onCountChangeRef.current?.({ subtasksText: items.map(item => item.description).join(' ') })
    }
  }, [items, loading])

  // Undo entries are pushed SYNCHRONOUSLY at action time (not on server ack):
  // a fast Ctrl+Z right after the click must target this action, not the
  // previous one. Each entry's run() awaits the original request first — if
  // that request had failed (and the optimistic state rolled back), the undo
  // skips itself instead of inverting a mutation that never happened.

  const add = (description) => {
    const text = (description || '').trim()
    if (!text) return
    const request = apiFetch(`/api/tasks/${taskId}/subtasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: text }),
    }).then(readJsonOrThrow)

    const discard = pushUndo(`aggiunta item ${itemLabel(text)}`, async () => {
      let created
      try {
        created = await request
      } catch {
        return { ok: false, reason: "l'aggiunta non era andata a buon fine" }
      }
      const { items: server, error } = await fetchServerItems(taskId)
      if (error) return { ok: false, reason: error }
      const cur = server.find(s => s.id === created.id)
      if (!cur) return { ok: false, reason: "l'item non esiste più" }
      // Someone touched it after the add (edited or checked): leave it be.
      if (cur.description !== text || cur.done) {
        return { ok: false, reason: "l'item è stato modificato nel frattempo" }
      }
      const r = await apiFetch(`/api/tasks/${taskId}/subtasks/${created.id}`, { method: 'DELETE' })
      if (!r.ok) return { ok: false, reason: await apiErrorReason(r) }
      emitSubtasksRefresh(taskId)
      return { ok: true }
    })

    request
      .then(created => {
        setItems(prev => [...prev, created])
        onCountChange?.({ totalDelta: 1, openDelta: 1 })
      })
      .catch(err => {
        console.error('Failed to add subtask:', err)
        discard()
      })
  }

  const update = (id, field, value) => {
    const previous = items.find(s => s.id === id)
    if (!previous || previous[field] === value) return Promise.resolve()
    const prevValue = previous[field]

    setItems(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s))
    if (field === 'done') {
      // done true -> one less open. done false -> one more open.
      onCountChange?.({ totalDelta: 0, openDelta: value ? -1 : 1 })
    }
    const request = apiFetch(`/api/tasks/${taskId}/subtasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field, value }),
    }).then(readJsonOrThrow)

    const label = field === 'done'
      ? (value ? `spunta su ${itemLabel(previous.description)}` : `rimozione spunta da ${itemLabel(previous.description)}`)
      : `modifica item ${itemLabel(prevValue)}`
    const discard = pushUndo(label, async () => {
      try {
        await request
      } catch {
        return { ok: false, reason: 'la modifica non era andata a buon fine' }
      }
      const { items: server, error } = await fetchServerItems(taskId)
      if (error) return { ok: false, reason: error }
      const cur = server.find(s => s.id === id)
      if (!cur) return { ok: false, reason: "l'item non esiste più" }
      if (cur[field] !== value) return { ok: false, reason: "l'item è stato modificato nel frattempo" }
      const r = await apiFetch(`/api/tasks/${taskId}/subtasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field, value: prevValue }),
      })
      if (!r.ok) return { ok: false, reason: await apiErrorReason(r) }
      emitSubtasksRefresh(taskId)
      return { ok: true }
    })

    return request
      .then(saved => {
        setItems(prev => prev.map(s => s.id === id ? saved : s))
        return saved
      })
      .catch(err => {
        setItems(prev => prev.map(s => s.id === id ? previous : s))
        if (field === 'done') {
          onCountChange?.({ totalDelta: 0, openDelta: value ? 1 : -1 })
        }
        console.error('Failed to update subtask:', err)
        discard()
        throw err
      })
  }

  const remove = (id) => {
    const target = items.find(s => s.id === id)
    if (!target) return
    setItems(prev => prev.filter(s => s.id !== id))
    onCountChange?.({ totalDelta: -1, openDelta: target.done ? 0 : -1 })
    const request = apiFetch(`/api/tasks/${taskId}/subtasks/${id}`, { method: 'DELETE' })
      .then(readJsonOrThrow)

    const discard = pushUndo(`rimozione item ${itemLabel(target.description)}`, async () => {
      try {
        await request
      } catch {
        return { ok: false, reason: 'la rimozione non era andata a buon fine' }
      }
      // Re-create (new id, POST appends), then restore done flag and the
      // original position so the item slots back where it was.
      const r = await apiFetch(`/api/tasks/${taskId}/subtasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: target.description }),
      })
      if (!r.ok) return { ok: false, reason: await apiErrorReason(r) }
      const created = await r.json().catch(() => null)
      if (created) {
        const patch = (field, value) => apiFetch(`/api/tasks/${taskId}/subtasks/${created.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ field, value }),
        }).catch(() => {})
        if (target.done) await patch('done', true)
        if (Number.isInteger(target.position)) await patch('position', target.position)
      }
      emitSubtasksRefresh(taskId)
      return { ok: true }
    })

    request.catch(err => {
      setItems(prev => [...prev, target].sort((a, b) => a.position - b.position))
      onCountChange?.({ totalDelta: 1, openDelta: target.done ? 0 : 1 })
      console.error('Failed to delete subtask:', err)
      discard()
    })
  }

  return { items, loading, add, update, remove }
}
