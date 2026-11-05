import { USE_ID_TOKEN, apiTokenRequest, loginRequest } from './authConfig.js'

// Request used to get the backend's bearer: the API scope normally, the login
// scopes when the stopgap ID-token mode is on.
export const backendTokenRequest = USE_ID_TOKEN ? loginRequest : apiTokenRequest

// Renew the ID token this many seconds before it expires.
const ID_TOKEN_MARGIN_S = 300

function idTokenFresh(result) {
  const exp = result?.idTokenClaims?.exp
  return Boolean(result?.idToken) && typeof exp === 'number' &&
    exp - Date.now() / 1000 > ID_TOKEN_MARGIN_S
}

/**
 * Bearer token for our backend.
 *
 * Normal mode: access token for `api://<client>/access_as_user`.
 *
 * Stopgap mode (VITE_AUTH_USE_ID_TOKEN=true): the ID token, whose audience is
 * the client ID. Used while the app registration has no "Expose an API"
 * (AADSTS500011, HANDOFF "Migrazione a un nuovo tenant Entra"). MSAL decides
 * whether to refresh by looking at the access token only, so a cached result
 * can carry an expired ID token: we check `exp` and force a refresh.
 *
 * Throws what acquireTokenSilent throws (e.g. InteractionRequiredAuthError).
 */
export async function acquireBackendToken(pca, account) {
  const request = { ...backendTokenRequest, account }
  if (!USE_ID_TOKEN) {
    const result = await pca.acquireTokenSilent(request)
    return result.accessToken
  }
  let result = await pca.acquireTokenSilent(request)
  if (!idTokenFresh(result)) {
    result = await pca.acquireTokenSilent({ ...request, forceRefresh: true })
  }
  return result.idToken || null
}
