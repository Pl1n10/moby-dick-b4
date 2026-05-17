import { Router } from 'express'
import pool from '../db.js'
import { requireAdmin } from '../auth.js'
import subtasksRouter from './subtasks.js'

const router = Router()

// Subtasks live under each task; nested router shares the same auth chain.
router.use('/:taskId/subtasks', subtasksRouter)

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
    // Aggregated subtask counters when present (set by GET list query).
    subtasksTotal: row.subtasks_total != null ? Number(row.subtasks_total) : 0,
    subtasksOpen:  row.subtasks_open  != null ? Number(row.subtasks_open)  : 0,
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

// GET /api/tasks — all tasks, sorted by updated_at desc.
// Joins aggregated subtask counts so the client can render the "3/5" badge
// without N extra fetches.
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT t.*,
             COALESCE(s.total, 0) AS subtasks_total,
             COALESCE(s.open,  0) AS subtasks_open
      FROM tasks t
      LEFT JOIN (
        SELECT task_id,
               COUNT(*)                       AS total,
               COUNT(*) FILTER (WHERE NOT done) AS open
        FROM subtasks
        GROUP BY task_id
      ) s ON s.task_id = t.id
      ORDER BY t.updated_at DESC
    `)
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

// PATCH /api/tasks/:id — update single field.
// Hard constraint: can't move a task to 'Closed' while it has open subtasks.
router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { field, value } = req.body

    if (!FIELD_TO_COLUMN[field]) {
      return res.status(400).json({ error: `Invalid field: ${field}` })
    }

    const { rows: [existing] } = await pool.query('SELECT * FROM tasks WHERE id = $1', [id])
    if (!existing) return res.status(404).json({ error: 'Task not found' })

    if (field === 'status' && value === 'Closed') {
      const { rows: [{ open }] } = await pool.query(
        'SELECT COUNT(*)::int AS open FROM subtasks WHERE task_id = $1 AND NOT done',
        [id],
      )
      if (open > 0) {
        return res.status(400).json({
          error: `Cannot close task: ${open} subtask${open === 1 ? '' : 's'} still open`,
        })
      }
    }

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
