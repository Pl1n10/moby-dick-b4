import S from '../styles.js'
import UserMenu from '../auth/UserMenu.jsx'

export default function Header() {
  return (
    <header style={{
      padding: '20px 32px', borderBottom: '1px solid #21262d',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{
          background: '#ffffff', padding: '4px 8px', borderRadius: '4px',
          display: 'flex', alignItems: 'center',
        }}>
          <img src="/mauden-logo.png" alt="Mauden — A RICOH Company" style={{ height: '56px', display: 'block' }} />
        </div>
        <h1 style={{ margin: 0, fontSize: '20px', fontFamily: S.mono, fontWeight: 700, letterSpacing: '-0.02em' }}>
          KanbanOps
        </h1>
        <UserMenu />
      </div>
      <span style={{ fontSize: '12px', color: '#8b949e', fontFamily: S.sans }}>
        Backup Task Tracker
      </span>
    </header>
  )
}
