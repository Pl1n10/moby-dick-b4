import { useCallback, useState } from 'react'
import S from '../../styles.js'
import { useBoard } from '../../board/BoardProvider.jsx'
import MembersPanel from './MembersPanel.jsx'
import BoardsPanel from './BoardsPanel.jsx'
import UsersPanel from './UsersPanel.jsx'

// Permissions console. A board admin sees only the members of the current
// board; the superadmin also manages boards/sections and every account.
export default function AdminConsole({ onClose }) {
  const { board, isSuperadmin } = useBoard()
  const tabs = [
    { id: 'members', label: `Membri · ${board.name}` },
    ...(isSuperadmin ? [{ id: 'boards', label: 'Lavagne' }, { id: 'users', label: 'Utenti' }] : []),
  ]
  const [tab, setTab] = useState('members')
  const [error, setError] = useState(null)
  const onError = useCallback((msg) => setError(msg), [])

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: '#161b22', border: '1px solid #30363d', borderRadius: '12px',
        padding: '24px', width: '92%', maxWidth: '1000px', maxHeight: '85vh', overflowY: 'auto',
        color: '#e6edf3', fontFamily: S.sans,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h2 style={{ margin: 0, fontFamily: S.mono, fontSize: '16px' }}>Gestione permessi</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8b949e', fontSize: '18px', cursor: 'pointer' }}>✕</button>
        </div>

        {tabs.length > 1 && (
          <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid #21262d', marginBottom: '16px' }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => { setTab(t.id); setError(null) }} style={{
                padding: '8px 14px', background: 'none', border: 'none',
                borderBottom: tab === t.id ? '2px solid #58a6ff' : '2px solid transparent',
                color: tab === t.id ? '#58a6ff' : '#8b949e',
                fontFamily: S.sans, fontSize: '13px', fontWeight: tab === t.id ? 600 : 400, cursor: 'pointer',
              }}>{t.label}</button>
            ))}
          </div>
        )}

        {error && (
          <div style={{
            padding: '8px 12px', marginBottom: '12px', borderRadius: '6px',
            background: '#311', border: '1px solid #f85149', color: '#f85149',
            fontSize: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>{error}</span>
            <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#f85149', cursor: 'pointer' }}>✕</button>
          </div>
        )}

        {tab === 'members' && <MembersPanel onError={onError} />}
        {tab === 'boards' && <BoardsPanel onError={onError} />}
        {tab === 'users' && <UsersPanel onError={onError} />}
      </div>
    </div>
  )
}
