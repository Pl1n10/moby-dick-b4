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
  deadline: 'deadline',
  group: 'group_name',
}

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

// POST /api/tasks/reset — wipe all tasks and recurring templates.
// No re-seed: production starts empty, real tasks only.
router.post('/reset', requireAdmin, async (req, res) => {
  try {
    await pool.query('TRUNCATE tasks, recurring_templates CASCADE')
    res.json([])
  } catch (err) {
    console.error('POST /api/tasks/reset error:', err.message)
    res.status(500).json({ error: 'Failed to reset' })
  }
})

// POST /api/tasks — create a task
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { id, group, reference, description, status, owner, deadline } = req.body
    const { rows } = await pool.query(
      `INSERT INTO tasks (id, group_name, reference, description, status, owner, deadline, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
      [
        id || undefined,          // let DB generate if null
        group,
        reference || '',
        description || '',
        status || 'New',
        owner,
        deadline || null,
      ]
    )
    res.status(201).json(mapTaskToClient(rows[0]))
  } catch (err) {
    console.error('POST /api/tasks error:', err.message)
    res.status(500).json({ error: 'Failed to create task' })
  }
})

// PATCH /api/tasks/:id — update single field
router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { field, value } = req.body

    if (!FIELD_TO_COLUMN[field]) {
      return res.status(400).json({ error: `Invalid field: ${field}` })
    }

    const { rows: [existing] } = await pool.query('SELECT * FROM tasks WHERE id = $1', [id])
    if (!existing) return res.status(404).json({ error: 'Task not found' })

    const column = FIELD_TO_COLUMN[field]
    const dbValue = field === 'deadline' && value === '' ? null : value
    const now = new Date().toISOString()

    const { rows } = await pool.query(
      `UPDATE tasks SET ${column} = $2, updated_at = $3 WHERE id = $1 RETURNING *`,
      [id, dbValue, now]
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
