import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import apiFetch from './apiFetch.js'
import { useBoard } from '../board/BoardProvider.jsx'

// Users assignable as task owners ON THE CURRENT BOARD: its members only
// (decision 2026-10-07). Fetched from /api/t/<slug>/members/owners and
// refreshed on tab focus (so when a colleague joins elsewhere, the picker
// updates as soon as you come back to the tab). Must sit below BoardProvider.
//
// In demo mode (AUTH_ENABLED=false on the backend) requireAuth is a no-op
// and the endpoint still returns the seed list — no special-case needed.

const OwnersContext = createContext({ owners: [], refresh: () => {} })

export function OwnersProvider({ children }) {
  const { apiBase } = useBoard()
  const [owners, setOwners] = useState([])

  const refresh = useCallback(() => {
    if (!apiBase) return
    apiFetch(`${apiBase}/members/owners`)
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (Array.isArray(data)) setOwners(data) })
      .catch(err => console.error('Failed to fetch owners:', err))
  }, [apiBase])

  useEffect(() => {
    refresh()
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  return <OwnersContext.Provider value={{ owners, refresh }}>{children}</OwnersContext.Provider>
}

export function useOwners() {
  return useContext(OwnersContext).owners
}

export function useRefreshOwners() {
  return useContext(OwnersContext).refresh
}
