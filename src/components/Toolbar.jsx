import S from '../styles.js'
import { STATUSES } from '../data.js'
import { useBoard, useIsBoardAdmin, useLabel } from '../board/BoardProvider.jsx'
import { useOwners } from '../auth/OwnersProvider.jsx'
import Icon from './Icon.jsx'

export default function Toolbar({
  isStorico, search, onSearchChange,
  // Decoupled from isStorico: the Info Reperibile tab is cross-pillar too
  // (needs the group filter) but keeps the status filter and stays writable.
  showGroupFilter = isStorico, showRecurring = !isStorico,
  filterGroup, onFilterGroupChange,
  filterStatus, onFilterStatusChange,
  filterOwner, onFilterOwnerChange,
  hasActiveFilters, onClearFilters,
  filteredCount, totalCount,
  recurring, onOpenRecurring,
  onAdd, onExport,
  canAdd = false,
  showUndo = false, canUndo = false, undoLabel = null, onUndo,
}) {
  const isAdmin = useIsBoardAdmin()
  const { pillars } = useBoard()
  const label = useLabel()
  const owners = useOwners()
  return (
    <div style={{
      marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
    }}>
      {/* Search */}
      <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: '320px' }}>
        <span style={{
          position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)',
          color: 'var(--faint)', fontSize: '14px', pointerEvents: 'none',
        }}><Icon name="search" /></span>
        <input
          type="text"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder={`Search ID, ${label('reference', 'reference').toLowerCase()}, description or checklist…`}
          style={{
            width: '100%', padding: '7px 12px 7px 32px',
            background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px',
            color: 'var(--text)', fontSize: '13px', fontFamily: S.sans, outline: 'none',
            transition: 'border-color 0.15s',
          }}
          onFocus={e => e.target.style.borderColor = 'var(--accent)'}
          onBlur={e => e.target.style.borderColor = 'var(--border)'}
        />
      </div>

      {/* Group filter (cross-pillar views) */}
      {showGroupFilter && (
        <select
          value={filterGroup}
          onChange={e => onFilterGroupChange(e.target.value)}
          style={{
            padding: '7px 10px', background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: '6px', color: filterGroup ? 'var(--text)' : 'var(--muted)',
            fontSize: '13px', fontFamily: S.sans, cursor: 'pointer', outline: 'none',
          }}
        >
          <option value="">All groups</option>
          {pillars.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      )}

      {/* Status filter (hidden in Storico) */}
      {!isStorico && (
        <select
          value={filterStatus}
          onChange={e => onFilterStatusChange(e.target.value)}
          style={{
            padding: '7px 10px', background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: '6px', color: filterStatus ? 'var(--text)' : 'var(--muted)',
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
          padding: '7px 10px', background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: '6px', color: filterOwner ? 'var(--text)' : 'var(--muted)',
          fontSize: '13px', fontFamily: S.sans, cursor: 'pointer', outline: 'none',
        }}
      >
        <option value="">All owners</option>
        {owners.map(o => <option key={o} value={o}>{o}</option>)}
      </select>

      {/* Clear filters */}
      {hasActiveFilters && (
        <button onClick={onClearFilters} style={{
          padding: '7px 12px', background: 'none', border: '1px solid var(--border)',
          borderRadius: '6px', color: 'var(--muted)', fontSize: '12px', fontFamily: S.mono,
          cursor: 'pointer', transition: 'all 0.15s',
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--danger)'; e.currentTarget.style.color = 'var(--danger)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}
        ><Icon name="x-lg" style={{ marginRight: '4px' }} />Clear</button>
      )}

      {/* Result counter */}
      {hasActiveFilters && (
        <span style={{ fontSize: '12px', fontFamily: S.mono, color: 'var(--muted)' }}>
          {filteredCount} of {totalCount}
        </span>
      )}

      {/* Recurring button — admin-only (modal can edit/delete templates) */}
      {showRecurring && isAdmin && (
        <button onClick={onOpenRecurring} title="Manage recurring tasks" style={{
          padding: '7px 12px', background: 'none', border: '1px solid var(--border)',
          borderRadius: '6px', color: 'var(--muted)', fontSize: '13px', fontFamily: S.sans,
          cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '6px',
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}
        >
          Recurring
          {recurring.filter(r => r.active).length > 0 && (
            <span style={{
              fontSize: '10px', fontFamily: S.mono, padding: '1px 5px', borderRadius: '10px',
              background: 'var(--accent-bg)', color: 'var(--accent)',
            }}>{recurring.filter(r => r.active).length}</span>
          )}
        </button>
      )}

      {/* Spacer + Undo + Export + Add */}
      <div style={{ flex: '1' }} />
      {/* Undo — hidden for pure read-only users (they never accumulate actions) */}
      {showUndo && (
        <button
          onClick={onUndo}
          disabled={!canUndo}
          title={canUndo ? `Annulla: ${undoLabel} (Ctrl+Z)` : 'Niente da annullare'}
          style={{
            padding: '7px 12px', background: 'none', border: '1px solid var(--border)',
            borderRadius: '6px',
            color: canUndo ? 'var(--muted)' : 'var(--faint)',
            fontSize: '13px', fontFamily: S.sans,
            cursor: canUndo ? 'pointer' : 'not-allowed',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            if (!canUndo) return
            e.currentTarget.style.borderColor = 'var(--accent)'
            e.currentTarget.style.color = 'var(--accent)'
          }}
          onMouseLeave={e => {
            if (!canUndo) return
            e.currentTarget.style.borderColor = 'var(--border)'
            e.currentTarget.style.color = 'var(--muted)'
          }}
        ><Icon name="arrow-counterclockwise" style={{ marginRight: '4px' }} />Annulla</button>
      )}
      <button
        onClick={onExport}
        disabled={filteredCount === 0}
        title={filteredCount === 0 ? 'Nessun task da esportare' : `Esporta ${filteredCount} task in CSV`}
        style={{
          padding: '7px 12px', background: 'none', border: '1px solid var(--border)',
          borderRadius: '6px',
          color: filteredCount === 0 ? 'var(--faint)' : 'var(--muted)',
          fontSize: '13px', fontFamily: S.sans,
          cursor: filteredCount === 0 ? 'not-allowed' : 'pointer',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => {
          if (filteredCount === 0) return
          e.currentTarget.style.borderColor = 'var(--accent)'
          e.currentTarget.style.color = 'var(--accent)'
        }}
        onMouseLeave={e => {
          if (filteredCount === 0) return
          e.currentTarget.style.borderColor = 'var(--border)'
          e.currentTarget.style.color = 'var(--muted)'
        }}
      ><Icon name="download" style={{ marginRight: '6px' }} />Export CSV</button>
      {!isStorico && canAdd && (
        <button onClick={onAdd} style={{
          padding: '7px 16px', background: 'var(--success-strong)', border: '1px solid var(--success)',
          borderRadius: '6px', color: '#fff', fontSize: '13px', fontFamily: S.sans,
          fontWeight: 600, cursor: 'pointer',
        }}><Icon name="plus-lg" style={{ marginRight: '6px' }} />New Task</button>
      )}
    </div>
  )
}
