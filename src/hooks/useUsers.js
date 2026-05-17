import { useEffect, useState, useCallback } from 'react'
import apiFetch from '../auth/apiFetch.js'

/**
 * Admin-only users CRUD. Fetched lazily (on first open of the modal).
 * Optimistic updates for snappy UX; rollback to server truth on failure.
 */
export default function useUsers(active) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const refresh = useCallback(() => {
    setLoading(true)
    setError(null)
    apiFetch('/api/users')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(data => { if (Array.isArray(data)) setUsers(data) })
      .catch(err => {
        console.error('Failed to fetch users:', err)
        setError(err.message)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (active) refresh()
  }, [active, refresh])

  const update = (id, patch) => {
    const prev = users
    setUsers(curr => curr.map(u => u.id === id ? { ...u, ...patch } : u))
    return apiFetch(`/api/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
      .then(async r => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}))
          throw new Error(body.error || `HTTP ${r.status}`)
        }
        return r.json()
      })
      .then(updated => {
        setUsers(curr => curr.map(u => u.id === id ? updated : u))
      })
      .catch(err => {
        console.error('Failed to update user:', err)
        setUsers(prev)
        setError(err.message)
        throw err
      })
  }

  const remove = (id) => {
    const prev = users
    setUsers(curr => curr.filter(u => u.id !== id))
    return apiFetch(`/api/users/${id}`, { method: 'DELETE' })
      .then(async r => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}))
          throw new Error(body.error || `HTTP ${r.status}`)
        }
      })
      .catch(err => {
        console.error('Failed to delete user:', err)
        setUsers(prev)
        setError(err.message)
        throw err
      })
  }

  const create = ({ email, displayOwner, role }) => {
    return apiFetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, displayOwner, role }),
    })
      .then(async r => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}))
          throw new Error(body.error || `HTTP ${r.status}`)
        }
        return r.json()
      })
      .then(created => {
        setUsers(curr => {
          const idx = curr.findIndex(u => u.email === created.email)
          if (idx >= 0) {
            const copy = [...curr]
            copy[idx] = created
            return copy
          }
          return [created, ...curr]
        })
      })
      .catch(err => {
        console.error('Failed to create user:', err)
        setError(err.message)
        throw err
      })
  }

  return { users, loading, error, refresh, update, remove, create, clearError: () => setError(null) }
}
