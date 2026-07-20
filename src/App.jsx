import { useState, useEffect, useRef, useCallback } from 'react'
import { GROUPS } from './data.js'
import { exportTasksToCsv } from './utils.js'
import useTasks from './hooks/useTasks.js'
import useRecurring from './hooks/useRecurring.js'
import useOnCall from './hooks/useOnCall.js'
import { useUndoState, undoLast } from './undo/undoStore.js'
import { useUserInfo, useCanWrite } from './auth/UserInfoProvider.jsx'
import { useOwners } from './auth/OwnersProvider.jsx'
import Header from './components/Header.jsx'
import Footer from './components/Footer.jsx'
import TabNav from './components/TabNav.jsx'
import Toolbar from './components/Toolbar.jsx'
import TaskTable from './components/TaskTable.jsx'
import RecurringModal from './components/RecurringModal.jsx'
import OnCallBar from './components/OnCallBar.jsx'

const ACTIVE_GROUP_KEY = 'kanbanops:activeGroup'
const isValidGroup = (v) => v === '__storico__' || v === '__reperibile__' || GROUPS.includes(v)

export default function App() {
  const [activeGroup, setActiveGroup] = useState(() => {
    const saved = localStorage.getItem(ACTIVE_GROUP_KEY)
    return isValidGroup(saved) ? saved : GROUPS[0]
  })

  useEffect(() => {
    localStorage.setItem(ACTIVE_GROUP_KEY, activeGroup)
  }, [activeGroup])
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterOwner, setFilterOwner] = useState('')
  const [filterGroup, setFilterGroup] = useState('')

  const isStorico = activeGroup === '__storico__'
  // Cross-pillar view of the tasks flagged "info reperibile". Not a copy of
  // them: same task rows, filtered — see CLAUDE.md "Info Reperibile".
  const isReperibile = activeGroup === '__reperibile__'
  const isCrossPillar = isStorico || isReperibile

  const clearFilters = () => { setSearch(''); setFilterStatus(''); setFilterOwner(''); setFilterGroup('') }

  const { tasks, setTasks, updateTask, handleAdd, handleDelete, updateSubtaskCounters, refetchTasks } = useTasks()
  const { recurring, setRecurring, showRecurringModal, setShowRecurringModal } = useRecurring(setTasks)
  const { onCall, loading: onCallLoading, setOnCallPerson } = useOnCall()
  const userInfo = useUserInfo()
  const owners = useOwners()
  const canWrite = useCanWrite()
  const defaultOwner = userInfo.owner || owners[0] || ''
  const canAdd = !isCrossPillar && canWrite(activeGroup)

  // ── Per-user undo ───────────────────────────────────────
  // Pure read-only users never accumulate undoable actions: hide the button.
  const canWriteAnything = userInfo.role === 'admin'
    || (Array.isArray(userInfo.operatorGroups) && userInfo.operatorGroups.length > 0)
  const undoState = useUndoState()
  const [undoToast, setUndoToast] = useState(null)
  const toastTimer = useRef(null)

  const handleUndo = useCallback(async () => {
    const result = await undoLast()
    if (!result) return
    if (result.ok) {
      // Undo mutates server state at API level: resync the board.
      refetchTasks(true)
      setUndoToast({ kind: 'ok', msg: `Annullato: ${result.label}` })
    } else {
      setUndoToast({ kind: 'warn', msg: `Undo saltato (${result.label}): ${result.reason}` })
    }
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setUndoToast(null), 4000)
  }, [refetchTasks])

  // Ctrl+Z / Cmd+Z, only when not typing: inside text fields the browser's
  // native text undo must keep working. Checkbox/radio/button inputs have no
  // native undo and keep focus after a click — those must NOT swallow Ctrl+Z
  // (unchecking a ticket by mistake is exactly the main undo use case).
  useEffect(() => {
    const NON_TEXT_INPUT_TYPES = ['checkbox', 'radio', 'button', 'submit', 'range']
    const onKeyDown = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return
      if (e.key.toLowerCase() !== 'z') return
      const t = e.target
      if (t && (t.tagName === 'TEXTAREA' || t.isContentEditable
        || (t.tagName === 'INPUT' && !NON_TEXT_INPUT_TYPES.includes(t.type)))) return
      e.preventDefault()
      handleUndo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleUndo])

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  const filteredTasks = tasks
    .filter(t => {
      if (isStorico) {
        if (t.status !== 'Closed') return false
        if (filterGroup && t.group !== filterGroup) return false
      } else if (isReperibile) {
        if (!t.reperibile) return false
        if (t.status === 'Closed') return false      // closed ones live in Storico
        if (filterGroup && t.group !== filterGroup) return false
      } else {
        if (t.group !== activeGroup) return false
        if (t.status === 'Closed') return false
      }
      return true
    })
    .filter(t => {
      if (search) {
        const q = search.toLowerCase()
        if (!t.reference.toLowerCase().includes(q)
          && !t.description.toLowerCase().includes(q)
          && !(t.subtasksText || '').toLowerCase().includes(q)) return false
      }
      if (!isStorico && filterStatus && t.status !== filterStatus) return false
      if (filterOwner && t.owner !== filterOwner) return false
      return true
    })
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))

  const totalGroupTasks = isStorico
    ? tasks.filter(t => t.status === 'Closed').length
    : isReperibile
      ? tasks.filter(t => t.reperibile && t.status !== 'Closed').length
      : tasks.filter(t => t.group === activeGroup && t.status !== 'Closed').length
  const hasActiveFilters = search || filterStatus || filterOwner || (isCrossPillar && filterGroup)

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', color: '#e6edf3' }}>
      <Header />

      <TabNav tasks={tasks} activeGroup={activeGroup} onChangeGroup={setActiveGroup} />

      <main style={{ padding: '24px 32px' }}>
        {isReperibile && (
          <OnCallBar onCall={onCall} loading={onCallLoading} onChange={setOnCallPerson} />
        )}

        <Toolbar
          isStorico={isStorico}
          showGroupFilter={isCrossPillar}
          showRecurring={!isCrossPillar}
          search={search} onSearchChange={setSearch}
          filterGroup={filterGroup} onFilterGroupChange={setFilterGroup}
          filterStatus={filterStatus} onFilterStatusChange={setFilterStatus}
          filterOwner={filterOwner} onFilterOwnerChange={setFilterOwner}
          hasActiveFilters={hasActiveFilters} onClearFilters={clearFilters}
          filteredCount={filteredTasks.length} totalCount={totalGroupTasks}
          recurring={recurring} onOpenRecurring={() => setShowRecurringModal(true)}
          onAdd={() => handleAdd(activeGroup, clearFilters, defaultOwner)}
          onExport={() => exportTasksToCsv(
            filteredTasks,
            isStorico ? 'storico' : isReperibile ? 'reperibile' : activeGroup,
          )}
          canAdd={canAdd}
          showUndo={canWriteAnything}
          canUndo={undoState.canUndo}
          undoLabel={undoState.nextLabel}
          onUndo={handleUndo}
        />

        <TaskTable
          filteredTasks={filteredTasks}
          canWrite={canWrite}
          isStorico={isStorico}
          showGroup={isCrossPillar}
          // Inside the Info Reperibile tab every row is flagged: the amber bar
          // and 📟 badge would mark everything, i.e. nothing.
          highlightReperibile={!isReperibile}
          emptyMessage={isReperibile
            ? 'Nessun task marcato "info reperibile". Spunta la casella Rep. su un task per farlo comparire qui.'
            : undefined}
          hasActiveFilters={hasActiveFilters}
          search={search}
          onUpdate={updateTask}
          onDelete={handleDelete}
          onSubtaskCountChange={updateSubtaskCounters}
        />
      </main>

      <Footer />

      {undoToast && (
        <div style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 1000,
          maxWidth: '380px', padding: '10px 14px',
          background: '#161b22', borderRadius: '8px',
          border: `1px solid ${undoToast.kind === 'warn' ? '#d29922' : '#2ea043'}`,
          color: '#e6edf3', fontSize: '13px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        }}>
          {undoToast.kind === 'warn' ? '⚠ ' : '↶ '}{undoToast.msg}
        </div>
      )}

      {showRecurringModal && (
        <RecurringModal
          templates={recurring}
          onSave={setRecurring}
          onClose={() => setShowRecurringModal(false)}
        />
      )}
    </div>
  )
}
