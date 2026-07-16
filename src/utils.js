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

// Extracts a human-readable error from a failed API response ("Cannot close
// task: …" or "HTTP 500"). Never throws.
export async function apiErrorReason(response) {
  const data = await response.json().catch(() => null)
  return data?.error || `HTTP ${response.status}`
}

// Quoted, ellipsis-truncated snippet for undo labels/toasts. Null when empty
// so callers can supply their own fallback wording.
export function shortQuote(text, max = 30) {
  const t = (text || '').trim()
  if (!t) return null
  return `"${t.length > max ? t.slice(0, max) + '…' : t}"`
}

// CSV cell escaping: wrap in quotes only if needed (;, ", \n, \r), double inner quotes.
function csvCell(value) {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (/[;"\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'export'
}

// Build a CSV blob with `;` separator and UTF-8 BOM so Excel italian opens it
// directly as a table. Triggers a download in the browser.
export function exportTasksToCsv(tasks, groupLabel) {
  const headers = ['Gruppo', 'Riferimento', 'Descrizione', 'Priorità', 'Stato', 'Owner', 'Scadenza', 'Aggiornato']
  const rows = tasks.map(t => [
    t.group,
    t.reference,
    t.description,
    `P${t.priority ?? 3}`,
    t.status,
    t.owner,
    t.deadline ? formatDeadline(t.deadline) : '',
    t.updatedAt ? formatDate(t.updatedAt) : '',
  ])

  const lines = [headers, ...rows].map(row => row.map(csvCell).join(';'))
  const csv = '﻿' + lines.join('\r\n')

  const today = new Date().toISOString().slice(0, 10)
  const filename = `moby-dick-${slugify(groupLabel)}-${today}.csv`

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
