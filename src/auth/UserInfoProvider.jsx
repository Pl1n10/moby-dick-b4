import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useIsAuthenticated } from '@azure/msal-react'
import { AUTH_ENABLED } from './authConfig.js'
import apiFetch from './apiFetch.js'
import { syncThemeFromServer } from '../theme/theme.js'

// Demo stub keeps local dev permissive — superadmin (admin on every board)
// when auth is off, matching the backend demo mode.
const DEMO_INFO = { authenticated: false, demo: true, isSuperadmin: true, owner: null, homeBoard: null, memberships: [], inUsersTable: false, loading: false, refresh: () => Promise.resolve() }

// Default in auth mode: no superadmin, no boards until /api/me resolves.
// Components rendering during the brief loading window must not show
// admin-only UI prematurely. Board roles come from `memberships`, see
// src/board/BoardProvider.jsx.
const DEFAULT_INFO = { isSuperadmin: false, owner: null, homeBoard: null, memberships: [], inUsersTable: false, loading: true }

const UserInfoContext = createContext(DEMO_INFO)

export function UserInfoProvider({ children }) {
  if (!AUTH_ENABLED) {
    return <UserInfoContext.Provider value={DEMO_INFO}>{children}</UserInfoContext.Provider>
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const isAuthenticated = useIsAuthenticated()
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [info, setInfo] = useState(DEFAULT_INFO)

  // Re-run after anything that changes the caller's boards (home board
  // choice, membership edits on themselves).
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const refresh = useCallback(() => {
    return apiFetch('/api/me')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(data => {
        syncThemeFromServer(data.theme)
        setInfo({ ...DEFAULT_INFO, ...data, loading: false })
      })
      .catch(err => {
        console.error('Failed to fetch /api/me:', err)
        setInfo({ ...DEFAULT_INFO, loading: false, error: err.message })
      })
  }, [])

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (isAuthenticated) refresh()
  }, [isAuthenticated, refresh])

  return <UserInfoContext.Provider value={{ ...info, refresh }}>{children}</UserInfoContext.Provider>
}

export function useUserInfo() {
  return useContext(UserInfoContext)
}
