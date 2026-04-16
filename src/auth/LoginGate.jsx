import S from '../styles.js'
import useAuth from './useAuth.js'
import { AUTH_ENABLED } from './authConfig.js'

/**
 * Renders children only if the user is authenticated. Otherwise shows a
 * minimal login screen. In demo mode it's a passthrough.
 */
export default function LoginGate({ children }) {
  if (!AUTH_ENABLED) return children

  const { isAuthenticated, login } = useAuth()
  if (isAuthenticated) return children

  return (
    <div style={{
      minHeight: '100vh', background: '#0d1117', color: '#e6edf3',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        maxWidth: '380px', padding: '32px', textAlign: 'center',
        border: '1px solid #21262d', borderRadius: '8px', background: '#0d1117',
      }}>
        <h1 style={{ margin: '0 0 8px', fontFamily: S.mono, fontSize: '22px' }}>
          🐋 Moby Dick B4
        </h1>
        <p style={{ margin: '0 0 24px', fontFamily: S.sans, fontSize: '13px', color: '#8b949e' }}>
          Accedi con il tuo account Microsoft Mauden per continuare.
        </p>
        <button onClick={login} style={{
          padding: '10px 18px', background: '#2563eb', border: '1px solid #58a6ff',
          borderRadius: '4px', color: '#fff', fontFamily: S.mono, fontSize: '13px',
          fontWeight: 600, cursor: 'pointer', width: '100%',
        }}>
          Sign in with Microsoft
        </button>
      </div>
    </div>
  )
}
