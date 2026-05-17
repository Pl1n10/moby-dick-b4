import { useState } from 'react'
import S from '../styles.js'
import useAuth from './useAuth.js'
import { AUTH_ENABLED } from './authConfig.js'
import { useUserInfo } from './UserInfoProvider.jsx'

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
  if (!AUTH_ENABLED) {
    return (
      <span style={{
        padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
        fontFamily: S.mono, background: '#1f2937', color: '#f59e0b', border: '1px solid #374151',
      }}>
        Auth: OFF (Demo)
      </span>
    )
  }

  const { account, logout } = useAuth()
  const { role, loading } = useUserInfo()
  const [open, setOpen] = useState(false)
  if (!account) return null
  const isViewer = !loading && role !== 'admin'

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '4px 8px', background: 'none', border: '1px solid #30363d',
        borderRadius: '4px', cursor: 'pointer', color: '#e6edf3',
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
      {isViewer && (
        <span title="You don't have admin privileges — task editing is disabled" style={{
          padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
          fontFamily: S.mono, background: '#1f2937', color: '#8b949e', border: '1px solid #374151',
        }}>
          Read-only
        </span>
      )}
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 10,
          minWidth: '200px', background: '#0d1117',
          border: '1px solid #30363d', borderRadius: '4px',
          padding: '8px', fontFamily: S.sans, fontSize: '12px',
        }}>
          <div style={{ padding: '4px 8px', color: '#8b949e', wordBreak: 'break-all' }}>
            {account.username}
          </div>
          <button onClick={logout} style={{
            marginTop: '4px', width: '100%', padding: '6px 8px',
            background: 'none', border: '1px solid #30363d', borderRadius: '4px',
            color: '#e6edf3', cursor: 'pointer', fontFamily: S.mono, fontSize: '12px',
          }}>
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
