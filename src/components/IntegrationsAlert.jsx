import { useCallback, useEffect, useState } from 'react'
import S from '../styles.js'
import { useBoard, useIsBoardAdmin } from '../board/BoardProvider.jsx'
import apiFetch from '../auth/apiFetch.js'
import AdminConsole from './admin/AdminConsole.jsx'
import Icon from './Icon.jsx'

// A strip on top of the board when a vendor integration of THIS board is
// failing (typically: the portal session expired). Board admins only: they
// are the ones who can reconnect it, and the integrations API is theirs.
const REFRESH_MS = 5 * 60 * 1000

export default function IntegrationsAlert() {
  const isAdmin = useIsBoardAdmin()
  const { apiBase } = useBoard()
  const [failing, setFailing] = useState([])
  const [showConsole, setShowConsole] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`${apiBase}/integrations`)
      if (!r.ok) return
      const list = await r.json()
      setFailing(list.filter(i => i.enabled && i.lastError))
    } catch { /* the strip is a hint: never break the board for it */ }
  }, [apiBase])

  useEffect(() => {
    if (!isAdmin) return undefined
    load()
    const timer = setInterval(load, REFRESH_MS)
    window.addEventListener('focus', load)
    return () => { clearInterval(timer); window.removeEventListener('focus', load) }
  }, [isAdmin, load])

  if (!isAdmin || (failing.length === 0 && !showConsole)) return null

  return (
    <>
      {failing.length > 0 && <div role="alert" style={{
        display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 32px',
        background: 'var(--amber-bg)', borderBottom: '1px solid var(--amber)',
        color: 'var(--text)', fontFamily: S.sans, fontSize: '13px',
      }}>
        <Icon name="exclamation-triangle-fill" style={{ color: 'var(--amber)' }} />
        <span style={{ flex: 1 }}>
          {failing.length === 1
            ? <><strong>{failing[0].name}</strong>: {failing[0].lastError}</>
            : <><strong>{failing.length} integrazioni</strong> non si sincronizzano ({failing.map(i => i.name).join(', ')}).</>}
        </span>
        <button onClick={() => setShowConsole(true)} style={{
          padding: '4px 10px', background: 'none', border: '1px solid var(--amber)', borderRadius: '4px',
          color: 'var(--text)', cursor: 'pointer', fontFamily: S.sans, fontSize: '12px', whiteSpace: 'nowrap',
        }}>Apri Integrazioni</button>
      </div>}
      {showConsole && <AdminConsole initialTab="integrations" onClose={() => { setShowConsole(false); load() }} />}
    </>
  )
}
