import S from '../styles.js'
import UserMenu from '../auth/UserMenu.jsx'
import { useBoard } from '../board/BoardProvider.jsx'
import ThemeToggle from './ThemeToggle.jsx'
import { useUserInfo } from '../auth/UserInfoProvider.jsx'

export default function Header() {
  const { boards, board, goToBoard } = useBoard()
  const { isSuperadmin, memberships } = useUserInfo()
  // Someone who belongs to a single board never sees boards at all: for the
  // backup team the multi-board deploy must go unnoticed. The switcher is
  // for the superadmin and for members of several boards; the others can
  // still open another board by its URL (visibility stays permissive), and
  // then its name is shown so they know where they are.
  const memberOf = Array.isArray(memberships) ? memberships.map(m => m.slug) : []
  const showSwitcher = boards && boards.length > 1 && (isSuperadmin || memberOf.length > 1)
  const showBoardName = !showSwitcher && board && !(memberOf.length === 1 && memberOf[0] === board.slug)
  return (
    <header style={{
      padding: '20px 32px', borderBottom: '1px solid var(--border-subtle)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{
          background: '#ffffff', padding: '4px 8px', borderRadius: '4px',
          border: '1px solid var(--logo-border)',
          display: 'flex', alignItems: 'center',
        }}>
          <img src="/mauden-logo.png" alt="Mauden — A RICOH Company" style={{ height: '56px', display: 'block' }} />
        </div>
        <h1 style={{ margin: 0, fontSize: '20px', fontFamily: S.mono, fontWeight: 700, letterSpacing: '-0.02em' }}>
          KanbanOps
        </h1>
        <UserMenu />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
      <ThemeToggle />
      {/* Board switcher. Visibility is permissive (2026-10-07): every board is
          listed, the role badges in UserMenu say what you can do on it. */}
      {showSwitcher ? (
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
      ) : showBoardName && (
        <span style={{ fontSize: '12px', color: 'var(--muted)', fontFamily: S.sans }}>
          {board.name}
        </span>
      )}
      </div>
    </header>
  )
}
