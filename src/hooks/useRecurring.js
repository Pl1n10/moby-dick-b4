import { useState, useEffect } from 'react'
import apiFetch from '../auth/apiFetch.js'

const API = '/api'

/**
 * Recurring templates hook — CRUD only.
 * Processing (task creation) now happens server-side via setInterval in Express.
 * The setTasks parameter is accepted for interface compatibility but not used.
 */
export default function useRecurring(/* setTasks — unused, kept for API compat */) {
  const [recurring, setRecurringState] = useState([])
  const [showRecurringModal, setShowRecurringModal] = useState(false)

  // ── Fetch templates on mount ───────────────────────────
  useEffect(() => {
    apiFetch(`${API}/recurring`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setRecurringState(data) })
      .catch(err => console.error('Failed to fetch recurring:', err))
  }, [])

  // ── Save all templates (called by RecurringModal onSave) ─
  const setRecurring = (templates) => {
    setRecurringState(templates)
    apiFetch(`${API}/recurring`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(templates),
    }).catch(err => console.error('Failed to save recurring:', err))
  }

  return { recurring, setRecurring, showRecurringModal, setShowRecurringModal }
}
