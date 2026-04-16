// Single source of truth for auth configuration.
// All values come from Vite env vars (VITE_*) so they can be swapped per environment
// without code changes. When VITE_AUTH_ENABLED is not "true" the app stays in demo mode.

export const AUTH_ENABLED = import.meta.env.VITE_AUTH_ENABLED === 'true'

const tenantId = import.meta.env.VITE_AZURE_TENANT_ID || ''
const clientId = import.meta.env.VITE_AZURE_CLIENT_ID || ''
const redirectUri = import.meta.env.VITE_AZURE_REDIRECT_URI || window.location.origin

// Scope of the custom backend API exposed in the Entra app registration.
// Format: api://<client-id>/access_as_user
export const API_SCOPE = import.meta.env.VITE_AZURE_API_SCOPE || ''

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
