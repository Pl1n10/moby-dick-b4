import S from '../styles.js'

// UI del drawer "Bit Adder". Pura presentazione: state e callback vengono
// passati dal Footer che ospita lo hook useBitAdder.

const fmt = new Intl.NumberFormat('it-IT')

function Panel({ title, children }) {
  return (
    <div style={{
      flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
      padding: '12px 14px', background: '#0d1117',
      border: '1px solid #21262d', borderRadius: '6px',
    }}>
      <div style={{
        fontSize: '10px', fontFamily: S.mono, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: '#6e7681', marginBottom: '8px',
      }}>{title}</div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {children}
      </div>
    </div>
  )
}

export default function BitAdder({
  bits, bots, nextBotPrice, leaderboard,
  onManualClick, onBuyBot, onHide,
}) {
  const botsPerSec = bots
  const canBuy = bits >= nextBotPrice

  return (
    <div style={{
      borderTop: '1px solid #21262d', padding: '16px 32px 18px',
      background: '#0d1117', position: 'relative',
    }}>
      {/* Hide button — angolo in alto a destra, ben visibile */}
      <button
        onClick={onHide}
        title="Nascondi (anche con Esc nella prossima iterazione)"
        style={{
          position: 'absolute', top: '10px', right: '14px',
          padding: '4px 12px', background: 'none', border: '1px solid #30363d',
          borderRadius: '4px', color: '#8b949e', fontSize: '11px',
          fontFamily: S.mono, cursor: 'pointer',
        }}
      >× Hide</button>

      <div style={{ display: 'flex', gap: '12px', minHeight: '200px' }}>
        {/* ── Clicker ─────────────────────────────────────── */}
        <Panel title="Clicker">
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: '6px',
          }}>
            <div style={{
              fontFamily: S.mono, fontSize: '28px', fontWeight: 700,
              color: '#e6edf3', letterSpacing: '-0.02em',
            }}>{fmt.format(bits)}</div>
            <div style={{ fontFamily: S.sans, fontSize: '11px', color: '#8b949e' }}>
              bit · {bots} bot · {botsPerSec} b/s
            </div>
            <button
              onClick={onManualClick}
              style={{
                marginTop: '10px', padding: '10px 22px',
                background: '#238636', border: '1px solid #2ea043',
                borderRadius: '6px', color: '#fff', fontSize: '13px',
                fontFamily: S.sans, fontWeight: 600, cursor: 'pointer',
              }}
            >+ Aggiungo un bit</button>
          </div>
        </Panel>

        {/* ── Shop ────────────────────────────────────────── */}
        <Panel title="Shop">
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: '8px',
          }}>
            <div style={{ fontFamily: S.sans, fontSize: '14px', color: '#e6edf3', fontWeight: 600 }}>
              🤖 Bot
            </div>
            <div style={{ fontFamily: S.sans, fontSize: '11px', color: '#8b949e', textAlign: 'center' }}>
              Genera 1 bit / secondo<br/>
              Prezzo: <span style={{ fontFamily: S.mono, color: canBuy ? '#58a6ff' : '#f85149' }}>
                {fmt.format(nextBotPrice)} bit
              </span>
            </div>
            <button
              onClick={onBuyBot}
              disabled={!canBuy}
              style={{
                marginTop: '4px', padding: '8px 18px',
                background: canBuy ? '#1f6feb' : 'none',
                border: '1px solid ' + (canBuy ? '#388bfd' : '#30363d'),
                borderRadius: '6px',
                color: canBuy ? '#fff' : '#484f58',
                fontSize: '12px', fontFamily: S.sans, fontWeight: 600,
                cursor: canBuy ? 'pointer' : 'not-allowed',
              }}
            >Compra bot</button>
            <div style={{ fontFamily: S.mono, fontSize: '11px', color: '#6e7681' }}>
              Posseduti: {bots}
            </div>
          </div>
        </Panel>

        {/* ── Leaderboard ─────────────────────────────────── */}
        <Panel title="Leaderboard">
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {leaderboard.top.length === 0 && (
              <div style={{ fontFamily: S.sans, fontSize: '11px', color: '#6e7681', textAlign: 'center', marginTop: '20px' }}>
                Ancora vuoto. Sii il primo.
              </div>
            )}
            {leaderboard.top.map(row => (
              <LeaderRow key={row.rank + ':' + row.name} row={row} highlight={row.isMe} />
            ))}
            {leaderboard.me && !leaderboard.top.some(r => r.isMe) && (
              <>
                <div style={{
                  fontFamily: S.mono, fontSize: '10px', color: '#484f58',
                  textAlign: 'center', padding: '4px 0',
                }}>···</div>
                <LeaderRow row={{ ...leaderboard.me, isMe: true }} highlight />
              </>
            )}
          </div>
        </Panel>
      </div>
    </div>
  )
}

function LeaderRow({ row, highlight }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '4px 8px', borderRadius: '4px',
      background: highlight ? '#1c3a5e33' : 'transparent',
      fontFamily: S.sans, fontSize: '12px',
      color: highlight ? '#e6edf3' : '#8b949e',
    }}>
      <span style={{
        fontFamily: S.mono, width: '28px', textAlign: 'right',
        color: highlight ? '#58a6ff' : '#6e7681',
      }}>#{row.rank}</span>
      <span style={{
        flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        fontWeight: highlight ? 600 : 400,
      }}>{row.name}</span>
      <span style={{ fontFamily: S.mono, fontSize: '11px' }}>{fmt.format(row.bits)}</span>
    </div>
  )
}
