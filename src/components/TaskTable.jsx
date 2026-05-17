import { Fragment, useState } from 'react'
import S from '../styles.js'
import TaskRow from './TaskRow.jsx'
import SubtaskList from './SubtaskList.jsx'
import { useIsAdmin } from '../auth/UserInfoProvider.jsx'

export default function TaskTable({ filteredTasks, isStorico, hasActiveFilters, search, onUpdate, onDelete, onSubtaskCountChange }) {
  const isAdmin = useIsAdmin()
  const readOnly = isStorico || !isAdmin
  const [expandedIds, setExpandedIds] = useState(() => new Set())

  const toggleExpand = (id) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // Action column (delete) only renders for admins on non-storico views.
  const headers = isStorico
    ? ['Gruppo', 'Reference', 'Description', 'Status', 'Owner', 'Updated', 'Scadenza']
    : isAdmin
      ? ['Reference', 'Description', 'Status', 'Owner', 'Updated', 'Scadenza', '']
      : ['Reference', 'Description', 'Status', 'Owner', 'Updated', 'Scadenza']

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
                  : isStorico
                    ? 'No closed tasks yet.'
                    : 'No tasks in this group yet. Click "+ New Task" to add one.'}
              </td>
            </tr>
          ) : (
            filteredTasks.map(task => (
              <Fragment key={task.id}>
                <TaskRow
                  task={task}
                  search={search}
                  onUpdate={(field, val) => onUpdate(task.id, field, val)}
                  onDelete={() => onDelete(task.id)}
                  readOnly={readOnly}
                  showGroup={isStorico}
                  expanded={expandedIds.has(task.id)}
                  onToggleExpand={() => toggleExpand(task.id)}
                />
                {expandedIds.has(task.id) && (
                  <tr>
                    <td colSpan={headers.length} style={{ padding: 0 }}>
                      <SubtaskList
                        taskId={task.id}
                        readOnly={readOnly}
                        onCountChange={(delta) => onSubtaskCountChange?.(task.id, delta)}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
