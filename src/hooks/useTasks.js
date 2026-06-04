import { useState, useEffect, useRef } from 'react'
import apiFetch from '../auth/apiFetch.js'
import { DEFAULT_PRIORITY } from '../data.js'

const API = '/api'

export default function useTasks() {
  const [tasks, setTasks] = useState([])
  const lastUpdateRef = useRef(0)

  // ── Fetch tasks on mount + poll every 60s ──────────────
  useEffect(() => {
    const fetchTasks = () => {
      // Skip poll if a local update happened in the last 5 seconds
      if (Date.now() - lastUpdateRef.current < 5000) return
      apiFetch(`${API}/tasks`)
        .then(r => r.json())
        .then(data => { if (Array.isArray(data)) setTasks(data) })
        .catch(err => console.error('Failed to fetch tasks:', err))
    }

    fetchTasks()
    const interval = setInterval(fetchTasks, 60_000)

    // Also refetch when tab regains focus (picks up recurring tasks)
    const onFocus = () => {
      if (Date.now() - lastUpdateRef.current > 5000) fetchTasks()
    }
    window.addEventListener('focus', onFocus)

    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  // ── Update a single field (optimistic + API sync) ──────
  const updateTask = (taskId, field, value) => {
    lastUpdateRef.current = Date.now()

    setTasks(prev => prev.map(t => (
      t.id === taskId
        ? { ...t, [field]: value, updatedAt: new Date().toISOString() }
        : t
    )))

    apiFetch(`${API}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field, value }),
    }).catch(err => console.error('Failed to update task:', err))
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
      deadline: null,
      updatedAt: new Date().toISOString(),
    }

    // Optimistic insert
    setTasks(prev => [newTask, ...prev])

    // Persist to server
    apiFetch(`${API}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTask),
    }).catch(err => console.error('Failed to create task:', err))
  }

  // ── Delete task ────────────────────────────────────────
  const handleDelete = (taskId) => {
    const task = tasks.find(t => t.id === taskId)
    if (window.confirm(`Delete "${task?.reference || 'this task'}"?`)) {
      lastUpdateRef.current = Date.now()
      setTasks(prev => prev.filter(t => t.id !== taskId))

      apiFetch(`${API}/tasks/${taskId}`, { method: 'DELETE' })
        .catch(err => console.error('Failed to delete task:', err))
    }
  }

  // Bumps the parent task's subtask counters after a checklist mutation.
  // Avoids a full /api/tasks refetch on every add/toggle/delete.
  const updateSubtaskCounters = (taskId, { totalDelta = 0, openDelta = 0 }) => {
    setTasks(prev => prev.map(t => t.id === taskId
      ? {
          ...t,
          subtasksTotal: Math.max(0, (t.subtasksTotal ?? 0) + totalDelta),
          subtasksOpen:  Math.max(0, (t.subtasksOpen  ?? 0) + openDelta),
        }
      : t
    ))
  }

  return { tasks, setTasks, updateTask, handleAdd, handleDelete, updateSubtaskCounters }
}
