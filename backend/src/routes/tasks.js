import { Router } from 'express'
import pool from '../db.js'
import { requireAdmin } from '../auth.js'

const router = Router()

// ── Helpers ─────────────────────────────────────────────

function formatDate(d) {
  if (!d) return null
  if (d instanceof Date) return d.toISOString().slice(0, 10)
  return String(d).slice(0, 10)
}

function mapTaskToClient(row) {
  return {
    id: row.id,
    group: row.group_name,
    reference: row.reference,
    description: row.description,
    status: row.status,
    owner: row.owner,
    waiting: row.waiting,
    deadline: formatDate(row.deadline),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    recurringTemplateId: row.recurring_template_id || undefined,
  }
}

// Fields the client is allowed to update (whitelist prevents SQL injection)
const FIELD_TO_COLUMN = {
  reference: 'reference',
  description: 'description',
  status: 'status',
  owner: 'owner',
  waiting: 'waiting',
  deadline: 'deadline',
  group: 'group_name',
}

// Seed SQL for reset (same data as 001_init.sql)
const SEED_SQL = `
INSERT INTO tasks (id, group_name, reference, description, status, owner, waiting, deadline, updated_at)
VALUES
  ('a1b2c3d4-0001-4000-8000-000000000001', 'Commvault',
   'INC00412301', 'Backup job failing on SQL Server prod cluster — timeout after 4h',
   'In Progress', 'Bob', false, NULL, '2026-02-07T09:30:00Z'),
  ('a1b2c3d4-0002-4000-8000-000000000002', 'Commvault',
   'Email: RE: License renewal Q1', 'Commvault license expiring March 15 — need PO approval from client',
   'Waiting', 'Erica', true, '2026-03-15', '2026-02-06T14:00:00Z'),
  ('a1b2c3d4-0003-4000-8000-000000000003', 'Cohesity',
   'INC00398877', 'Cohesity DataProtect node offline after firmware update',
   'New', 'Walker', false, NULL, '2026-02-08T11:15:00Z'),
  ('a1b2c3d4-0004-4000-8000-000000000004', 'Cohesity',
   'Email: Cohesity cluster expansion', 'Client requested 3 additional nodes — sizing document needed',
   'In Progress', 'Erica', false, NULL, '2026-02-05T16:45:00Z'),
  ('a1b2c3d4-0005-4000-8000-000000000005', 'NBU - Banche Estere',
   'INC00420100', 'NetBackup master server certificate expired — all policies suspended',
   'In Progress', 'Bob', false, NULL, '2026-02-09T08:00:00Z'),
  ('a1b2c3d4-0006-4000-8000-000000000006', 'Data Domain',
   'Email: DD replication lag alert', 'Data Domain replication to DR site lagging >24h — bandwidth issue suspected',
   'Waiting', 'Walker', true, NULL, '2026-02-08T17:30:00Z'),
  ('a1b2c3d4-0007-4000-8000-000000000007', 'Commvault',
   'INC00408234', 'CommServe gridstore offline dopo patch — ripristinato da backup config',
   'Resolved', 'Walker', false, NULL, '2026-01-30T15:00:00Z'),
  ('a1b2c3d4-0008-4000-8000-000000000008', 'Cohesity',
   'Email: Report mensile gennaio', 'Report capacity + jobs gennaio inviato al cliente — archiviato',
   'Closed', 'Bob', false, NULL, '2026-01-31T16:00:00Z'),
  ('a1b2c3d4-0009-4000-8000-000000000009', 'Data Domain',
   'INC00425667', 'DD9300 allarme ventola — RMA sostituzione hardware programmata',
   'New', 'Erica', false, '2026-05-20', '2026-02-10T10:00:00Z'),
  ('a1b2c3d4-0010-4000-8000-000000000010', 'Data Domain',
   'Email: Aumento spazio Mtree banking', 'Cliente richiede +20TB su mtree /data/banking — design sizing in corso',
   'In Progress', 'Bob', false, '2026-06-30', '2026-02-09T15:00:00Z'),
  ('a1b2c3d4-0011-4000-8000-000000000011', 'NBU - Banche Estere',
   'INC00423901', 'Restore job stuck su client RHEL7 — case vendor aperto, in attesa patch',
   'Waiting', 'Erica', true, NULL, '2026-02-10T14:00:00Z'),
  ('a1b2c3d4-0012-4000-8000-000000000012', 'NBU - Banche Estere',
   'Email: Policy refresh trimestrale', 'Refresh policy SLP + verifica retention completato — report inviato',
   'Resolved', 'Walker', false, NULL, '2026-02-04T12:00:00Z')
`

// ── Routes ──────────────────────────────────────────────

// GET /api/tasks — all tasks, sorted by updated_at desc
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tasks ORDER BY updated_at DESC')
    res.json(rows.map(mapTaskToClient))
  } catch (err) {
    console.error('GET /api/tasks error:', err.message)
    res.status(500).json({ error: 'Failed to fetch tasks' })
  }
})

// POST /api/tasks/reset — wipe everything, re-seed (before /:id routes)
router.post('/reset', requireAdmin, async (req, res) => {
  try {
    await pool.query('TRUNCATE tasks, recurring_templates CASCADE')
    await pool.query(SEED_SQL)
    const { rows } = await pool.query('SELECT * FROM tasks ORDER BY updated_at DESC')
    res.json(rows.map(mapTaskToClient))
  } catch (err) {
    console.error('POST /api/tasks/reset error:', err.message)
    res.status(500).json({ error: 'Failed to reset' })
  }
})

// POST /api/tasks — create a task
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { id, group, reference, description, status, owner, waiting, deadline } = req.body
    const { rows } = await pool.query(
      `INSERT INTO tasks (id, group_name, reference, description, status, owner, waiting, deadline, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING *`,
      [
        id || undefined,          // let DB generate if null
        group,
        reference || '',
        description || '',
        status || 'New',
        owner,
        waiting ?? false,
        deadline || null,
      ]
    )
    res.status(201).json(mapTaskToClient(rows[0]))
  } catch (err) {
    console.error('POST /api/tasks error:', err.message)
    res.status(500).json({ error: 'Failed to create task' })
  }
})

// PATCH /api/tasks/:id — update single field (with waiting↔status sync)
router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { field, value } = req.body

    // Validate field
    if (!FIELD_TO_COLUMN[field]) {
      return res.status(400).json({ error: `Invalid field: ${field}` })
    }

    // Get current task for sync logic
    const { rows: [existing] } = await pool.query('SELECT * FROM tasks WHERE id = $1', [id])
    if (!existing) return res.status(404).json({ error: 'Task not found' })

    // Build updates map (column → value)
    const updates = {}
    updates[FIELD_TO_COLUMN[field]] = field === 'deadline' && value === '' ? null : value

    // Waiting ↔ Status sync (mirrors frontend logic exactly)
    if (field === 'status' && value === 'Waiting')  updates.waiting = true
    if (field === 'status' && value !== 'Waiting')  updates.waiting = false
    if (field === 'waiting' && !value && existing.status === 'Waiting') updates.status = 'In Progress'
    if (field === 'waiting' && value)               updates.status = 'Waiting'

    // Only update timestamp for non-waiting fields
    if (field !== 'waiting') updates.updated_at = new Date().toISOString()

    // Build parameterized UPDATE
    const cols = Object.keys(updates)
    const vals = Object.values(updates)
    const setClauses = cols.map((c, i) => `${c} = $${i + 2}`).join(', ')

    const { rows } = await pool.query(
      `UPDATE tasks SET ${setClauses} WHERE id = $1 RETURNING *`,
      [id, ...vals]
    )
    res.json(mapTaskToClient(rows[0]))
  } catch (err) {
    console.error('PATCH /api/tasks error:', err.message)
    res.status(500).json({ error: 'Failed to update task' })
  }
})

// DELETE /api/tasks/:id
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM tasks WHERE id = $1', [req.params.id])
    if (rowCount === 0) return res.status(404).json({ error: 'Task not found' })
    res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/tasks error:', err.message)
    res.status(500).json({ error: 'Failed to delete task' })
  }
})

export default router
