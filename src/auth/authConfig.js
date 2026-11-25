// Single source of truth for auth configuration.
// All values come from Vite env vars (VITE_*) so they can be swapped per environment
// without code changes. When VITE_AUTH_ENABLED is not "true" the app stays in demo mode.

export const AUTH_ENABLED = import.meta.env.VITE_AUTH_ENABLED === 'true'

// 'entra' (Microsoft login, default), 'local' (email + password against the
// users table) or 'hybrid' (both: Microsoft for the tenant's domains, a
// password for external accounts). Must match AUTH_MODE on the backend.
const RAW_MODE = import.meta.env.VITE_AUTH_MODE
export const AUTH_MODE = ['local', 'hybrid'].includes(RAW_MODE) ? RAW_MODE : 'entra'
/** Email + password login offered (local or hybrid). */
export const LOCAL_AUTH = AUTH_ENABLED && AUTH_MODE !== 'entra'
/** Microsoft login offered (entra or hybrid). */
export const MSAL_AUTH = AUTH_ENABLED && AUTH_MODE !== 'local'

const tenantId = import.meta.env.VITE_AZURE_TENANT_ID || ''
const clientId = import.meta.env.VITE_AZURE_CLIENT_ID || ''
const redirectUri = import.meta.env.VITE_AZURE_REDIRECT_URI || window.location.origin

// Scope of the custom backend API exposed in the Entra app registration.
// Format: api://<client-id>/access_as_user
export const API_SCOPE = import.meta.env.VITE_AZURE_API_SCOPE || ''

// Stopgap: send the ID token to the backend instead of an access token for
// API_SCOPE. Only for an app registration without "Expose an API"; the backend
// then needs AZURE_API_AUDIENCE=<client-id>. See backendToken.js.
export const USE_ID_TOKEN = import.meta.env.VITE_AUTH_USE_ID_TOKEN === 'true'

export const msalConfig = {
  auth: {
    clientId,
    authority: tenantId ? `https://login.microsoftonline.com/${tenantId}` : '',
    redirectUri,
    postLogoutRedirectUri: redirectUri,
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
}

// Scopes requested at login time (ID token claims).
export const loginRequest = {
  scopes: ['openid', 'profile', 'email', 'User.Read'],
}

// Scopes used to acquire an access token for the backend.
export const apiTokenRequest = {
  scopes: API_SCOPE ? [API_SCOPE] : [],
}
