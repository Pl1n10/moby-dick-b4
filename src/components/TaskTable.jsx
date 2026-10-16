import { useState } from 'react'
import {
  DndContext, closestCorners, KeyboardSensor, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers'
import { CSS } from '@dnd-kit/utilities'
import S from '../styles.js'
import TaskRow from './TaskRow.jsx'
import SubtaskList from './SubtaskList.jsx'
import { useLabel } from '../board/BoardProvider.jsx'

// `showGroup` is decoupled from `isStorico` because the Info Reperibile tab is
// also cross-pillar (needs the Gruppo column) but stays fully writable.
//
// Drag & drop (manual order, "stile Jira"): `showDragHandle` adds the grip
// column, `canReorder` enables it (false while filters are on). Each task is
// its own <tbody> — row + open checklist — so the checklist travels with the
// task while dragging instead of being left behind.
export default function TaskTable({ filteredTasks, canWrite, isStorico, showGroup = isStorico, showReperibile = true, highlightReperibile = true, emptyMessage, hasActiveFilters, search, onUpdate, onMove, showDragHandle = false, canReorder = false, onDelete, onSubtaskCountChange }) {
  const [expandedIds, setExpandedIds] = useState(() => new Set())
  const label = useLabel()

  // A small distance before a drag starts, so a click on the grip is a click.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

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

  // Dropped at index i: the task goes right above whatever follows it in the
  // new visible order (null = bottom of the section).
  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return
    const ids = filteredTasks.map(t => t.id)
    const moved = arrayMove(ids, ids.indexOf(active.id), ids.indexOf(over.id))
    const at = moved.indexOf(active.id)
    onMove?.(active.id, moved[at + 1] ?? null)
  }

  // Header layout. Leads with the drag grip (sections, writers only), then the
  // "Rep." checkbox column (only on boards with the reperibile feature), then
  // the task ID, then an optional "Gruppo" column on the cross-pillar views
  // (Storico, Info Reperibile), and closes with a trailing actions column
  // outside Storico. Each row decides whether to render the delete button
  // based on per-task write scope, so that column may be visually empty for
  // out-of-scope users.
  const headers = [
    ...(showDragHandle ? [{ key: '_drag', text: '' }] : []),
    ...(showReperibile ? ['Rep.'] : []),
    'ID',
    ...(showGroup ? ['Gruppo'] : []),
    label('reference', 'Reference'), 'Description', 'Priorità', 'Status', 'Owner', 'Updated', 'Scadenza',
    ...(isStorico ? [] : [{ key: '_act', text: '' }]),
  ].map(h => (typeof h === 'string' ? { key: h, text: h } : h))

  return (
    <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '8px', overflow: 'hidden' }}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={handleDragEnd}
        accessibility={{ screenReaderInstructions: { draggable: 'Premi spazio per prendere il task, frecce su/giù per spostarlo, spazio per lasciarlo, Esc per annullare.' } }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: S.sans, fontSize: '13px' }}>
          <thead>
            <tr style={{ background: 'var(--surface)' }}>
              {headers.map(h => (
                <th key={h.key} style={{
                  padding: h.key === '_drag' ? '10px 0 10px 8px' : '10px 14px', textAlign: 'left', fontWeight: 600,
                  fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em',
                  color: 'var(--muted)', borderBottom: '1px solid var(--border-subtle)',
                  ...(h.key === '_drag' ? { width: '20px' } : null),
                }}>{h.text}</th>
              ))}
            </tr>
          </thead>
          {filteredTasks.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={headers.length} style={{ padding: '40px', textAlign: 'center', color: 'var(--faint)' }}>
                  {hasActiveFilters
                    ? 'No tasks match your filters.'
                    : emptyMessage || (isStorico
                      ? 'No closed tasks yet.'
                      : 'No tasks in this group yet. Click "+ New Task" to add one.')}
                </td>
              </tr>
            </tbody>
          ) : (
            <SortableContext items={filteredTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
              {filteredTasks.map(task => {
                const rowReadOnly = isStorico || !canWrite(task.group)
                const isExpanded = expandedIds.has(task.id) || matchesInSubtasks(task)
                return (
                  <SortableTask
                    key={task.id}
                    id={task.id}
                    showDragHandle={showDragHandle}
                    dragDisabled={!canReorder || rowReadOnly}
                    dragHint={canReorder ? 'Trascina per riordinare' : 'Togli i filtri per riordinare'}
                  >
                    {(dragHandle) => (
                      <>
                        <TaskRow
                          task={task}
                          search={search}
                          onUpdate={(field, val) => onUpdate(task.id, field, val)}
                          onDelete={() => onDelete(task.id)}
                          readOnly={rowReadOnly}
                          showDelete={!isStorico}
                          showGroup={showGroup}
                          showReperibile={showReperibile}
                          highlightReperibile={highlightReperibile}
                          expanded={isExpanded}
                          onToggleExpand={() => toggleExpand(task.id)}
                          dragHandle={dragHandle}
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
                      </>
                    )}
                  </SortableTask>
                )
              })}
            </SortableContext>
          )}
        </table>
      </DndContext>
    </div>
  )
}

// One task = one <tbody>, moved as a block. Hands the grip props to the row
// (null when the grip column is not shown at all).
function SortableTask({ id, showDragHandle, dragDisabled, dragHint, children }) {
  const {
    attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging,
  } = useSortable({ id, disabled: dragDisabled })

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    ...(isDragging ? {
      position: 'relative', zIndex: 2,
      background: 'var(--surface)', boxShadow: '0 4px 16px var(--shadow)', opacity: 0.95,
    } : null),
  }

  const dragHandle = showDragHandle
    ? { ref: setActivatorNodeRef, attributes, listeners, disabled: dragDisabled, hint: dragHint, isDragging }
    : null

  return <tbody ref={setNodeRef} style={style}>{children(dragHandle)}</tbody>
}
