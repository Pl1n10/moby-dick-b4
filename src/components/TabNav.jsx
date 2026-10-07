import S from '../styles.js'

// `pillars` = the current board's sections; `showReperibile` = the board has
// the on-call feature (otherwise no Info Reperibile tab at all).
export default function TabNav({ tasks, activeGroup, onChangeGroup, pillars, showReperibile }) {
  const isStorico = activeGroup === '__storico__'
  const isReperibile = activeGroup === '__reperibile__'
  const closedCount = tasks.filter(t => t.status === 'Closed').length
  // Same predicate as the tab's own filter in App.jsx: flagged and still open.
  const reperibileCount = tasks.filter(t => t.reperibile && t.status !== 'Closed').length

  return (
    <nav style={{ padding: '0 32px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center' }}>
      {pillars.map(g => {
        const count = tasks.filter(t => t.group === g && t.status !== 'Closed').length
        const isActive = g === activeGroup
        return (
          <button key={g} onClick={() => onChangeGroup(g)} style={{
            padding: '12px 20px', background: 'none', border: 'none',
            borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
            color: isActive ? 'var(--accent)' : 'var(--muted)',
            fontFamily: S.sans, fontSize: '14px', fontWeight: isActive ? 600 : 400,
            cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            {g}
            {count > 0 && <span style={{
              fontSize: '11px', fontFamily: S.mono, padding: '1px 6px', borderRadius: '10px',
              background: isActive ? 'var(--accent-bg)' : 'var(--border-subtle)', color: isActive ? 'var(--accent)' : 'var(--muted)',
            }}>{count}</span>}
          </button>
        )
      })}

      <div style={{ width: '1px', height: '20px', background: 'var(--border)', margin: '0 8px' }} />

      {/* Cross-pillar view of the tasks flagged as relevant for whoever is
          on call. Amber to read as "duty", distinct from the pillar blue. */}
      {showReperibile && <button onClick={() => onChangeGroup('__reperibile__')} style={{
        padding: '12px 20px', background: 'none', border: 'none',
        borderBottom: isReperibile ? '2px solid var(--amber)' : '2px solid transparent',
        color: isReperibile ? 'var(--amber)' : 'var(--muted)',
        fontFamily: S.sans, fontSize: '14px', fontWeight: isReperibile ? 600 : 400,
        cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        Info Reperibile
        {reperibileCount > 0 && <span style={{
          fontSize: '11px', fontFamily: S.mono, padding: '1px 6px', borderRadius: '10px',
          background: isReperibile ? 'var(--amber-bg)' : 'var(--border-subtle)',
          color: isReperibile ? 'var(--amber)' : 'var(--muted)',
        }}>{reperibileCount}</span>}
      </button>}

      <button onClick={() => onChangeGroup('__storico__')} style={{
        padding: '12px 20px', background: 'none', border: 'none',
        borderBottom: isStorico ? '2px solid var(--muted)' : '2px solid transparent',
        color: isStorico ? 'var(--text)' : 'var(--faint)',
        fontFamily: S.sans, fontSize: '14px', fontWeight: isStorico ? 600 : 400,
        cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '8px',
        fontStyle: 'italic',
      }}>
        Storico
        {closedCount > 0 && <span style={{
          fontSize: '11px', fontFamily: S.mono, padding: '1px 6px', borderRadius: '10px',
          background: isStorico ? 'var(--border-subtle)' : 'var(--surface)', color: 'var(--muted)',
        }}>{closedCount}</span>}
      </button>
    </nav>
  )
}
