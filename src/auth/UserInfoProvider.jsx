import { createContext, useContext, useEffect, useState } from 'react'
import { useIsAuthenticated } from '@azure/msal-react'
import { AUTH_ENABLED } from './authConfig.js'
import apiFetch from './apiFetch.js'

// Demo stub keeps local dev permissive — everyone is admin when auth is off.
const DEMO_INFO = { authenticated: false, demo: true, role: 'admin', owner: null, operatorGroups: [], inUsersTable: false, loading: false }

// Default in auth mode: viewer with no scope until /api/me resolves. Components
// rendering during the brief loading window must not show admin-only UI
// prematurely.
const DEFAULT_INFO = { role: 'viewer', owner: null, operatorGroups: [], inUsersTable: false, loading: true }

const UserInfoContext = createContext(DEMO_INFO)

export function UserInfoProvider({ children }) {
  if (!AUTH_ENABLED) {
    return <UserInfoContext.Provider value={DEMO_INFO}>{children}</UserInfoContext.Provider>
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const isAuthenticated = useIsAuthenticated()
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [info, setInfo] = useState(DEFAULT_INFO)

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!isAuthenticated) return
    let cancelled = false
    apiFetch('/api/me')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(data => {
        if (cancelled) return
        setInfo({ ...DEFAULT_INFO, ...data, loading: false })
      })
      .catch(err => {
        console.error('Failed to fetch /api/me:', err)
        if (cancelled) return
        setInfo({ ...DEFAULT_INFO, loading: false, error: err.message })
      })
    return () => { cancelled = true }
  }, [isAuthenticated])

  return <UserInfoContext.Provider value={info}>{children}</UserInfoContext.Provider>
}

export function useUserInfo() {
  return useContext(UserInfoContext)
}

export function useIsAdmin() {
  return useContext(UserInfoContext).role === 'admin'
}

// Returns a predicate (group) => boolean. Admin everywhere, otherwise the
// pillar must be in operatorGroups. Mirrors the backend canWrite helper —
// keep them in sync.
export function useCanWrite() {
  const info = useContext(UserInfoContext)
  return (group) => {
    if (info.role === 'admin') return true
    if (!group) return false
    return Array.isArray(info.operatorGroups) && info.operatorGroups.includes(group)
  }
}
