import S from '../styles.js'
import { GROUPS } from '../data.js'

export default function TabNav({ tasks, activeGroup, onChangeGroup }) {
  const isStorico = activeGroup === '__storico__'
  const isReperibile = activeGroup === '__reperibile__'
  const closedCount = tasks.filter(t => t.status === 'Closed').length
  // Same predicate as the tab's own filter in App.jsx: flagged and still open.
  const reperibileCount = tasks.filter(t => t.reperibile && t.status !== 'Closed').length

  return (
    <nav style={{ padding: '0 32px', borderBottom: '1px solid #21262d', display: 'flex', alignItems: 'center' }}>
      {GROUPS.map(g => {
        const count = tasks.filter(t => t.group === g && t.status !== 'Closed').length
        const isActive = g === activeGroup
        return (
          <button key={g} onClick={() => onChangeGroup(g)} style={{
            padding: '12px 20px', background: 'none', border: 'none',
            borderBottom: isActive ? '2px solid #58a6ff' : '2px solid transparent',
            color: isActive ? '#58a6ff' : '#8b949e',
            fontFamily: S.sans, fontSize: '14px', fontWeight: isActive ? 600 : 400,
            cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            {g}
            {count > 0 && <span style={{
              fontSize: '11px', fontFamily: S.mono, padding: '1px 6px', borderRadius: '10px',
              background: isActive ? '#1c3a5e' : '#21262d', color: isActive ? '#58a6ff' : '#8b949e',
            }}>{count}</span>}
          </button>
        )
      })}

      <div style={{ width: '1px', height: '20px', background: '#30363d', margin: '0 8px' }} />

      {/* Cross-pillar view of the tasks flagged as relevant for whoever is
          on call. Amber to read as "duty", distinct from the pillar blue. */}
      <button onClick={() => onChangeGroup('__reperibile__')} style={{
        padding: '12px 20px', background: 'none', border: 'none',
        borderBottom: isReperibile ? '2px solid #d29922' : '2px solid transparent',
        color: isReperibile ? '#d29922' : '#8b949e',
        fontFamily: S.sans, fontSize: '14px', fontWeight: isReperibile ? 600 : 400,
        cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        Info Reperibile
        {reperibileCount > 0 && <span style={{
          fontSize: '11px', fontFamily: S.mono, padding: '1px 6px', borderRadius: '10px',
          background: isReperibile ? '#3d2e0a' : '#21262d',
          color: isReperibile ? '#d29922' : '#8b949e',
        }}>{reperibileCount}</span>}
      </button>

      <button onClick={() => onChangeGroup('__storico__')} style={{
        padding: '12px 20px', background: 'none', border: 'none',
        borderBottom: isStorico ? '2px solid #8b949e' : '2px solid transparent',
        color: isStorico ? '#e6edf3' : '#484f58',
        fontFamily: S.sans, fontSize: '14px', fontWeight: isStorico ? 600 : 400,
        cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '8px',
        fontStyle: 'italic',
      }}>
        Storico
        {closedCount > 0 && <span style={{
          fontSize: '11px', fontFamily: S.mono, padding: '1px 6px', borderRadius: '10px',
          background: isStorico ? '#21262d' : '#161b22', color: '#8b949e',
        }}>{closedCount}</span>}
      </button>
    </nav>
  )
}
