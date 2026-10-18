import { useRef, useState, useEffect, useCallback } from 'react'
import S from '../styles.js'
import useBitAdder from '../hooks/useBitAdder.js'
import BitAdder from './BitAdder.jsx'
import ChangelogModal from './ChangelogModal.jsx'
import { LATEST_CHANGE } from '../changelog.js'

// Footer normale (KanbanOps v1.0 · © 2026 Mauden) + easter egg:
// 7 tap rapidi sulla versione (entro 3s l'uno dall'altro) sbloccano il
// drawer "Bit Adder". Una volta sbloccato in questa sessione, lo hook
// useBitAdder resta attivo anche a drawer nascosto (i bot ticchettano).
// Per chiudere visivamente: tasto Hide nel drawer. Per riaprire: altri 7 tap.

const TAP_WINDOW_MS = 3000
const TAPS_REQUIRED = 7

// "Novità" link: a dot until the viewer opens the changelog after its latest
// entry. Per browser; storage may be unavailable (private mode), never fatal.
const SEEN_KEY = 'kanbanops:changelogSeen'
const readSeen = () => { try { return localStorage.getItem(SEEN_KEY) } catch { return null } }
const writeSeen = (v) => { try { localStorage.setItem(SEEN_KEY, v) } catch { /* ignore */ } }

export default function Footer() {
  const tapCountRef = useRef(0)
  const lastTapRef = useRef(0)
  const [unlocked, setUnlocked] = useState(false)
  const [visible, setVisible] = useState(false)
  const drawerRef = useRef(null)
  const [changelogOpen, setChangelogOpen] = useState(false)
  const [unread, setUnread] = useState(() => !!LATEST_CHANGE && readSeen() !== LATEST_CHANGE)

  const openChangelog = () => {
    setChangelogOpen(true)
    setUnread(false)
    if (LATEST_CHANGE) writeSeen(LATEST_CHANGE)
  }
  // Stable, so the modal's Escape/focus effect does not re-run on re-renders.
  const closeChangelog = useCallback(() => setChangelogOpen(false), [])

  const game = useBitAdder(unlocked, visible)

  const handleVersionTap = () => {
    const now = Date.now()
    if (now - lastTapRef.current > TAP_WINDOW_MS) {
      tapCountRef.current = 0
    }
    lastTapRef.current = now
    tapCountRef.current += 1
    if (tapCountRef.current >= TAPS_REQUIRED) {
      tapCountRef.current = 0
      setUnlocked(true)
      setVisible(true)
    }
  }

  // Scroll smooth verso il drawer appena diventa visibile.
  useEffect(() => {
    if (visible && drawerRef.current) {
      drawerRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [visible])

  return (
    <>
      <footer style={{
        marginTop: '40px',
        padding: '16px 32px',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '12px',
        color: 'var(--muted)',
        fontFamily: S.sans,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {/* Version = easter egg trigger (7 taps): keep it a plain span,
              the changelog link sits next to it, never on it. */}
          <span
            onClick={handleVersionTap}
            style={{ fontFamily: S.mono, cursor: 'default', userSelect: 'none' }}
          >KanbanOps v1.0</span>
          <button
            type="button"
            onClick={openChangelog}
            title={unread ? 'Ci sono novità che non hai ancora visto' : 'Cosa è cambiato in KanbanOps'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              fontFamily: S.sans, fontSize: '12px', color: 'var(--accent)',
            }}
          >
            Novità
            {unread && <span aria-label="non lette" style={{
              width: '7px', height: '7px', borderRadius: '50%', background: 'var(--accent)',
            }} />}
          </button>
        </div>
        <span>© 2026 Mauden</span>
      </footer>

      {changelogOpen && <ChangelogModal onClose={closeChangelog} />}

      {unlocked && visible && (
        <div ref={drawerRef}>
          <BitAdder
            bits={game.bits}
            bots={game.bots}
            nextBotPrice={game.nextBotPrice}
            leaderboard={game.leaderboard}
            onManualClick={game.manualClick}
            onBuyBot={game.buyBot}
            onHide={() => setVisible(false)}
          />
        </div>
      )}
    </>
  )
}
