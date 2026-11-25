import S from '../styles.js'
import useAuth from './useAuth.js'
import { AUTH_ENABLED, LOCAL_AUTH, MSAL_AUTH } from './authConfig.js'
import LocalLogin from './LocalLogin.jsx'

/**
 * Renders children only if the user is authenticated. Otherwise shows a
 * minimal login screen. In demo mode it's a passthrough.
 */
export default function LoginGate({ children }) {
  if (!AUTH_ENABLED) return children

  const { isAuthenticated, login } = useAuth()
  if (isAuthenticated) return children
  // Hybrid: one screen, Microsoft on top, the password form for external accounts.
  if (LOCAL_AUTH) return <LocalLogin onMicrosoft={MSAL_AUTH ? login : null} />

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        maxWidth: '380px', padding: '32px', textAlign: 'center',
        border: '1px solid var(--border-subtle)', borderRadius: '8px', background: 'var(--bg)',
      }}>
        <h1 style={{ margin: '0 0 8px', fontFamily: S.mono, fontSize: '22px' }}>
          KanbanOps
        </h1>
        <p style={{ margin: '0 0 24px', fontFamily: S.sans, fontSize: '13px', color: 'var(--muted)' }}>
          Accedi con il tuo account Microsoft Mauden per continuare.
        </p>
        <button onClick={login} style={{
          padding: '10px 18px', background: '#2563eb', border: '1px solid var(--accent)',
          borderRadius: '4px', color: '#fff', fontFamily: S.mono, fontSize: '13px',
          fontWeight: 600, cursor: 'pointer', width: '100%',
        }}>
          Sign in with Microsoft
        </button>
      </div>
    </div>
  )
}
