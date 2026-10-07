import S from '../styles.js'
import UserMenu from '../auth/UserMenu.jsx'
import { useBoard } from '../board/BoardProvider.jsx'

export default function Header() {
  const { boards, board, goToBoard } = useBoard()
  return (
    <header style={{
      padding: '20px 32px', borderBottom: '1px solid var(--border-subtle)',
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
      {/* Board switcher. Visibility is permissive (2026-10-07): every board is
          listed, the role badges in UserMenu say what you can do on it. */}
      {boards && boards.length > 1 ? (
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--muted)', fontFamily: S.sans }}>
          Lavagna
          <select
            value={board?.slug || ''}
            onChange={e => goToBoard(e.target.value)}
            style={{ ...S.inputBase, width: 'auto', border: '1px solid var(--border)', cursor: 'pointer', fontWeight: 600 }}
          >
            {boards.map(b => <option key={b.slug} value={b.slug}>{b.name}</option>)}
          </select>
        </label>
      ) : (
        <span style={{ fontSize: '12px', color: 'var(--muted)', fontFamily: S.sans }}>
          {board?.name || ''}
        </span>
      )}
    </header>
  )
}
