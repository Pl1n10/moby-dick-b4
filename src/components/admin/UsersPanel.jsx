import { useCallback, useEffect, useState } from 'react'
import S from '../../styles.js'
import { useBoard } from '../../board/BoardProvider.jsx'
import { useUserInfo } from '../../auth/UserInfoProvider.jsx'
import { useRefreshOwners } from '../../auth/OwnersProvider.jsx'
import { adminCall } from './adminApi.js'
import {
  thStyle, tdStyle, smallSelect, dangerButtonStyle, PrimaryButton, Hint, YouBadge, InlineText,
} from './ui.jsx'

// Superadmin: every account × every board. One select per board sets the
// membership (— / viewer / admin); operator scope on sections is edited in
// the "Membri" tab of that board, where the sections are.
export default function UsersPanel({ onError }) {
  const { boards } = useBoard()
  const me = useUserInfo()
  const refreshOwners = useRefreshOwners()
  const [users, setUsers] = useState(null)

  const load = useCallback(() => {
    adminCall('GET', '/api/users').then(setUsers).catch(e => onError(e.message))
  }, [onError])

  useEffect(() => { load() }, [load])

  const after = (email) => { load(); refreshOwners(); if (email === me.email) me.refresh() }
  const run = (promise, email) => promise.then(() => { after(email); return true }).catch(e => { onError(e.message); return false })

  const setMembership = (u, slug, role) => {
    const url = `/api/t/${slug}/members/${encodeURIComponent(u.email)}`
    return run(role ? adminCall('PUT', url, { role }) : adminCall('DELETE', url), u.email)
  }

  const removeUser = (u) => {
    if (!window.confirm(`Eliminare l'account ${u.email}? Esce da tutte le lavagne; al prossimo accesso ripartirà dalla scelta della lavagna.`)) return
    run(adminCall('DELETE', `/api/users/${u.id}`), u.email)
  }

  return (
    <div>
      <Hint>
        Tutti gli account, su tutte le lavagne. Chi accede per la prima volta sceglie da solo la sua lavagna ed entra
        come <code>viewer</code>. Il super admin è admin ovunque e gestisce lavagne e utenti.
      </Hint>
      {users === null ? (
        <div style={{ color: 'var(--faint)', padding: '20px', textAlign: 'center' }}>Loading…</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Nome owner</th>
                {(boards || []).map(b => <th key={b.slug} style={thStyle}>{b.name}</th>)}
                <th style={thStyle} title="Admin ovunque, gestisce lavagne e utenti">Super admin</th>
                <th style={thStyle} />
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const isSelf = me.email && u.email === me.email
                return (
                  <tr key={u.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={tdStyle}>
                      <span style={{ fontFamily: S.mono, fontSize: '12px', color: 'var(--text-2)', wordBreak: 'break-all' }}>{u.email}</span>
                      {isSelf && <YouBadge />}
                    </td>
                    <td style={tdStyle}>
                      <InlineText value={u.displayOwner} emptyLabel="(nascosto)" placeholder="(nascosto)"
                        onSave={v => run(adminCall('PATCH', `/api/users/${u.id}`, { displayOwner: v }), u.email)} />
                    </td>
                    {(boards || []).map(b => {
                      const m = u.memberships.find(x => x.slug === b.slug)
                      return (
                        <td key={b.slug} style={tdStyle}>
                          <select value={m ? m.role : ''} onChange={e => setMembership(u, b.slug, e.target.value)}
                            title={u.homeBoard === b.slug ? 'Lavagna di casa' : ''}
                            style={{ ...smallSelect, minWidth: '80px', color: m ? 'var(--text)' : 'var(--faint)' }}>
                            <option value="">—</option>
                            <option value="viewer">viewer</option>
                            <option value="admin">admin</option>
                          </select>
                          {u.homeBoard === b.slug && <span title="Lavagna di casa" style={{ marginLeft: '4px', fontSize: '11px' }}>⌂</span>}
                        </td>
                      )
                    })}
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <input type="checkbox" checked={u.isSuperadmin} disabled={isSelf}
                        title={isSelf ? 'Non puoi togliere il super admin a te stesso' : ''}
                        onChange={e => run(adminCall('PATCH', `/api/users/${u.id}`, { isSuperadmin: e.target.checked }), u.email)} />
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      {!isSelf && <button onClick={() => removeUser(u)} style={dangerButtonStyle}>Elimina</button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <AddUserForm onCreate={(email, displayOwner) => run(adminCall('POST', '/api/users', { email, displayOwner }), email)} />
    </div>
  )
}

function AddUserForm({ onCreate }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = () => {
    if (!email.trim()) return
    setBusy(true)
    onCreate(email.trim(), name.trim() || null)
      .then(ok => { if (ok) { setEmail(''); setName('') } })
      .finally(() => setBusy(false))
  }
  return (
    <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
      <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '8px', fontFamily: S.mono }}>
        Pre-registra un account (poi assegnagli le lavagne dalla tabella):
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="nome.cognome@mauden.com"
          style={{ ...S.inputBase, flex: '2 1 220px', maxWidth: '320px' }} />
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome owner (opzionale)"
          style={{ ...S.inputBase, flex: '2 1 180px', maxWidth: '240px' }} />
        <PrimaryButton onClick={submit} disabled={busy || !email.trim()}>+ Aggiungi</PrimaryButton>
      </div>
    </div>
  )
}
