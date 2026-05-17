import { Router } from 'express'
import pool from '../db.js'
import { requireAdmin } from '../auth.js'

// Mounted at /api/tasks/:taskId/subtasks (see index.js / tasks router).
// Reads are open to any authenticated user; mutations require admin.
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
router.post('/', requireAdmin, async (req, res) => {
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

router.patch('/:id', requireAdmin, async (req, res) => {
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
router.delete('/:id', requireAdmin, async (req, res) => {
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
