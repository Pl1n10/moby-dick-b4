import { useState } from 'react'
import S from '../styles.js'
import useAuth from './useAuth.js'
import { AUTH_ENABLED } from './authConfig.js'
import { useUserInfo } from './UserInfoProvider.jsx'
import { useBoard } from '../board/BoardProvider.jsx'
import AdminConsole from '../components/admin/AdminConsole.jsx'

function initials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?'
}

/**
 * Header user widget. In demo mode shows the legacy "Auth: OFF (Demo)" badge.
 * When auth is enabled shows initials + name + a logout button.
 */
export default function UserMenu() {
  if (!AUTH_ENABLED) return <DemoMenu />

  const { account, logout } = useAuth()
  const { loading } = useUserInfo()
  // Badges describe the role on the CURRENT board: the same person can be
  // admin on one board and read-only on another.
  const { role, operatorGroups } = useBoard()
  const [open, setOpen] = useState(false)
  const [showUsers, setShowUsers] = useState(false)
  if (!account) return null
  const isAdmin = !loading && role === 'admin'
  const isOperator = !loading && role !== 'admin' && operatorGroups.length > 0
  const isViewerPure = !loading && role !== 'admin' && operatorGroups.length === 0

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '4px 8px', background: 'none', border: '1px solid var(--border)',
        borderRadius: '4px', cursor: 'pointer', color: 'var(--text)',
      }}>
        <span style={{
          width: '24px', height: '24px', borderRadius: '50%',
          background: '#2563eb', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '11px', fontFamily: S.mono, fontWeight: 700,
        }}>
          {initials(account.name || account.username)}
        </span>
        <span style={{ fontSize: '12px', fontFamily: S.sans }}>
          {account.name || account.username}
        </span>
      </button>
      {isViewerPure && (
        <span title="You don't have admin privileges — task editing is disabled" style={{
          padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
          fontFamily: S.mono, background: 'var(--badge-bg)', color: 'var(--muted)', border: '1px solid var(--badge-border)',
        }}>
          Read-only
        </span>
      )}
      {isOperator && (
        <span title={`Write access on: ${operatorGroups.join(', ')}. Read-only elsewhere.`} style={{
          padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
          fontFamily: S.mono, background: 'var(--accent-bg)', color: 'var(--accent)', border: '1px solid var(--accent-border)',
        }}>
          Operator: {operatorGroups.join(' · ')}
        </span>
      )}
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 10,
          minWidth: '220px', background: 'var(--bg)',
          border: '1px solid var(--border)', borderRadius: '4px',
          padding: '8px', fontFamily: S.sans, fontSize: '12px',
        }}>
          <div style={{ padding: '4px 8px', color: 'var(--muted)', wordBreak: 'break-all' }}>
            {account.username}
          </div>
          {isAdmin && (
            <button
              onClick={() => { setShowUsers(true); setOpen(false) }}
              style={{
                marginTop: '4px', width: '100%', padding: '6px 8px',
                background: 'none', border: '1px solid var(--border)', borderRadius: '4px',
                color: 'var(--text)', cursor: 'pointer', fontFamily: S.mono, fontSize: '12px',
                textAlign: 'left',
              }}
            >
              ⚙ Gestione permessi
            </button>
          )}
          <button onClick={logout} style={{
            marginTop: '4px', width: '100%', padding: '6px 8px',
            background: 'none', border: '1px solid var(--border)', borderRadius: '4px',
            color: 'var(--text)', cursor: 'pointer', fontFamily: S.mono, fontSize: '12px',
          }}>
            Sign out
          </button>
        </div>
      )}
      {showUsers && <AdminConsole onClose={() => setShowUsers(false)} />}
    </div>
  )
}

// Demo mode: no account, everyone is superadmin. The console stays reachable
// so boards and members can be tried locally.
function DemoMenu() {
  const [showConsole, setShowConsole] = useState(false)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span style={{
        padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
        fontFamily: S.mono, background: 'var(--badge-bg)', color: 'var(--badge-warn)', border: '1px solid var(--badge-border)',
      }}>
        Auth: OFF (Demo)
      </span>
      <button onClick={() => setShowConsole(true)} style={{
        padding: '2px 8px', background: 'none', border: '1px solid var(--border)', borderRadius: '4px',
        color: 'var(--muted)', cursor: 'pointer', fontFamily: S.mono, fontSize: '11px',
      }}>⚙ Gestione permessi</button>
      {showConsole && <AdminConsole onClose={() => setShowConsole(false)} />}
    </div>
  )
}
