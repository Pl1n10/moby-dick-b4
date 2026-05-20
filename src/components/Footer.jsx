import { useRef, useState, useEffect } from 'react'
import S from '../styles.js'
import useBitAdder from '../hooks/useBitAdder.js'
import BitAdder from './BitAdder.jsx'

// Footer normale (KanbanOps v1.0 · © 2026 Mauden) + easter egg:
// 7 tap rapidi sulla versione (entro 3s l'uno dall'altro) sbloccano il
// drawer "Bit Adder". Una volta sbloccato in questa sessione, lo hook
// useBitAdder resta attivo anche a drawer nascosto (i bot ticchettano).
// Per chiudere visivamente: tasto Hide nel drawer. Per riaprire: altri 7 tap.

const TAP_WINDOW_MS = 3000
const TAPS_REQUIRED = 7

export default function Footer() {
  const tapCountRef = useRef(0)
  const lastTapRef = useRef(0)
  const [unlocked, setUnlocked] = useState(false)
  const [visible, setVisible] = useState(false)
  const drawerRef = useRef(null)

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
        borderTop: '1px solid #21262d',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '12px',
        color: '#8b949e',
        fontFamily: S.sans,
      }}>
        <span
          onClick={handleVersionTap}
          style={{ fontFamily: S.mono, cursor: 'default', userSelect: 'none' }}
        >KanbanOps v1.0</span>
        <span>© 2026 Mauden</span>
      </footer>

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
