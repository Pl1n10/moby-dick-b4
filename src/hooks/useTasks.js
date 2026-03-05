import { useState, useEffect, useRef } from 'react'
import { OWNERS } from '../data.js'

const API = '/api'

export default function useTasks() {
  const [tasks, setTasks] = useState([])
  const lastUpdateRef = useRef(0)

  // ── Fetch tasks on mount + poll every 60s ──────────────
  useEffect(() => {
    const fetchTasks = () => {
      // Skip poll if a local update happened in the last 5 seconds
      if (Date.now() - lastUpdateRef.current < 5000) return
      fetch(`${API}/tasks`)
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

    // Optimistic update (same sync logic as before)
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

    // Persist to server
    fetch(`${API}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field, value }),
    }).catch(err => console.error('Failed to update task:', err))
  }

  // ── Add new task ───────────────────────────────────────
  const handleAdd = (activeGroup, clearFilters) => {
    clearFilters()
    lastUpdateRef.current = Date.now()

    const newTask = {
      id: crypto.randomUUID(),
      group: activeGroup,
      reference: '',
      description: '',
      status: 'New',
      owner: OWNERS[0],
      waiting: false,
      deadline: null,
      updatedAt: new Date().toISOString(),
    }

    // Optimistic insert
    setTasks(prev => [newTask, ...prev])

    // Persist to server
    fetch(`${API}/tasks`, {
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

      fetch(`${API}/tasks/${taskId}`, { method: 'DELETE' })
        .catch(err => console.error('Failed to delete task:', err))
    }
  }

  // ── Reset all data ─────────────────────────────────────
  const handleReset = (clearRecurring, clearFilters) => {
    if (window.confirm('Reset all data to defaults? This cannot be undone.')) {
      lastUpdateRef.current = Date.now()

      fetch(`${API}/tasks/reset`, { method: 'POST' })
        .then(r => r.json())
        .then(data => { if (Array.isArray(data)) setTasks(data) })
        .catch(err => console.error('Failed to reset:', err))

      clearRecurring()
      clearFilters()
    }
  }

  return { tasks, setTasks, updateTask, handleAdd, handleDelete, handleReset }
}
