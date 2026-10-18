// Excel export of the visible tasks (.xlsx, one sheet). Loaded on demand
// (dynamic import from App.jsx) so the xlsx writer is not in the main bundle.
//
// Real Excel types, not text: dates are dates (sort and filter work), the
// header row is frozen, descriptions wrap. Status cells keep the app's badge
// colors so the sheet reads like the board.
import writeExcelFile from 'write-excel-file/browser'
import S from './styles.js'
import { formatTaskCode } from './utils.js'

// Excel wants #rrggbb; styles.js has a few #rgb.
const hex6 = (c) => (/^#[0-9a-f]{3}$/i.test(c) ? '#' + [...c.slice(1)].map(x => x + x).join('') : c)

// Excel dates have no time zone and the writer converts with getTime(), i.e.
// as UTC. Build the Date from the LOCAL wall-clock fields, so Excel shows the
// same day and time as the board (a plain new Date(iso) would shift by 1–2h).
const wallClock = (d) =>
  new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()))
// "2026-10-18" → that calendar day, no time-zone arithmetic at all.
const calendarDay = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

// Sheet names: max 31 chars, none of []:*?/\
const sheetName = (s) => String(s).replace(/[[\]:*?/\\]/g, ' ').slice(0, 31).trim() || 'Task'

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'export'
}

const HEADER = { fontWeight: 'bold', backgroundColor: '#eef1f4', alignVertical: 'center', height: 20 }
const P0_RED = '#cf222e'

// `board` carries the per-board presentation: id prefix, the label of the
// reference column, and whether the reperibile column exists at all.
export async function exportTasksToXlsx(tasks, groupLabel, { prefix, referenceLabel = 'Riferimento', reperibile = true, slug = 'board' } = {}) {
  const columns = [
    { header: 'ID', width: 9 },
    { header: 'Gruppo', width: 18 },
    { header: referenceLabel, width: 28 },
    { header: 'Descrizione', width: 60 },
    { header: 'Priorità', width: 9 },
    { header: 'Stato', width: 13 },
    { header: 'Owner', width: 20 },
    ...(reperibile ? [{ header: 'Reperibile', width: 11 }] : []),
    { header: 'Scadenza', width: 12 },
    { header: 'Aggiornato', width: 17 },
  ]

  const top = { alignVertical: 'top' }
  const rows = tasks.map(t => {
    const status = S.statusColors[t.status]
    const p0 = t.priority === 0
    return [
      { ...top, type: String, value: formatTaskCode(t.number, prefix) ?? '' },
      { ...top, type: String, value: t.group || '' },
      { ...top, type: String, value: t.reference || '', wrap: true },
      { ...top, type: String, value: t.description || '', wrap: true },
      { ...top, type: String, value: `P${t.priority ?? 3}`, align: 'center', ...(p0 ? { fontWeight: 'bold', textColor: P0_RED } : null) },
      { ...top, type: String, value: t.status || '', ...(status ? { backgroundColor: hex6(status.bg), textColor: hex6(status.color) } : null) },
      { ...top, type: String, value: t.owner || '' },
      ...(reperibile ? [{ ...top, type: String, value: t.reperibile ? 'Sì' : '', align: 'center' }] : []),
      t.deadline
        ? { ...top, type: Date, value: calendarDay(t.deadline), format: 'dd/mm/yyyy' }
        : { ...top, value: null },
      t.updatedAt
        ? { ...top, type: Date, value: wallClock(new Date(t.updatedAt)), format: 'dd/mm/yyyy hh:mm' }
        : { ...top, value: null },
    ]
  })

  const data = [columns.map(c => ({ ...HEADER, value: c.header })), ...rows]

  const today = new Date().toLocaleDateString('sv-SE')   // YYYY-MM-DD, local
  const filename = `kanbanops-${slug}-${slugify(groupLabel)}-${today}.xlsx`

  await writeExcelFile(data, {
    columns: columns.map(c => ({ width: c.width })),
    sheet: sheetName(groupLabel),
    stickyRowsCount: 1,
  }, {
    fontFamily: 'Calibri',
    fontSize: 11,
  }).toFile(filename)
}
