import { useState, useEffect } from 'react'
import { OWNERS, SEED_TASKS } from '../data.js'

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

export default function useTasks() {
  const [tasks, setTasks] = useState(loadTasks)

  useEffect(() => { saveTasks(tasks) }, [tasks])

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

  const handleAdd = (activeGroup, clearFilters) => {
    clearFilters()
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

  const handleReset = (clearRecurring, clearFilters) => {
    if (window.confirm('Reset all data to defaults? This cannot be undone.')) {
      setTasks([...SEED_TASKS])
      clearRecurring()
      clearFilters()
    }
  }

  return { tasks, setTasks, updateTask, handleAdd, handleDelete, handleReset }
}
