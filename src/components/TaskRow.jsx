import S from '../styles.js'
import { STATUSES } from '../data.js'
import { useOwners } from '../auth/OwnersProvider.jsx'
import { formatDate, formatDeadline, isOverdue } from '../utils.js'
import Highlight from './Highlight.jsx'
import Linkify from './Linkify.jsx'
import StatusBadge from './StatusBadge.jsx'
import EditableText from './editable/EditableText.jsx'
import EditableSelect from './editable/EditableSelect.jsx'
import EditableDate from './editable/EditableDate.jsx'

export default function TaskRow({ task, search, onUpdate, onDelete, readOnly = false, showDelete = false, showGroup = false, expanded = false, onToggleExpand }) {
  const owners = useOwners()
  const total = task.subtasksTotal ?? 0
  const open = task.subtasksOpen ?? 0
  const hasChecklist = total > 0
  const allDone = hasChecklist && open === 0
  return (
    <tr style={{
      borderBottom: '1px solid #21262d', transition: 'background 0.1s',
    }}
      onMouseEnter={e => e.currentTarget.style.background = '#161b22'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {showGroup && (
        <td style={{ padding: '8px 14px', fontFamily: S.sans, fontSize: '12px', color: '#8b949e', whiteSpace: 'nowrap' }}>
          {task.group}
        </td>
      )}
      <td style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={onToggleExpand}
            title={expanded ? 'Collassa checklist' : 'Espandi checklist'}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px',
              color: hasChecklist ? '#58a6ff' : '#484f58',
              fontSize: '10px', fontFamily: S.mono, lineHeight: 1, flexShrink: 0,
            }}
          >{expanded ? '▼' : '▶'}</button>
          {hasChecklist && (
            <span title={`${open} aperti / ${total} totali`} style={{
              fontSize: '10px', fontFamily: S.mono, padding: '1px 5px', borderRadius: '8px',
              background: allDone ? '#1a3a1f' : '#1c3a5e',
              color: allDone ? '#7ee787' : '#58a6ff',
              flexShrink: 0,
            }}>{total - open}/{total}</span>
          )}
          {task.recurringTemplateId && (
            <span title="Created from recurring template" style={{
              fontSize: '12px', color: '#8b949e', flexShrink: 0,
            }}>&#x1f504;</span>
          )}
          {readOnly ? (
            <span style={{ fontFamily: S.mono, fontSize: '12px', color: '#58a6ff', padding: '2px 4px' }}>
              {task.reference ? <Highlight text={task.reference} query={search} /> : '—'}
            </span>
          ) : (
            <EditableText
              value={task.reference}
              onChange={v => onUpdate('reference', v)}
              mono
              placeholder="add reference"
              highlight={search}
            />
          )}
        </div>
      </td>
      <td style={{ padding: '8px 14px', maxWidth: '400px' }}>
        {readOnly ? (
          <span style={{ color: '#c9d1d9', padding: '2px 4px', display: 'block' }}>
            {task.description ? <Linkify text={task.description} query={search} /> : '—'}
          </span>
        ) : (
          <EditableText
            value={task.description}
            onChange={v => onUpdate('description', v)}
            placeholder="add description"
            multiline
            highlight={search}
            linkify
          />
        )}
      </td>
      <td style={{ padding: '8px 14px' }}>
        {readOnly ? (
          <StatusBadge status={task.status} />
        ) : (
          <EditableSelect
            value={task.status}
            options={STATUSES}
            onChange={v => onUpdate('status', v)}
            renderValue={v => <StatusBadge status={v} />}
          />
        )}
      </td>
      <td style={{ padding: '8px 14px' }}>
        {readOnly ? (
          <span style={{ padding: '2px 4px' }}>{task.owner}</span>
        ) : (
          <EditableSelect
            value={task.owner}
            options={owners}
            onChange={v => onUpdate('owner', v)}
          />
        )}
      </td>
      <td style={{
        padding: '8px 14px', fontFamily: S.mono, fontSize: '11px',
        color: '#8b949e', whiteSpace: 'nowrap',
      }}>
        {formatDate(task.updatedAt)}
      </td>
      <td style={{
        padding: '8px 14px', whiteSpace: 'nowrap',
        ...(isOverdue(task.deadline) && task.status !== 'Closed' && task.status !== 'Resolved'
          ? { background: '#f8514915' } : {}),
      }}>
        {readOnly ? (
          <span style={{
            fontFamily: S.mono, fontSize: '11px', padding: '2px 4px',
            color: isOverdue(task.deadline) ? '#f85149' : '#8b949e',
            fontWeight: isOverdue(task.deadline) ? 600 : 400,
          }}>
            {task.deadline ? formatDeadline(task.deadline) : '—'}
          </span>
        ) : (
          <EditableDate
            value={task.deadline}
            onChange={v => onUpdate('deadline', v)}
          />
        )}
      </td>
      {showDelete && (
        <td style={{ padding: '8px 8px', textAlign: 'center' }}>
          {!readOnly && (
            <button onClick={onDelete} title="Delete task" style={{
              background: 'none', border: 'none', color: '#484f58',
              cursor: 'pointer', fontSize: '14px', padding: '4px 6px',
              borderRadius: '4px', transition: 'all 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.color = '#f85149'; e.currentTarget.style.background = '#f8514922' }}
              onMouseLeave={e => { e.currentTarget.style.color = '#484f58'; e.currentTarget.style.background = 'none' }}
            >✕</button>
          )}
        </td>
      )}
    </tr>
  )
}
