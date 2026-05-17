import { Router } from 'express'
import pool from '../db.js'
import { requireAdmin } from '../auth.js'

// Mounted at /api/users (requireAuth applied at the app level). GET /owners
// is open to any authenticated user (the task pickers need it). The rest
// (list, create, edit, delete) is admin-only — drives the admin users page.
const router = Router()

function mapUserToClient(row) {
  return {
    id: row.id,
    email: row.email,
    displayOwner: row.display_owner,
    role: row.role,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  }
}

// GET /api/users/owners — list of display_owner values currently selectable
// as task owners. NULL display_owner means a user is hidden from the picker
// (still in the table for auth/role purposes, just not assignable).
router.get('/owners', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT display_owner FROM users WHERE display_owner IS NOT NULL ORDER BY display_owner',
    )
    res.json(rows.map(r => r.display_owner))
  } catch (err) {
    console.error('GET /api/users/owners error:', err.message)
    res.status(500).json({ error: 'Failed to fetch owners' })
  }
})

// GET /api/users — full list for the admin page.
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM users ORDER BY (role = \'admin\') DESC, display_owner NULLS LAST, email',
    )
    res.json(rows.map(mapUserToClient))
  } catch (err) {
    console.error('GET /api/users error:', err.message)
    res.status(500).json({ error: 'Failed to fetch users' })
  }
})

// POST /api/users — manual add (e.g. preregister a colleague before first login).
// On conflict (email already present) updates display_owner + role to the
// supplied values — same semantics as the admin page editing an existing row.
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { email, displayOwner, role } = req.body
    if (!email) return res.status(400).json({ error: 'email required' })
    if (role && !['admin', 'viewer'].includes(role)) {
      return res.status(400).json({ error: 'role must be admin or viewer' })
    }
    const normalizedOwner = (displayOwner == null || displayOwner === '') ? null : displayOwner
    const { rows } = await pool.query(
      `INSERT INTO users (email, display_owner, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE
         SET display_owner = EXCLUDED.display_owner,
             role          = EXCLUDED.role
       RETURNING *`,
      [email, normalizedOwner, role || 'viewer'],
    )
    res.status(201).json(mapUserToClient(rows[0]))
  } catch (err) {
    console.error('POST /api/users error:', err.message)
    res.status(500).json({ error: 'Failed to create user' })
  }
})

// PATCH /api/users/:id — edit display_owner and/or role.
// Guardrail: don't let an admin demote or hide themselves (lockout protection).
router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { displayOwner, role } = req.body

    const { rows: [existing] } = await pool.query('SELECT * FROM users WHERE id = $1', [id])
    if (!existing) return res.status(404).json({ error: 'User not found' })

    const isSelf = req.user && req.user.email && existing.email === req.user.email
    if (isSelf && role && role !== 'admin') {
      return res.status(400).json({ error: 'You cannot demote yourself' })
    }
    if (role && !['admin', 'viewer'].includes(role)) {
      return res.status(400).json({ error: 'role must be admin or viewer' })
    }

    const updates = []
    const values = [id]
    if (displayOwner !== undefined) {
      const normalized = (displayOwner === '' || displayOwner === null) ? null : displayOwner
      values.push(normalized)
      updates.push(`display_owner = $${values.length}`)
    }
    if (role !== undefined) {
      values.push(role)
      updates.push(`role = $${values.length}`)
    }
    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nothing to update' })
    }

    const { rows } = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
      values,
    )
    res.json(mapUserToClient(rows[0]))
  } catch (err) {
    console.error('PATCH /api/users error:', err.message)
    res.status(500).json({ error: 'Failed to update user' })
  }
})

// DELETE /api/users/:id — remove the user record entirely.
// Note: tasks owned by them are NOT cascaded; the owner field stays as plain
// text. The deleted user just disappears from /api/users/owners; they can
// re-register at next login (auto-register restores a viewer row).
// Guardrail: can't delete yourself.
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { rows: [existing] } = await pool.query('SELECT email FROM users WHERE id = $1', [id])
    if (!existing) return res.status(404).json({ error: 'User not found' })
    if (req.user && req.user.email && existing.email === req.user.email) {
      return res.status(400).json({ error: 'You cannot delete yourself' })
    }
    await pool.query('DELETE FROM users WHERE id = $1', [id])
    res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/users error:', err.message)
    res.status(500).json({ error: 'Failed to delete user' })
  }
})

export default router
