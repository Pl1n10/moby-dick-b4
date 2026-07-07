import { useState, useEffect, useRef } from 'react'
import apiFetch from '../auth/apiFetch.js'

async function readJsonOrThrow(response) {
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.error || `HTTP ${response.status}`)
  }
  return data
}

/**
 * CRUD hook for a single task's checklist.
 * Fetches on mount (when the row is expanded). Optimistic updates locally,
 * then persists via API. `onCountChange({ totalDelta, openDelta })` lets the
 * parent table keep its "N/M" badge in sync without refetching everything.
 */
export default function useSubtasks(taskId, onCountChange) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const onCountChangeRef = useRef(onCountChange)

  useEffect(() => {
    onCountChangeRef.current = onCountChange
  }, [onCountChange])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    apiFetch(`/api/tasks/${taskId}/subtasks`)
      .then(readJsonOrThrow)
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

  useEffect(() => {
    if (!loading) {
      onCountChangeRef.current?.({ subtasksText: items.map(item => item.description).join(' ') })
    }
  }, [items, loading])

  const add = (description) => {
    const text = (description || '').trim()
    if (!text) return
    apiFetch(`/api/tasks/${taskId}/subtasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: text }),
    })
      .then(readJsonOrThrow)
      .then(created => {
        setItems(prev => [...prev, created])
        onCountChange?.({ totalDelta: 1, openDelta: 1 })
      })
      .catch(err => console.error('Failed to add subtask:', err))
  }

  const update = (id, field, value) => {
    const previous = items.find(s => s.id === id)
    if (!previous || previous[field] === value) return Promise.resolve()

    setItems(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s))
    if (field === 'done') {
      // done true -> one less open. done false -> one more open.
      onCountChange?.({ totalDelta: 0, openDelta: value ? -1 : 1 })
    }
    return apiFetch(`/api/tasks/${taskId}/subtasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field, value }),
    })
      .then(readJsonOrThrow)
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
        throw err
      })
  }

  const remove = (id) => {
    const target = items.find(s => s.id === id)
    if (!target) return
    setItems(prev => prev.filter(s => s.id !== id))
    onCountChange?.({ totalDelta: -1, openDelta: target.done ? 0 : -1 })
    apiFetch(`/api/tasks/${taskId}/subtasks/${id}`, { method: 'DELETE' })
      .then(readJsonOrThrow)
      .catch(err => {
        setItems(prev => [...prev, target].sort((a, b) => a.position - b.position))
        onCountChange?.({ totalDelta: 1, openDelta: target.done ? 0 : 1 })
        console.error('Failed to delete subtask:', err)
      })
  }

  return { items, loading, add, update, remove }
}
