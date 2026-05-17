import { useState } from 'react'
import { GROUPS } from './data.js'
import { exportTasksToCsv } from './utils.js'
import useTasks from './hooks/useTasks.js'
import useRecurring from './hooks/useRecurring.js'
import Header from './components/Header.jsx'
import TabNav from './components/TabNav.jsx'
import Toolbar from './components/Toolbar.jsx'
import TaskTable from './components/TaskTable.jsx'
import RecurringModal from './components/RecurringModal.jsx'

export default function App() {
  const [activeGroup, setActiveGroup] = useState(GROUPS[0])
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterOwner, setFilterOwner] = useState('')
  const [filterGroup, setFilterGroup] = useState('')

  const isStorico = activeGroup === '__storico__'

  const clearFilters = () => { setSearch(''); setFilterStatus(''); setFilterOwner(''); setFilterGroup('') }

  const { tasks, setTasks, updateTask, handleAdd, handleDelete, handleReset, updateSubtaskCounters } = useTasks()
  const { recurring, setRecurring, showRecurringModal, setShowRecurringModal, clearRecurring } = useRecurring(setTasks)

  const filteredTasks = tasks
    .filter(t => {
      if (isStorico) {
        if (t.status !== 'Closed') return false
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
        if (!t.reference.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) return false
      }
      if (!isStorico && filterStatus && t.status !== filterStatus) return false
      if (filterOwner && t.owner !== filterOwner) return false
      return true
    })
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))

  const totalGroupTasks = isStorico
    ? tasks.filter(t => t.status === 'Closed').length
    : tasks.filter(t => t.group === activeGroup && t.status !== 'Closed').length
  const hasActiveFilters = search || filterStatus || filterOwner || (isStorico && filterGroup)

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', color: '#e6edf3' }}>
      <Header onReset={() => handleReset(clearRecurring, clearFilters)} />

      <TabNav tasks={tasks} activeGroup={activeGroup} onChangeGroup={setActiveGroup} />

      <main style={{ padding: '24px 32px' }}>
        <Toolbar
          isStorico={isStorico}
          search={search} onSearchChange={setSearch}
          filterGroup={filterGroup} onFilterGroupChange={setFilterGroup}
          filterStatus={filterStatus} onFilterStatusChange={setFilterStatus}
          filterOwner={filterOwner} onFilterOwnerChange={setFilterOwner}
          hasActiveFilters={hasActiveFilters} onClearFilters={clearFilters}
          filteredCount={filteredTasks.length} totalCount={totalGroupTasks}
          recurring={recurring} onOpenRecurring={() => setShowRecurringModal(true)}
          onAdd={() => handleAdd(activeGroup, clearFilters)}
          onExport={() => exportTasksToCsv(filteredTasks, isStorico ? 'storico' : activeGroup)}
        />

        <TaskTable
          filteredTasks={filteredTasks}
          isStorico={isStorico}
          hasActiveFilters={hasActiveFilters}
          search={search}
          onUpdate={updateTask}
          onDelete={handleDelete}
          onSubtaskCountChange={updateSubtaskCounters}
        />
      </main>

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
