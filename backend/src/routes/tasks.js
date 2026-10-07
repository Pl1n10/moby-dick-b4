import { Router } from 'express'
import pool from '../db.js'
import { requireBoardAdmin, canWrite, isPillar, boardFeature } from '../auth.js'
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
    number: row.number != null ? Number(row.number) : null,   // shown as MD001…
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

// Mounted at /api/t/:slug/tasks, after loadBoard: req.tenant is the board,
// req.boardCtx the caller's role on it. EVERY query below filters on
// tenant_id — a task id from another board must behave as "not found".

// Loads a task of the current board, or null.
async function loadTask(tenantId, id) {
  const { rows: [task] } = await pool.query(
    'SELECT * FROM tasks WHERE id = $1 AND tenant_id = $2',
    [id, tenantId],
  )
  return task || null
}

// ── Routes ──────────────────────────────────────────────

// GET /api/t/:slug/tasks — the board's tasks, sorted by updated_at desc.
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
      WHERE t.tenant_id = $1
      ORDER BY t.updated_at DESC
    `, [req.tenant.id])
    res.json(rows.map(mapTaskToClient))
  } catch (err) {
    console.error('GET /api/tasks error:', err.message)
    res.status(500).json({ error: 'Failed to fetch tasks' })
  }
})

// POST /api/t/:slug/tasks/reset — wipe this board's tasks and recurring
// templates (subtasks follow by cascade). Board-admin only: nuclear button,
// never delegated to per-section operators. Other boards are untouched — this
// used to be a TRUNCATE.
router.post('/reset', requireBoardAdmin, async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('DELETE FROM tasks WHERE tenant_id = $1', [req.tenant.id])
    await client.query('DELETE FROM recurring_templates WHERE tenant_id = $1', [req.tenant.id])
    await client.query('COMMIT')
    res.json([])
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('POST /api/tasks/reset error:', err.message)
    res.status(500).json({ error: 'Failed to reset' })
  } finally {
    client.release()
  }
})

// POST /api/t/:slug/tasks — create a task. Authorized if the caller can
// write in the target section (board admin everywhere, operator on listed
// sections). The section must exist on this board.
router.post('/', async (req, res) => {
  try {
    const { id, group, reference, description, status, owner, priority, reperibile, deadline, number } = req.body
    if (!canWrite(req.boardCtx, group)) {
      return res.status(403).json({ error: `Write access denied for group: ${group}` })
    }
    if (!(await isPillar(req.tenant.id, group))) {
      return res.status(400).json({ error: `Unknown section: ${group}` })
    }
    const prio = isValidPriority(priority) ? priority : 3   // default medium
    // Undo-restore sends the template link back; accept it only if the
    // template belongs to this board, never link across boards.
    let recurringTemplateId = null
    if (req.body.recurringTemplateId) {
      const { rows } = await pool.query(
        'SELECT 1 FROM recurring_templates WHERE id = $1 AND tenant_id = $2',
        [req.body.recurringTemplateId, req.tenant.id],
      )
      if (rows.length > 0) recurringTemplateId = req.body.recurringTemplateId
    }
    // `number` is sent only by the undo-restore of a deleted task, so the task
    // comes back as the same MDxxx. Accepted only up to the sequence's last
    // value: a number the sequence has not reached yet would collide with a
    // future task. Anything else → the column DEFAULT assigns the next one.
    const restoredNumber = Number.isInteger(number) && number > 0 ? number : null
    const { rows } = await pool.query(
      // COALESCE, not a bare $1: node-postgres sends `undefined` as an
      // explicit NULL, which OVERRIDES the column DEFAULT instead of falling
      // back to it — an id-less POST used to fail the NOT NULL constraint.
      // The client normally sends its own UUID, so this only bites API callers.
      `INSERT INTO tasks (id, tenant_id, group_name, reference, description, status, owner, priority, reperibile, deadline, recurring_template_id, updated_at, number)
       VALUES (COALESCE($1::uuid, gen_random_uuid()), $11, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(),
               -- next value the sequence will hand out (is_called=false right
               -- after the migration's setval: last_value not issued yet)
               CASE WHEN $12::int < (SELECT CASE WHEN is_called THEN last_value + 1 ELSE last_value END
                                     FROM task_number_seq) THEN $12::int
                    ELSE nextval('task_number_seq') END)
       RETURNING *`,
      [
        id || null,               // absent → DB generates via gen_random_uuid()
        group,
        reference || '',
        description || '',
        status || 'New',
        owner,
        prio,
        // preserved by undo-restore; always false on boards without the feature
        reperibile === true && boardFeature(req.tenant, 'reperibile'),
        deadline || null,
        recurringTemplateId,      // set by undo-restore to keep the 🔄 badge
        req.tenant.id,
        restoredNumber,
      ]
    )
    res.status(201).json(mapTaskToClient(rows[0]))

    // Fire-and-forget: notify the owner when a task is created already assigned.
    // skipNotify: set by the client-side undo when restoring a deleted task —
    // the owner was already notified at the original assignment.
    if (!req.body.skipNotify) {
      notifyAssignment({ task: rows[0], tenant: req.tenant, event: 'task.assigned', assigner: req.user })
    }
  } catch (err) {
    // The restored number was taken again in the meantime (two undos racing).
    if (err.code === '23505' && err.constraint === 'tasks_number_unique') {
      return res.status(409).json({ error: 'Task number already in use' })
    }
    console.error('POST /api/tasks error:', err.message)
    res.status(500).json({ error: 'Failed to create task' })
  }
})

// PATCH /api/t/:slug/tasks/:id — update single field.
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

    const existing = await loadTask(req.tenant.id, id)
    if (!existing) return res.status(404).json({ error: 'Task not found' })

    if (!canWrite(req.boardCtx, existing.group_name)) {
      return res.status(403).json({ error: `Write access denied for group: ${existing.group_name}` })
    }
    if (field === 'group' && !canWrite(req.boardCtx, value)) {
      return res.status(403).json({ error: `Write access denied for target group: ${value}` })
    }
    if (field === 'group' && !(await isPillar(req.tenant.id, value))) {
      return res.status(400).json({ error: `Unknown section: ${value}` })
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

    if (field === 'reperibile' && !boardFeature(req.tenant, 'reperibile')) {
      return res.status(400).json({ error: 'This board has no on-call (reperibile) feature' })
    }
    if (field === 'reperibile' && typeof value !== 'boolean') {
      return res.status(400).json({ error: 'reperibile must be a boolean' })
    }

    const column = FIELD_TO_COLUMN[field]
    const dbValue = field === 'deadline' && value === '' ? null : value

    const { rows } = NO_TOUCH_FIELDS.has(field)
      ? await pool.query(
          `UPDATE tasks SET ${column} = $2 WHERE id = $1 AND tenant_id = $3 RETURNING *`,
          [id, dbValue, req.tenant.id],
        )
      : await pool.query(
          `UPDATE tasks SET ${column} = $2, updated_at = $3 WHERE id = $1 AND tenant_id = $4 RETURNING *`,
          [id, dbValue, new Date().toISOString(), req.tenant.id],
        )
    res.json(mapTaskToClient(rows[0]))

    // Fire-and-forget: notify on (re)assignment when the owner field changed to
    // a new, non-empty value. 'task.assigned' if the task had no owner before.
    // skipNotify: set by the client-side undo of an owner change — the previous
    // owner is being restored, not newly assigned, so no email.
    if (field === 'owner' && value && value !== existing.owner && !req.body.skipNotify) {
      notifyAssignment({
        task: rows[0],
        tenant: req.tenant,
        event: existing.owner ? 'task.reassigned' : 'task.assigned',
        assigner: req.user,
      })
    }
  } catch (err) {
    console.error('PATCH /api/tasks error:', err.message)
    res.status(500).json({ error: 'Failed to update task' })
  }
})

// DELETE /api/t/:slug/tasks/:id — caller must be able to write the task's group.
router.delete('/:id', async (req, res) => {
  try {
    const existing = await loadTask(req.tenant.id, req.params.id)
    if (!existing) return res.status(404).json({ error: 'Task not found' })
    if (!canWrite(req.boardCtx, existing.group_name)) {
      return res.status(403).json({ error: `Write access denied for group: ${existing.group_name}` })
    }

    await pool.query('DELETE FROM tasks WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenant.id])
    res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/tasks error:', err.message)
    res.status(500).json({ error: 'Failed to delete task' })
  }
})

export default router
