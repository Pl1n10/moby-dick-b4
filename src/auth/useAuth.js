import { useMsal, useIsAuthenticated } from '@azure/msal-react'
import { InteractionRequiredAuthError } from '@azure/msal-browser'
import { AUTH_ENABLED, LOCAL_AUTH, MSAL_AUTH, loginRequest } from './authConfig.js'
import { acquireBackendToken, backendTokenRequest } from './backendToken.js'
import { useLocalSession, clearSession } from './localSession.js'

// LOCAL_AUTH and MSAL_AUTH are build-time constants: the hooks below are
// called or skipped the same way on every render, so their order never changes.
/* eslint-disable react-hooks/rules-of-hooks */

/** True when someone is logged in, whatever the auth mode (demo: always). */
export function useIsLoggedIn() {
  if (!AUTH_ENABLED) return true
  const local = LOCAL_AUTH ? Boolean(useLocalSession()) : false
  const msal = MSAL_AUTH ? useIsAuthenticated() : false
  return local || msal
}

function useMsalAuth() {
  const { instance, accounts } = useMsal()
  const isAuthenticated = useIsAuthenticated()
  const account = accounts[0] || null

  const login = () => instance.loginRedirect(loginRequest)
  const logout = () => instance.logoutRedirect()

  const getToken = async () => {
    if (!account) return null
    try {
      return await acquireBackendToken(instance, account)
    } catch (err) {
      if (err instanceof InteractionRequiredAuthError) {
        // Falls back to interactive — user will be redirected.
        await instance.acquireTokenRedirect(backendTokenRequest)
        return null
      }
      console.error('Token acquisition failed:', err)
      return null
    }
  }

  return { isAuthenticated, account, login, logout, getToken }
}

/**
 * Unified auth hook used everywhere in the app.
 *
 * In demo mode (AUTH_ENABLED=false) returns a stub that pretends the user is
 * authenticated and does nothing on login/logout, so callers don't need to
 * branch on the flag.
 *
 * Hybrid mode: a password session wins if there is one, else Microsoft.
 * `login` always means "sign in with Microsoft" (the password form posts by
 * itself, see LocalLogin).
 *
 * Returns: { isAuthenticated, account, login, logout, getToken }
 *  - account: { name, username, ... } | null
 *  - getToken(): Promise<string | null> — bearer for the backend, or null in demo
 */
export default function useAuth() {
  if (!AUTH_ENABLED) {
    return {
      isAuthenticated: true,
      account: null,
      login: () => {},
      logout: () => {},
      getToken: async () => null,
    }
  }

  const session = LOCAL_AUTH ? useLocalSession() : null
  const msal = MSAL_AUTH ? useMsalAuth() : null

  if (session) {
    return {
      isAuthenticated: true,
      account: { name: session.name, username: session.email },
      login: msal ? msal.login : () => {},
      logout: clearSession,
      getToken: async () => session.token,
    }
  }
  if (msal) return msal
  return {
    isAuthenticated: false,
    account: null,
    login: () => {},
    logout: clearSession,
    getToken: async () => null,
  }
}
