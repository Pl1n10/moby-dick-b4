import S from '../styles.js'
import { STATUSES, OWNERS } from '../data.js'
import { formatDate, formatDeadline, isOverdue } from '../utils.js'
import Highlight from './Highlight.jsx'
import StatusBadge from './StatusBadge.jsx'
import EditableText from './editable/EditableText.jsx'
import EditableSelect from './editable/EditableSelect.jsx'
import EditableCheckbox from './editable/EditableCheckbox.jsx'
import EditableDate from './editable/EditableDate.jsx'

export default function TaskRow({ task, search, onUpdate, onDelete, readOnly = false, showGroup = false }) {
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
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
            {task.description ? <Highlight text={task.description} query={search} /> : '—'}
          </span>
        ) : (
          <EditableText
            value={task.description}
            onChange={v => onUpdate('description', v)}
            placeholder="add description"
            multiline
            highlight={search}
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
            options={OWNERS}
            onChange={v => onUpdate('owner', v)}
          />
        )}
      </td>
      <td style={{ padding: '8px 14px', textAlign: 'center' }}>
        {readOnly ? (
          <span style={{ fontSize: '16px' }}>{task.waiting ? '⏳' : '—'}</span>
        ) : (
          <EditableCheckbox
            checked={task.waiting}
            onChange={v => onUpdate('waiting', v)}
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
      {!readOnly && (
        <td style={{ padding: '8px 8px', textAlign: 'center' }}>
          <button onClick={onDelete} title="Delete task" style={{
            background: 'none', border: 'none', color: '#484f58',
            cursor: 'pointer', fontSize: '14px', padding: '4px 6px',
            borderRadius: '4px', transition: 'all 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.color = '#f85149'; e.currentTarget.style.background = '#f8514922' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#484f58'; e.currentTarget.style.background = 'none' }}
          >✕</button>
        </td>
      )}
    </tr>
  )
}
