import { useState } from 'react'
import S from '../styles.js'
import { useOwners } from '../auth/OwnersProvider.jsx'
import { useIsAdmin } from '../auth/UserInfoProvider.jsx'

// Header of the "Info Reperibile" tab: who is on call right now.
// Admins get a select to change it; everybody else reads it.
export default function OnCallBar({ onCall, loading, onChange }) {
  const owners = useOwners()
  const isAdmin = useIsAdmin()
  const [error, setError] = useState(null)

  const handleChange = async (e) => {
    setError(null)
    const reason = await onChange(e.target.value)
    if (reason) setError(reason)
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
      padding: '12px 16px', marginBottom: '16px',
      background: '#161b22', border: '1px solid #30363d', borderRadius: '8px',
    }}>
      <span style={{ fontSize: '18px', lineHeight: 1 }} role="img" aria-label="reperibile">📟</span>
      <span style={{
        fontFamily: S.sans, fontSize: '12px', fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.06em', color: '#8b949e',
      }}>Reperibile</span>

      {isAdmin ? (
        <select value={onCall || ''} onChange={handleChange} style={{
          ...S.inputBase, width: 'auto', minWidth: '200px', cursor: 'pointer',
        }}>
          <option value="">— nessuno —</option>
          {owners.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <span style={{
          fontFamily: S.sans, fontSize: '14px', fontWeight: 600,
          color: onCall ? '#e6edf3' : '#484f58',
        }}>
          {loading ? '…' : (onCall || 'nessuno impostato')}
        </span>
      )}

      {/* An admin still needs to see the current value while the select is
          closed — the select shows it, so only the empty case needs a nudge. */}
      {isAdmin && !loading && !onCall && (
        <span style={{ fontFamily: S.sans, fontSize: '12px', color: '#8b949e' }}>
          nessun reperibile impostato
        </span>
      )}

      {error && (
        <span style={{ fontFamily: S.sans, fontSize: '12px', color: '#f85149' }}>
          ⚠ {error}
        </span>
      )}
    </div>
  )
}
