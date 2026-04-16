import { useMsal, useIsAuthenticated } from '@azure/msal-react'
import { InteractionRequiredAuthError } from '@azure/msal-browser'
import { AUTH_ENABLED, loginRequest, apiTokenRequest } from './authConfig.js'

/**
 * Unified auth hook used everywhere in the app.
 *
 * In demo mode (AUTH_ENABLED=false) returns a stub that pretends the user is
 * authenticated and does nothing on login/logout, so callers don't need to
 * branch on the flag.
 *
 * Returns: { isAuthenticated, account, login, logout, getToken }
 *  - account: { name, username, ... } | null
 *  - getToken(): Promise<string | null> — access token for the backend, or null in demo
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

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { instance, accounts } = useMsal()
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const isAuthenticated = useIsAuthenticated()
  const account = accounts[0] || null

  const login = () => instance.loginRedirect(loginRequest)
  const logout = () => instance.logoutRedirect()

  const getToken = async () => {
    if (!account) return null
    try {
      const result = await instance.acquireTokenSilent({ ...apiTokenRequest, account })
      return result.accessToken
    } catch (err) {
      if (err instanceof InteractionRequiredAuthError) {
        // Falls back to interactive — user will be redirected.
        await instance.acquireTokenRedirect(apiTokenRequest)
        return null
      }
      console.error('Token acquisition failed:', err)
      return null
    }
  }

  return { isAuthenticated, account, login, logout, getToken }
}
