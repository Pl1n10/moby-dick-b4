import { PublicClientApplication } from '@azure/msal-browser'
import { AUTH_ENABLED, LOCAL_AUTH, msalConfig } from './authConfig.js'
import { acquireBackendToken } from './backendToken.js'
import { getSession, clearSession } from './localSession.js'

/**
 * Wrapper around fetch() that automatically attaches a Microsoft access token
 * as `Authorization: Bearer <token>` when auth is enabled.
 *
 * Lives outside React so hooks (useTasks/useRecurring) can call it without
 * having to thread the auth context through every layer.
 *
 * In demo mode it's a thin passthrough to fetch().
 */

let pcaPromise = null
function getPca() {
  // Reuse the same instance MsalProvider creates by reading from sessionStorage
  // cache. Building a second PCA with the same config + cache works because
  // MSAL is stateless w.r.t. multiple instances pointing at the same cache.
  if (!pcaPromise) {
    const pca = new PublicClientApplication(msalConfig)
    pcaPromise = pca.initialize().then(() => pca)
  }
  return pcaPromise
}

async function getAccessToken() {
  if (!AUTH_ENABLED) return null
  try {
    const pca = await getPca()
    const accounts = pca.getAllAccounts()
    if (accounts.length === 0) return null
    return await acquireBackendToken(pca, accounts[0])
  } catch (err) {
    console.error('apiFetch token acquisition failed:', err)
    return null
  }
}

export default async function apiFetch(url, options = {}) {
  const token = LOCAL_AUTH ? (getSession()?.token || null) : await getAccessToken()
  const headers = { ...(options.headers || {}) }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(url, { ...options, headers })
  // Local login: a 401 on a request that carried our token means the session
  // is over (password reset by an admin, account deleted, expired). Back to
  // the login screen instead of a board full of errors.
  if (LOCAL_AUTH && token && res.status === 401 && getSession()?.token === token) clearSession()
  return res
}
