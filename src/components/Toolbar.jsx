import S from '../styles.js'
import { GROUPS, STATUSES, OWNERS } from '../data.js'
import { useIsAdmin } from '../auth/UserInfoProvider.jsx'

export default function Toolbar({
  isStorico, search, onSearchChange,
  filterGroup, onFilterGroupChange,
  filterStatus, onFilterStatusChange,
  filterOwner, onFilterOwnerChange,
  hasActiveFilters, onClearFilters,
  filteredCount, totalCount,
  recurring, onOpenRecurring,
  onAdd, onExport,
}) {
  const isAdmin = useIsAdmin()
  return (
    <div style={{
      marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
    }}>
      {/* Search */}
      <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: '320px' }}>
        <span style={{
          position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)',
          color: '#484f58', fontSize: '14px', pointerEvents: 'none',
        }}>🔍</span>
        <input
          type="text"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search reference or description…"
          style={{
            width: '100%', padding: '7px 12px 7px 32px',
            background: '#0d1117', border: '1px solid #30363d', borderRadius: '6px',
            color: '#e6edf3', fontSize: '13px', fontFamily: S.sans, outline: 'none',
            transition: 'border-color 0.15s',
          }}
          onFocus={e => e.target.style.borderColor = '#58a6ff'}
          onBlur={e => e.target.style.borderColor = '#30363d'}
        />
      </div>

      {/* Group filter (Storico only) */}
      {isStorico && (
        <select
          value={filterGroup}
          onChange={e => onFilterGroupChange(e.target.value)}
          style={{
            padding: '7px 10px', background: '#0d1117', border: '1px solid #30363d',
            borderRadius: '6px', color: filterGroup ? '#e6edf3' : '#8b949e',
            fontSize: '13px', fontFamily: S.sans, cursor: 'pointer', outline: 'none',
          }}
        >
          <option value="">All groups</option>
          {GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      )}

      {/* Status filter (hidden in Storico) */}
      {!isStorico && (
        <select
          value={filterStatus}
          onChange={e => onFilterStatusChange(e.target.value)}
          style={{
            padding: '7px 10px', background: '#0d1117', border: '1px solid #30363d',
            borderRadius: '6px', color: filterStatus ? '#e6edf3' : '#8b949e',
            fontSize: '13px', fontFamily: S.sans, cursor: 'pointer', outline: 'none',
          }}
        >
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      )}

      {/* Owner filter */}
      <select
        value={filterOwner}
        onChange={e => onFilterOwnerChange(e.target.value)}
        style={{
          padding: '7px 10px', background: '#0d1117', border: '1px solid #30363d',
          borderRadius: '6px', color: filterOwner ? '#e6edf3' : '#8b949e',
          fontSize: '13px', fontFamily: S.sans, cursor: 'pointer', outline: 'none',
        }}
      >
        <option value="">All owners</option>
        {OWNERS.map(o => <option key={o} value={o}>{o}</option>)}
      </select>

      {/* Clear filters */}
      {hasActiveFilters && (
        <button onClick={onClearFilters} style={{
          padding: '7px 12px', background: 'none', border: '1px solid #30363d',
          borderRadius: '6px', color: '#8b949e', fontSize: '12px', fontFamily: S.mono,
          cursor: 'pointer', transition: 'all 0.15s',
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#f85149'; e.currentTarget.style.color = '#f85149' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#30363d'; e.currentTarget.style.color = '#8b949e' }}
        >✕ Clear</button>
      )}

      {/* Result counter */}
      {hasActiveFilters && (
        <span style={{ fontSize: '12px', fontFamily: S.mono, color: '#8b949e' }}>
          {filteredCount} of {totalCount}
        </span>
      )}

      {/* Recurring button — admin-only (modal can edit/delete templates) */}
      {!isStorico && isAdmin && (
        <button onClick={onOpenRecurring} title="Manage recurring tasks" style={{
          padding: '7px 12px', background: 'none', border: '1px solid #30363d',
          borderRadius: '6px', color: '#8b949e', fontSize: '13px', fontFamily: S.sans,
          cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '6px',
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#58a6ff'; e.currentTarget.style.color = '#58a6ff' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#30363d'; e.currentTarget.style.color = '#8b949e' }}
        >
          Recurring
          {recurring.filter(r => r.active).length > 0 && (
            <span style={{
              fontSize: '10px', fontFamily: S.mono, padding: '1px 5px', borderRadius: '10px',
              background: '#1c3a5e', color: '#58a6ff',
            }}>{recurring.filter(r => r.active).length}</span>
          )}
        </button>
      )}

      {/* Spacer + Export + Add */}
      <div style={{ flex: '1' }} />
      <button
        onClick={onExport}
        disabled={filteredCount === 0}
        title={filteredCount === 0 ? 'Nessun task da esportare' : `Esporta ${filteredCount} task in CSV`}
        style={{
          padding: '7px 12px', background: 'none', border: '1px solid #30363d',
          borderRadius: '6px',
          color: filteredCount === 0 ? '#484f58' : '#8b949e',
          fontSize: '13px', fontFamily: S.sans,
          cursor: filteredCount === 0 ? 'not-allowed' : 'pointer',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => {
          if (filteredCount === 0) return
          e.currentTarget.style.borderColor = '#58a6ff'
          e.currentTarget.style.color = '#58a6ff'
        }}
        onMouseLeave={e => {
          if (filteredCount === 0) return
          e.currentTarget.style.borderColor = '#30363d'
          e.currentTarget.style.color = '#8b949e'
        }}
      >↓ Export CSV</button>
      {!isStorico && isAdmin && (
        <button onClick={onAdd} style={{
          padding: '7px 16px', background: '#238636', border: '1px solid #2ea043',
          borderRadius: '6px', color: '#fff', fontSize: '13px', fontFamily: S.sans,
          fontWeight: 600, cursor: 'pointer',
        }}>+ New Task</button>
      )}
    </div>
  )
}
