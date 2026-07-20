import { Router } from 'express'
import pool from '../db.js'
import { requireAdmin, requireWriteAccess, canWrite } from '../auth.js'
import { notifyAssignment } from '../notify.js'
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
    priority: row.priority != null ? Number(row.priority) : 3,
    reperibile: row.reperibile === true,
    deadline: formatDate(row.deadline),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    recurringTemplateId: row.recurring_template_id || undefined,
    // Aggregated subtask counters when present (set by GET list query).
    subtasksTotal: row.subtasks_total != null ? Number(row.subtasks_total) : 0,
    subtasksOpen:  row.subtasks_open  != null ? Number(row.subtasks_open)  : 0,
    // Concatenated subtask descriptions, only present on the GET list query,
    // so the client search can match text inside the checklist. Omitted on
    // single-row POST/PATCH responses (which the client doesn't merge back).
    subtasksText: row.subtasks_text != null ? String(row.subtasks_text) : '',
  }
}

// Fields the client is allowed to update (whitelist prevents SQL injection)
const FIELD_TO_COLUMN = {
  reference: 'reference',
  description: 'description',
  status: 'status',
  owner: 'owner',
  priority: 'priority',
  reperibile: 'reperibile',
  deadline: 'deadline',
  group: 'group_name',
}

// Flag-only fields: toggling them must NOT bump updated_at. Sorting is by
// updated_at desc everywhere, so ticking a checkbox would otherwise teleport
// the row to the top of the board — same rationale the old `waiting` flag had.
const NO_TOUCH_FIELDS = new Set(['reperibile'])

// Priority is the only numeric, range-constrained field. Validate here so a
// bad client value returns 400 instead of tripping the DB CHECK as a 500.
function isValidPriority(v) {
  return Number.isInteger(v) && v >= 0 && v <= 5
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
             COALESCE(s.open,  0) AS subtasks_open,
             COALESCE(s.text, '') AS subtasks_text
      FROM tasks t
      LEFT JOIN (
        SELECT task_id,
               COUNT(*)                       AS total,
               COUNT(*) FILTER (WHERE NOT done) AS open,
               STRING_AGG(description, ' ')     AS text
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
// Admin-only: nuclear button, never delegated to per-pillar operators.
router.post('/reset', requireAdmin, async (req, res) => {
  try {
    await pool.query('TRUNCATE tasks, recurring_templates CASCADE')
    res.json([])
  } catch (err) {
    console.error('POST /api/tasks/reset error:', err.message)
    res.status(500).json({ error: 'Failed to reset' })
  }
})

// POST /api/tasks — create a task. Authorized if the caller can write in
// the target pillar (admin everywhere, operator on listed groups).
router.post('/', requireWriteAccess(req => req.body.group), async (req, res) => {
  try {
    const { id, group, reference, description, status, owner, priority, reperibile, deadline, recurringTemplateId } = req.body
    const prio = isValidPriority(priority) ? priority : 3   // default medium
    const { rows } = await pool.query(
      `INSERT INTO tasks (id, group_name, reference, description, status, owner, priority, reperibile, deadline, recurring_template_id, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
       RETURNING *`,
      [
        id || undefined,          // let DB generate if null
        group,
        reference || '',
        description || '',
        status || 'New',
        owner,
        prio,
        reperibile === true,      // preserved by undo-restore of a deleted task
        deadline || null,
        recurringTemplateId || null,   // set by undo-restore to keep the 🔄 badge
      ]
    )
    res.status(201).json(mapTaskToClient(rows[0]))

    // Fire-and-forget: notify the owner when a task is created already assigned.
    // skipNotify: set by the client-side undo when restoring a deleted task —
    // the owner was already notified at the original assignment.
    if (!req.body.skipNotify) {
      notifyAssignment({ task: rows[0], event: 'task.assigned', assigner: req.user })
    }
  } catch (err) {
    console.error('POST /api/tasks error:', err.message)
    res.status(500).json({ error: 'Failed to create task' })
  }
})

// PATCH /api/tasks/:id — update single field.
// Authorization: caller must be able to write the task's CURRENT group; if
// the field being changed is 'group', they must also be able to write the
// TARGET group (prevents an operator from yanking a task into a pillar they
// don't own and locking themselves out of it, or vice versa).
// Hard constraint: can't move a task to 'Closed' while it has open subtasks.
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { field, value } = req.body

    if (!FIELD_TO_COLUMN[field]) {
      return res.status(400).json({ error: `Invalid field: ${field}` })
    }

    const { rows: [existing] } = await pool.query('SELECT * FROM tasks WHERE id = $1', [id])
    if (!existing) return res.status(404).json({ error: 'Task not found' })

    if (!canWrite(req.userCtx, existing.group_name)) {
      return res.status(403).json({ error: `Write access denied for group: ${existing.group_name}` })
    }
    if (field === 'group' && !canWrite(req.userCtx, value)) {
      return res.status(403).json({ error: `Write access denied for target group: ${value}` })
    }

    if (field === 'priority' && !isValidPriority(value)) {
      return res.status(400).json({ error: 'Priority must be an integer between 0 and 5' })
    }

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

    if (field === 'reperibile' && typeof value !== 'boolean') {
      return res.status(400).json({ error: 'reperibile must be a boolean' })
    }

    const column = FIELD_TO_COLUMN[field]
    const dbValue = field === 'deadline' && value === '' ? null : value

    const { rows } = NO_TOUCH_FIELDS.has(field)
      ? await pool.query(
          `UPDATE tasks SET ${column} = $2 WHERE id = $1 RETURNING *`,
          [id, dbValue],
        )
      : await pool.query(
          `UPDATE tasks SET ${column} = $2, updated_at = $3 WHERE id = $1 RETURNING *`,
          [id, dbValue, new Date().toISOString()],
        )
    res.json(mapTaskToClient(rows[0]))

    // Fire-and-forget: notify on (re)assignment when the owner field changed to
    // a new, non-empty value. 'task.assigned' if the task had no owner before.
    // skipNotify: set by the client-side undo of an owner change — the previous
    // owner is being restored, not newly assigned, so no email.
    if (field === 'owner' && value && value !== existing.owner && !req.body.skipNotify) {
      notifyAssignment({
        task: rows[0],
        event: existing.owner ? 'task.reassigned' : 'task.assigned',
        assigner: req.user,
      })
    }
  } catch (err) {
    console.error('PATCH /api/tasks error:', err.message)
    res.status(500).json({ error: 'Failed to update task' })
  }
})

// DELETE /api/tasks/:id — caller must be able to write the task's group.
router.delete('/:id', async (req, res) => {
  try {
    const { rows: [existing] } = await pool.query('SELECT group_name FROM tasks WHERE id = $1', [req.params.id])
    if (!existing) return res.status(404).json({ error: 'Task not found' })
    if (!canWrite(req.userCtx, existing.group_name)) {
      return res.status(403).json({ error: `Write access denied for group: ${existing.group_name}` })
    }

    await pool.query('DELETE FROM tasks WHERE id = $1', [req.params.id])
    res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/tasks error:', err.message)
    res.status(500).json({ error: 'Failed to delete task' })
  }
})

export default router
