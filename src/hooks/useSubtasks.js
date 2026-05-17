import { useState, useEffect } from 'react'
import apiFetch from '../auth/apiFetch.js'

/**
 * CRUD hook for a single task's checklist.
 * Fetches on mount (when the row is expanded). Optimistic updates locally,
 * then persists via API. `onCountChange({ totalDelta, openDelta })` lets the
 * parent table keep its "N/M" badge in sync without refetching everything.
 */
export default function useSubtasks(taskId, onCountChange) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    apiFetch(`/api/tasks/${taskId}/subtasks`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        if (Array.isArray(data)) setItems(data)
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to fetch subtasks:', err)
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [taskId])

  const add = (description) => {
    const text = (description || '').trim()
    if (!text) return
    apiFetch(`/api/tasks/${taskId}/subtasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: text }),
    })
      .then(r => r.json())
      .then(created => {
        setItems(prev => [...prev, created])
        onCountChange?.({ totalDelta: 1, openDelta: 1 })
      })
      .catch(err => console.error('Failed to add subtask:', err))
  }

  const update = (id, field, value) => {
    setItems(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s))
    if (field === 'done') {
      // done true → one less open. done false → one more open.
      onCountChange?.({ totalDelta: 0, openDelta: value ? -1 : 1 })
    }
    apiFetch(`/api/tasks/${taskId}/subtasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field, value }),
    }).catch(err => console.error('Failed to update subtask:', err))
  }

  const remove = (id) => {
    const target = items.find(s => s.id === id)
    if (!target) return
    setItems(prev => prev.filter(s => s.id !== id))
    onCountChange?.({ totalDelta: -1, openDelta: target.done ? 0 : -1 })
    apiFetch(`/api/tasks/${taskId}/subtasks/${id}`, { method: 'DELETE' })
      .catch(err => console.error('Failed to delete subtask:', err))
  }

  return { items, loading, add, update, remove }
}
