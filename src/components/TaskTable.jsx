import { Fragment, useState } from 'react'
import S from '../styles.js'
import TaskRow from './TaskRow.jsx'
import SubtaskList from './SubtaskList.jsx'

// `showGroup` is decoupled from `isStorico` because the Info Reperibile tab is
// also cross-pillar (needs the Gruppo column) but stays fully writable.
export default function TaskTable({ filteredTasks, canWrite, isStorico, showGroup = isStorico, highlightReperibile = true, emptyMessage, hasActiveFilters, search, onUpdate, onDelete, onSubtaskCountChange }) {
  const [expandedIds, setExpandedIds] = useState(() => new Set())

  const toggleExpand = (id) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // A row auto-expands while a search matches text inside its checklist, so the
  // user can see WHY the task surfaced. Collapses again when the search clears.
  const q = search ? search.toLowerCase() : ''
  const matchesInSubtasks = (task) =>
    !!q && (task.subtasksText || '').toLowerCase().includes(q)

  // Header layout. Always leads with the "Rep." checkbox column, then an
  // optional "Gruppo" column on the cross-pillar views (Storico, Info
  // Reperibile), and closes with a trailing actions column outside Storico.
  // Each row decides whether to render the ✕ button based on per-task write
  // scope, so that column may be visually empty for out-of-scope users.
  const headers = [
    'Rep.',
    ...(showGroup ? ['Gruppo'] : []),
    'Reference', 'Description', 'Priorità', 'Status', 'Owner', 'Updated', 'Scadenza',
    ...(isStorico ? [] : ['']),
  ]

  return (
    <div style={{ border: '1px solid #21262d', borderRadius: '8px', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: S.sans, fontSize: '13px' }}>
        <thead>
          <tr style={{ background: '#161b22' }}>
            {headers.map(h => (
              <th key={h || '_act'} style={{
                padding: '10px 14px', textAlign: 'left', fontWeight: 600,
                fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em',
                color: '#8b949e', borderBottom: '1px solid #21262d',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filteredTasks.length === 0 ? (
            <tr>
              <td colSpan={headers.length} style={{ padding: '40px', textAlign: 'center', color: '#484f58' }}>
                {hasActiveFilters
                  ? 'No tasks match your filters.'
                  : emptyMessage || (isStorico
                    ? 'No closed tasks yet.'
                    : 'No tasks in this group yet. Click "+ New Task" to add one.')}
              </td>
            </tr>
          ) : (
            filteredTasks.map(task => {
              const rowReadOnly = isStorico || !canWrite(task.group)
              const isExpanded = expandedIds.has(task.id) || matchesInSubtasks(task)
              return (
                <Fragment key={task.id}>
                  <TaskRow
                    task={task}
                    search={search}
                    onUpdate={(field, val) => onUpdate(task.id, field, val)}
                    onDelete={() => onDelete(task.id)}
                    readOnly={rowReadOnly}
                    showDelete={!isStorico}
                    showGroup={showGroup}
                    highlightReperibile={highlightReperibile}
                    expanded={isExpanded}
                    onToggleExpand={() => toggleExpand(task.id)}
                  />
                  {isExpanded && (
                    <tr>
                      <td colSpan={headers.length} style={{ padding: 0 }}>
                        <SubtaskList
                          taskId={task.id}
                          readOnly={rowReadOnly}
                          search={search}
                          onCountChange={(delta) => onSubtaskCountChange?.(task.id, delta)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
