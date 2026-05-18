import { Router } from 'express'
import pool from '../db.js'
import { canWrite, AUTH_ENABLED } from '../auth.js'

// Mounted at /api/tasks/:taskId/subtasks (see index.js / tasks router).
// Reads are open to any authenticated user; mutations require write access
// on the PARENT task's pillar group (inherited scope).
const router = Router({ mergeParams: true })

function mapSubtaskToClient(row) {
  return {
    id: row.id,
    taskId: row.task_id,
    description: row.description,
    done: row.done,
    position: row.position,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  }
}

// Loads the parent task to verify the caller can mutate its subtasks.
// 404 if the task is gone, 403 if it exists but the caller is out of scope.
// Demo mode (AUTH_ENABLED=false) → permissive, mirrors requireAdmin/Auth.
async function requireParentTaskAccess(req, res, next) {
  if (!AUTH_ENABLED) return next()
  try {
    const { rows: [parent] } = await pool.query(
      'SELECT group_name FROM tasks WHERE id = $1',
      [req.params.taskId],
    )
    if (!parent) return res.status(404).json({ error: 'Parent task not found' })
    if (!canWrite(req.userCtx, parent.group_name)) {
      return res.status(403).json({ error: `Write access denied for group: ${parent.group_name}` })
    }
    next()
  } catch (err) {
    console.error('requireParentTaskAccess error:', err.message)
    res.status(500).json({ error: 'Failed to check parent task' })
  }
}

// GET /api/tasks/:taskId/subtasks — list checklist items in display order
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM subtasks WHERE task_id = $1 ORDER BY position, created_at',
      [req.params.taskId],
    )
    res.json(rows.map(mapSubtaskToClient))
  } catch (err) {
    console.error('GET subtasks error:', err.message)
    res.status(500).json({ error: 'Failed to fetch subtasks' })
  }
})

// POST /api/tasks/:taskId/subtasks — append new item
router.post('/', requireParentTaskAccess, async (req, res) => {
  try {
    const { description } = req.body
    const taskId = req.params.taskId

    // Append to the end: position = max(existing) + 1
    const { rows: [{ next_pos }] } = await pool.query(
      'SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM subtasks WHERE task_id = $1',
      [taskId],
    )

    const { rows } = await pool.query(
      `INSERT INTO subtasks (task_id, description, position)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [taskId, description || '', next_pos],
    )
    res.status(201).json(mapSubtaskToClient(rows[0]))
  } catch (err) {
    console.error('POST subtask error:', err.message)
    res.status(500).json({ error: 'Failed to create subtask' })
  }
})

// PATCH /api/tasks/:taskId/subtasks/:id — edit description or toggle done
const ALLOWED_FIELDS = { description: 'description', done: 'done', position: 'position' }

router.patch('/:id', requireParentTaskAccess, async (req, res) => {
  try {
    const { field, value } = req.body
    const column = ALLOWED_FIELDS[field]
    if (!column) return res.status(400).json({ error: `Invalid field: ${field}` })

    const { rows } = await pool.query(
      `UPDATE subtasks SET ${column} = $2 WHERE id = $1 AND task_id = $3 RETURNING *`,
      [req.params.id, value, req.params.taskId],
    )
    if (rows.length === 0) return res.status(404).json({ error: 'Subtask not found' })
    res.json(mapSubtaskToClient(rows[0]))
  } catch (err) {
    console.error('PATCH subtask error:', err.message)
    res.status(500).json({ error: 'Failed to update subtask' })
  }
})

// DELETE /api/tasks/:taskId/subtasks/:id
router.delete('/:id', requireParentTaskAccess, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM subtasks WHERE id = $1 AND task_id = $2',
      [req.params.id, req.params.taskId],
    )
    if (rowCount === 0) return res.status(404).json({ error: 'Subtask not found' })
    res.json({ ok: true })
  } catch (err) {
    console.error('DELETE subtask error:', err.message)
    res.status(500).json({ error: 'Failed to delete subtask' })
  }
})

export default router
