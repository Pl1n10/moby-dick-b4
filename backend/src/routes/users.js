import { Router } from 'express'
import pool from '../db.js'
import { requireSuperadmin } from '../auth.js'

// Mounted at /api/users (requireAuth + loadUserContext applied in app.js).
// Global user administration for the superadmin console: every account with
// its memberships on every board. Board-level membership is also editable by
// each board's admins via /api/t/:slug/members.
//
// The owner picker moved to /api/t/:slug/members/owners (owners are per board).
const router = Router()

router.use(requireSuperadmin)

const USERS_WITH_MEMBERSHIPS = `
  SELECT u.id, u.email, u.display_owner, u.is_superadmin, u.created_at,
         ht.slug AS home_slug,
         COALESCE(
           json_agg(json_build_object(
             'slug', t.slug, 'name', t.name, 'role', m.role, 'operatorGroups', m.operator_groups
           ) ORDER BY t.position, t.name) FILTER (WHERE t.id IS NOT NULL),
           '[]'
         ) AS memberships
  FROM users u
  LEFT JOIN tenants ht ON ht.id = u.home_tenant_id
  LEFT JOIN memberships m ON m.email = u.email
  LEFT JOIN tenants t ON t.id = m.tenant_id
`

function mapUserToClient(row) {
  return {
    id: row.id,
    email: row.email,
    displayOwner: row.display_owner,
    isSuperadmin: row.is_superadmin === true,
    homeBoard: row.home_slug,
    memberships: row.memberships || [],
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  }
}

async function loadUser(id) {
  const { rows: [row] } = await pool.query(`${USERS_WITH_MEMBERSHIPS} WHERE u.id = $1 GROUP BY u.id, ht.slug`, [id])
  return row ? mapUserToClient(row) : null
}

// GET /api/users — every account, superadmins first.
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `${USERS_WITH_MEMBERSHIPS}
       GROUP BY u.id, ht.slug
       ORDER BY u.is_superadmin DESC, u.display_owner NULLS LAST, u.email`,
    )
    res.json(rows.map(mapUserToClient))
  } catch (err) {
    console.error('GET /api/users error:', err.message)
    res.status(500).json({ error: 'Failed to fetch users' })
  }
})

// POST /api/users — pre-register a colleague before their first login.
// Body { email, displayOwner? }. Boards are assigned through memberships.
router.post('/', async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim() : ''
  if (!email.includes('@')) return res.status(400).json({ error: 'email required' })
  const owner = req.body.displayOwner == null || String(req.body.displayOwner).trim() === ''
    ? null : String(req.body.displayOwner).trim()
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (email, display_owner, role) VALUES ($1, $2, 'viewer')
       ON CONFLICT (email) DO NOTHING RETURNING id`,
      [email, owner],
    )
    if (rows.length === 0) return res.status(409).json({ error: `User already exists: ${email}` })
    res.status(201).json(await loadUser(rows[0].id))
  } catch (err) {
    console.error('POST /api/users error:', err.message)
    res.status(500).json({ error: 'Failed to create user' })
  }
})

// PATCH /api/users/:id — body { displayOwner?, isSuperadmin? }.
// Guardrail: a superadmin cannot drop their own superadmin flag (lockout).
router.patch('/:id', async (req, res) => {
  const { displayOwner, isSuperadmin } = req.body
  try {
    const { rows: [existing] } = await pool.query('SELECT email FROM users WHERE id = $1', [req.params.id])
    if (!existing) return res.status(404).json({ error: 'User not found' })

    const updates = []
    const values = [req.params.id]
    if (displayOwner !== undefined) {
      const owner = displayOwner === null || String(displayOwner).trim() === '' ? null : String(displayOwner).trim()
      values.push(owner); updates.push(`display_owner = $${values.length}`)
    }
    if (isSuperadmin !== undefined) {
      if (typeof isSuperadmin !== 'boolean') return res.status(400).json({ error: 'isSuperadmin must be a boolean' })
      if (!isSuperadmin && existing.email === req.userCtx.email) {
        return res.status(400).json({ error: 'You cannot remove your own superadmin role' })
      }
      values.push(isSuperadmin); updates.push(`is_superadmin = $${values.length}`)
    }
    if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' })

    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $1`, values)
    res.json(await loadUser(req.params.id))
  } catch (err) {
    console.error('PATCH /api/users error:', err.message)
    res.status(500).json({ error: 'Failed to update user' })
  }
})

// DELETE /api/users/:id — remove the account and, by cascade, its
// memberships and Bit Adder score. Tasks they own keep the name as plain
// text. They can come back at next login (auto-register, no boards).
// Guardrail: cannot delete yourself.
router.delete('/:id', async (req, res) => {
  try {
    const { rows: [existing] } = await pool.query('SELECT email FROM users WHERE id = $1', [req.params.id])
    if (!existing) return res.status(404).json({ error: 'User not found' })
    if (existing.email === req.userCtx.email) return res.status(400).json({ error: 'You cannot delete yourself' })
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id])
    res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/users error:', err.message)
    res.status(500).json({ error: 'Failed to delete user' })
  }
})

export default router
