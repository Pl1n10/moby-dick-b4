import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import apiFetch from './apiFetch.js'

// Dynamic list of users assignable as task owners. Fetched from
// /api/users/owners and refreshed on tab focus (so when a new colleague
// logs in elsewhere, the picker updates as soon as you come back to the tab).
//
// In demo mode (AUTH_ENABLED=false on the backend) requireAuth is a no-op
// and the endpoint still returns the seed list — no special-case needed.

const OwnersContext = createContext({ owners: [], refresh: () => {} })

export function OwnersProvider({ children }) {
  const [owners, setOwners] = useState([])

  const refresh = useCallback(() => {
    apiFetch('/api/users/owners')
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (Array.isArray(data)) setOwners(data) })
      .catch(err => console.error('Failed to fetch owners:', err))
  }, [])

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
