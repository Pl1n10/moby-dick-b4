export function formatDate(iso) {
  return new Date(iso).toLocaleDateString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function formatDeadline(dateStr) {
  if (!dateStr) return null
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

export function isOverdue(deadlineStr) {
  if (!deadlineStr) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(deadlineStr + 'T00:00:00') < today
}
