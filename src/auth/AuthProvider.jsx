import { useMemo } from 'react'
import { PublicClientApplication, EventType } from '@azure/msal-browser'
import { MsalProvider } from '@azure/msal-react'
import { AUTH_ENABLED, msalConfig } from './authConfig.js'

// Single PCA instance per app lifetime (lazy-built only when auth is on).
let pcaInstance = null
function getPca() {
  if (!pcaInstance) {
    pcaInstance = new PublicClientApplication(msalConfig)
    pcaInstance.initialize().then(() => {
      // After initialize, set first signed-in account as active.
      const accounts = pcaInstance.getAllAccounts()
      if (accounts.length > 0) pcaInstance.setActiveAccount(accounts[0])
    })
    pcaInstance.addEventCallback((event) => {
      if (event.eventType === EventType.LOGIN_SUCCESS && event.payload?.account) {
        pcaInstance.setActiveAccount(event.payload.account)
      }
    })
  }
  return pcaInstance
}

/**
 * Wraps the app with MsalProvider when auth is enabled.
 * In demo mode it's a transparent passthrough — no MSAL instance is created.
 */
export default function AuthProvider({ children }) {
  const pca = useMemo(() => (AUTH_ENABLED ? getPca() : null), [])
  if (!AUTH_ENABLED) return children
  return <MsalProvider instance={pca}>{children}</MsalProvider>
}
