import { useCallback, useEffect, useState } from 'react'
import S from '../../styles.js'
import { useBoard } from '../../board/BoardProvider.jsx'
import { useUserInfo } from '../../auth/UserInfoProvider.jsx'
import { useRefreshOwners } from '../../auth/OwnersProvider.jsx'
import { adminCall } from './adminApi.js'
import {
  thStyle, tdStyle, smallSelect, dangerButtonStyle, PrimaryButton, Hint, YouBadge, InlineText,
} from './ui.jsx'

// Members of the CURRENT board: role, operator scope on its sections,
// display name. Open to the board's admins (and the superadmin).
export default function MembersPanel({ onError }) {
  const { apiBase, board, pillars, isSuperadmin } = useBoard()
  const me = useUserInfo()
  const refreshOwners = useRefreshOwners()
  const [members, setMembers] = useState(null)

  const load = useCallback(() => {
    adminCall('GET', `${apiBase}/members`).then(setMembers).catch(e => onError(e.message))
  }, [apiBase, onError])

  useEffect(() => { load() }, [load])

  // Every change goes through PUT/DELETE and then reloads: the list is small,
  // and the server is the one normalizing scope and names.
  // Resolves to true on success, so the add form clears only then. Applied
  // to the row optimistically (a checkbox must flip on click); the reload
  // brings back the server's truth either way.
  const save = (email, patch) => {
    setMembers(prev => prev && prev.map(m => (m.email === email ? { ...m, ...patch } : m)))
    return adminCall('PUT', `${apiBase}/members/${encodeURIComponent(email)}`, patch)
    .then(() => {
      load(); refreshOwners()
      if (email === me.email) me.refresh()
      return true
    })
    .catch(e => { onError(e.message); load(); return false })
  }

  const remove = (m) => {
    if (!window.confirm(`Togliere ${m.email} dalla lavagna ${board.name}? Mantiene l'account e le altre lavagne.`)) return
    adminCall('DELETE', `${apiBase}/members/${encodeURIComponent(m.email)}`)
      .then(() => {
        load(); refreshOwners()
        if (m.email === me.email) me.refresh()
      })
      .catch(e => onError(e.message))
  }

  return (
    <div>
      <Hint>
        Chi fa parte di <b>{board.name}</b>: compare fra gli owner assegnabili. Gli <code>admin</code> modificano
        tutto sulla lavagna e ne gestiscono i membri; i <code>viewer</code> leggono e scrivono solo nelle sezioni
        spuntate. Il nome visualizzato è lo stesso su tutte le lavagne.
      </Hint>

      {members === null ? (
        <div style={{ color: '#484f58', padding: '20px', textAlign: 'center' }}>Loading…</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Nome owner</th>
              <th style={thStyle}>Ruolo</th>
              <th style={thStyle} title="Sezioni in cui un viewer può scrivere. Gli admin scrivono ovunque.">Sezioni</th>
              <th style={{ ...thStyle, textAlign: 'right' }} />
            </tr>
          </thead>
          <tbody>
            {members.map(m => {
              const isSelf = me.email && m.email === me.email
              const locked = isSelf && !isSuperadmin       // no self-demote / self-remove
              return (
                <tr key={m.email} style={{ borderBottom: '1px solid #21262d' }}>
                  <td style={tdStyle}>
                    <span style={{ fontFamily: S.mono, fontSize: '12px', color: '#c9d1d9', wordBreak: 'break-all' }}>{m.email}</span>
                    {isSelf && <YouBadge />}
                  </td>
                  <td style={tdStyle}>
                    <InlineText value={m.displayOwner} emptyLabel="(nascosto)" placeholder="(nascosto)"
                      onSave={v => save(m.email, { displayOwner: v })} />
                  </td>
                  <td style={tdStyle}>
                    <select value={m.role} disabled={locked}
                      title={locked ? 'Non puoi cambiare il tuo ruolo' : ''}
                      onChange={e => save(m.email, { role: e.target.value })}
                      style={{ ...smallSelect, opacity: locked ? 0.5 : 1, cursor: locked ? 'not-allowed' : 'pointer' }}>
                      <option value="admin">admin</option>
                      <option value="viewer">viewer</option>
                    </select>
                  </td>
                  <td style={tdStyle}>
                    <ScopeChecks pillars={pillars} role={m.role} value={m.operatorGroups}
                      onChange={groups => save(m.email, { operatorGroups: groups })} />
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {!locked && <button onClick={() => remove(m)} style={dangerButtonStyle}>Togli</button>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      <AddMemberForm pillars={pillars} onAdd={(email, patch) => save(email, patch)} />
    </div>
  )
}

function ScopeChecks({ pillars, role, value, onChange }) {
  const isAdmin = role === 'admin'
  const toggle = (g) => onChange(value.includes(g) ? value.filter(x => x !== g) : [...value, g])
  return (
    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
      {pillars.map(g => {
        const checked = isAdmin || value.includes(g)
        return (
          <label key={g} title={isAdmin ? `${g}: gli admin scrivono ovunque` : g} style={{
            display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', fontFamily: S.mono,
            cursor: isAdmin ? 'not-allowed' : 'pointer', opacity: isAdmin ? 0.4 : 1,
            color: checked ? '#58a6ff' : '#8b949e', whiteSpace: 'nowrap',
          }}>
            <input type="checkbox" checked={checked} disabled={isAdmin} onChange={() => toggle(g)}
              style={{ accentColor: '#58a6ff', cursor: isAdmin ? 'not-allowed' : 'pointer' }} />
            {g}
          </label>
        )
      })}
    </div>
  )
}

function AddMemberForm({ pillars, onAdd }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('viewer')
  const [scope, setScope] = useState([])
  const [busy, setBusy] = useState(false)

  const submit = () => {
    const e = email.trim()
    if (!e) return
    setBusy(true)
    const patch = { role, operatorGroups: role === 'admin' ? [] : scope }
    if (name.trim()) patch.displayOwner = name.trim()
    onAdd(e, patch)
      .then(ok => { if (ok) { setEmail(''); setName(''); setRole('viewer'); setScope([]) } })
      .finally(() => setBusy(false))
  }

  return (
    <div style={{ marginTop: '20px', borderTop: '1px solid #21262d', paddingTop: '16px' }}>
      <div style={{ fontSize: '12px', color: '#8b949e', marginBottom: '8px', fontFamily: S.mono }}>
        Aggiungi un collega (anche se non è mai entrato):
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="nome.cognome@mauden.com"
          style={{ ...S.inputBase, flex: '2 1 220px', maxWidth: '320px' }} />
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome owner (opzionale)"
          style={{ ...S.inputBase, flex: '2 1 180px', maxWidth: '240px' }} />
        <select value={role} onChange={e => setRole(e.target.value)} style={{ ...S.inputBase, width: 'auto', minWidth: '100px' }}>
          <option value="viewer">viewer</option>
          <option value="admin">admin</option>
        </select>
        <PrimaryButton onClick={submit} disabled={busy || !email.trim()}>+ Aggiungi</PrimaryButton>
      </div>
      {role !== 'admin' && pillars.length > 0 && (
        <div style={{ marginTop: '10px' }}>
          <ScopeChecks pillars={pillars} role={role} value={scope} onChange={setScope} />
        </div>
      )}
    </div>
  )
}
