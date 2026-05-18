import { useState } from 'react'
import S from '../styles.js'
import { GROUPS } from '../data.js'
import useUsers from '../hooks/useUsers.js'
import { useUserInfo } from '../auth/UserInfoProvider.jsx'
import { useRefreshOwners } from '../auth/OwnersProvider.jsx'

// Compact labels for the pillar scope checkboxes (the full names are too
// long for an inline cell, especially "NBU - Banche Estere"). Tooltips
// surface the full name on hover.
const PILLAR_SHORT = {
  'Commvault': 'Cmv',
  'Cohesity': 'Coh',
  'Data Domain - ZFS': 'DD',
  'NBU - Banche Estere': 'NBU',
}

export default function UsersModal({ onClose }) {
  const { users, loading, error, update, remove, create, clearError } = useUsers(true)
  const me = useUserInfo()
  const refreshOwners = useRefreshOwners()

  // After any change that may affect display_owner, refresh the global owner
  // picker so other admins see the new list without F5.
  const afterChange = () => refreshOwners()

  const setOwner = (u, value) => {
    update(u.id, { displayOwner: value }).then(afterChange).catch(() => {})
  }
  const setRole = (u, role) => {
    update(u.id, { role }).then(afterChange).catch(() => {})
  }
  const setScope = (u, groups) => {
    update(u.id, { operatorGroups: groups }).then(afterChange).catch(() => {})
  }
  const hide = (u) => {
    update(u.id, { displayOwner: null }).then(afterChange).catch(() => {})
  }
  const removeUser = (u) => {
    if (!window.confirm(`Rimuovere ${u.email}? Si registrerà come viewer al prossimo login.`)) return
    remove(u.id).then(afterChange).catch(() => {})
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: '#161b22', border: '1px solid #30363d', borderRadius: '12px',
        padding: '24px', width: '90%', maxWidth: '900px', maxHeight: '85vh', overflowY: 'auto',
        color: '#e6edf3', fontFamily: S.sans,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontFamily: S.mono, fontSize: '16px' }}>Gestione utenti</h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#8b949e', fontSize: '18px', cursor: 'pointer',
          }}>✕</button>
        </div>

        {error && (
          <div style={{
            padding: '8px 12px', marginBottom: '12px', borderRadius: '6px',
            background: '#311', border: '1px solid #f85149', color: '#f85149',
            fontSize: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>{error}</span>
            <button onClick={clearError} style={{
              background: 'none', border: 'none', color: '#f85149', cursor: 'pointer', fontSize: '14px',
            }}>✕</button>
          </div>
        )}

        <p style={{ fontSize: '12px', color: '#8b949e', marginTop: 0, marginBottom: '12px', lineHeight: 1.5 }}>
          Tutti gli account @mauden vengono registrati automaticamente come <code>viewer</code> al primo login.
          Da qui puoi cambiare il nome visualizzato come owner, promuovere a admin, nasconderli dalla picker o rimuoverli.
        </p>

        {loading && users.length === 0 ? (
          <div style={{ color: '#484f58', padding: '20px', textAlign: 'center' }}>Loading…</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#0d1117' }}>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Display owner</th>
                <th style={thStyle}>Role</th>
                <th style={thStyle} title="Pillar in cui un viewer può scrivere. Admins hanno accesso ovunque, indipendentemente da questi flag.">Scope</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const isSelf = me.email && u.email === me.email
                return (
                  <tr key={u.id} style={{ borderBottom: '1px solid #21262d' }}>
                    <td style={tdStyle}>
                      <span style={{ fontFamily: S.mono, fontSize: '12px', color: '#c9d1d9', wordBreak: 'break-all' }}>
                        {u.email}
                      </span>
                      {isSelf && (
                        <span style={{
                          marginLeft: '6px', fontSize: '10px', padding: '1px 5px',
                          borderRadius: '8px', background: '#1c3a5e', color: '#58a6ff',
                        }}>tu</span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <OwnerCell user={u} onSave={(v) => setOwner(u, v)} />
                    </td>
                    <td style={tdStyle}>
                      <select
                        value={u.role}
                        disabled={isSelf}
                        title={isSelf ? 'Non puoi cambiare il tuo ruolo' : ''}
                        onChange={e => setRole(u, e.target.value)}
                        style={{
                          ...S.inputBase, padding: '3px 6px', fontSize: '12px',
                          width: 'auto', minWidth: '90px',
                          cursor: isSelf ? 'not-allowed' : 'pointer',
                          opacity: isSelf ? 0.5 : 1,
                        }}
                      >
                        <option value="admin">admin</option>
                        <option value="viewer">viewer</option>
                      </select>
                    </td>
                    <td style={tdStyle}>
                      <ScopeCell user={u} onChange={(groups) => setScope(u, groups)} />
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {u.displayOwner != null && !isSelf && (
                        <button
                          onClick={() => hide(u)}
                          title="Rimuovi dalla owner picker (resta in DB)"
                          style={actionButtonStyle}
                        >Hide</button>
                      )}
                      {!isSelf && (
                        <button
                          onClick={() => removeUser(u)}
                          title="Elimina dal DB"
                          style={{ ...actionButtonStyle, marginLeft: '6px', borderColor: '#f85149aa', color: '#f85149' }}
                        >Remove</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        <div style={{ marginTop: '20px', borderTop: '1px solid #21262d', paddingTop: '16px' }}>
          <AddUserForm onCreate={(payload) => create(payload).then(afterChange)} />
        </div>
      </div>
    </div>
  )
}

const thStyle = {
  padding: '8px 12px', textAlign: 'left', fontWeight: 600,
  fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em',
  color: '#8b949e', borderBottom: '1px solid #21262d',
}

const tdStyle = {
  padding: '8px 12px', verticalAlign: 'middle',
}

const actionButtonStyle = {
  padding: '4px 10px', background: 'none', border: '1px solid #30363d',
  borderRadius: '4px', color: '#8b949e', fontSize: '11px', fontFamily: 'JetBrains Mono, monospace',
  cursor: 'pointer',
}

// Inline editable display_owner cell: shows the current value as text, becomes
// an input on click; saves on blur or Enter, cancels on Escape.
function OwnerCell({ user, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(user.displayOwner ?? '')

  const commit = () => {
    setEditing(false)
    const next = draft.trim()
    if ((next || null) !== (user.displayOwner ?? null)) {
      onSave(next || null)
    }
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') { setDraft(user.displayOwner ?? ''); setEditing(false) }
        }}
        placeholder="(nascosto)"
        style={{ ...S.inputBase, padding: '3px 6px', fontSize: '12px', maxWidth: '220px' }}
      />
    )
  }

  return (
    <span
      onClick={() => { setDraft(user.displayOwner ?? ''); setEditing(true) }}
      style={{
        cursor: 'pointer', padding: '3px 6px', borderRadius: '4px',
        color: user.displayOwner ? '#c9d1d9' : '#484f58',
        fontStyle: user.displayOwner ? 'normal' : 'italic',
        border: '1px dashed transparent',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = '#30363d'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
      title="Click per modificare"
    >
      {user.displayOwner || '(nascosto)'}
    </span>
  )
}

// Inline pillar-scope cell: 4 compact checkboxes, one per pillar. Disabled
// (and visually all-on) for admins, since the column is ignored when
// role=admin anyway and showing it crossed out would be misleading.
function ScopeCell({ user, onChange }) {
  const isAdmin = user.role === 'admin'
  const groups = Array.isArray(user.operatorGroups) ? user.operatorGroups : []
  const toggle = (g) => {
    const next = groups.includes(g) ? groups.filter(x => x !== g) : [...groups, g]
    onChange(next)
  }
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      {GROUPS.map(g => {
        const checked = isAdmin || groups.includes(g)
        return (
          <label
            key={g}
            title={isAdmin ? `${g} — gli admin hanno accesso ovunque` : g}
            style={{
              display: 'flex', alignItems: 'center', gap: '3px',
              fontSize: '11px', fontFamily: S.mono,
              cursor: isAdmin ? 'not-allowed' : 'pointer',
              opacity: isAdmin ? 0.4 : 1,
              color: checked ? '#58a6ff' : '#8b949e',
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={isAdmin}
              onChange={() => toggle(g)}
              style={{
                accentColor: '#58a6ff',
                cursor: isAdmin ? 'not-allowed' : 'pointer',
              }}
            />
            {PILLAR_SHORT[g] || g}
          </label>
        )
      })}
    </div>
  )
}

function AddUserForm({ onCreate }) {
  const [email, setEmail] = useState('')
  const [displayOwner, setDisplayOwner] = useState('')
  const [role, setRole] = useState('viewer')
  const [scope, setScope] = useState([])
  const [busy, setBusy] = useState(false)

  const toggleScope = (g) => {
    setScope(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])
  }

  const submit = () => {
    const e = email.trim()
    if (!e) return
    setBusy(true)
    onCreate({ email: e, displayOwner: displayOwner.trim() || null, role, operatorGroups: scope })
      .then(() => { setEmail(''); setDisplayOwner(''); setRole('viewer'); setScope([]) })
      .finally(() => setBusy(false))
  }

  return (
    <div>
      <div style={{ fontSize: '12px', color: '#8b949e', marginBottom: '8px', fontFamily: S.mono }}>
        Aggiungi manualmente (utile per pre-registrare prima del primo login):
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="email@mauden.com"
          style={{ ...S.inputBase, flex: '2 1 220px', maxWidth: '320px' }}
        />
        <input
          value={displayOwner}
          onChange={e => setDisplayOwner(e.target.value)}
          placeholder="Display owner (opzionale)"
          style={{ ...S.inputBase, flex: '2 1 180px', maxWidth: '240px' }}
        />
        <select
          value={role}
          onChange={e => setRole(e.target.value)}
          style={{ ...S.inputBase, width: 'auto', minWidth: '100px' }}
        >
          <option value="viewer">viewer</option>
          <option value="admin">admin</option>
        </select>
        <button
          onClick={submit}
          disabled={busy || !email.trim()}
          style={{
            padding: '6px 14px', background: '#238636', border: '1px solid #2ea043',
            borderRadius: '6px', color: '#fff', fontSize: '13px', fontFamily: S.sans,
            fontWeight: 600, cursor: busy || !email.trim() ? 'not-allowed' : 'pointer',
            opacity: busy || !email.trim() ? 0.5 : 1,
          }}
        >+ Add</button>
      </div>
      {role !== 'admin' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', color: '#8b949e', fontFamily: S.mono }}>Scope:</span>
          {GROUPS.map(g => (
            <label key={g} title={g} style={{
              display: 'flex', alignItems: 'center', gap: '3px',
              fontSize: '11px', fontFamily: S.mono, cursor: 'pointer',
              color: scope.includes(g) ? '#58a6ff' : '#8b949e',
            }}>
              <input
                type="checkbox"
                checked={scope.includes(g)}
                onChange={() => toggleScope(g)}
                style={{ accentColor: '#58a6ff', cursor: 'pointer' }}
              />
              {PILLAR_SHORT[g] || g}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
