import { Router } from 'express'
import { AUTH_ENABLED } from '../auth.js'
import pool from '../db.js'

const router = Router()

// Boards the caller belongs to, with their role on each, in board order.
async function loadMemberships(email) {
  const { rows } = await pool.query(
    `SELECT t.slug, t.name, m.role, m.operator_groups
     FROM memberships m JOIN tenants t ON t.id = m.tenant_id
     WHERE m.email = $1
     ORDER BY t.position, t.name`,
    [email],
  )
  return rows.map(r => ({
    slug: r.slug,
    name: r.name,
    role: r.role,
    operatorGroups: Array.isArray(r.operator_groups) ? r.operator_groups : [],
  }))
}

// GET /api/me — identity of the caller from their validated JWT, enriched
// with display_owner, superadmin flag, home board and memberships.
//
// homeBoard = null means the user never picked a board: the frontend shows
// the board chooser (PUT /api/me/home).
//
// Demo mode (AUTH_ENABLED=false) returns a stub so the frontend can still
// render predictably; the demo user acts as superadmin.
router.get('/', async (req, res) => {
  if (!AUTH_ENABLED) {
    return res.json({ authenticated: false, demo: true, isSuperadmin: true })
  }
  if (!req.user) return res.status(401).json({ error: 'Unauthenticated' })

  const email = req.user.email
  const name = req.user.name
  let owner = null
  let homeBoard = null
  let memberships = []
  let inUsersTable = false

  if (email) {
    // Self-service auto-register: first-time logins get a row in users with
    // display_owner = JWT name claim and NO membership. Which board they
    // belong to is their choice (PUT /home). ON CONFLICT keeps manual edits.
    if (name) {
      await pool.query(
        `INSERT INTO users (email, display_owner, role)
         VALUES ($1, $2, 'viewer')
         ON CONFLICT (email) DO NOTHING`,
        [email, name],
      )
    }

    const { rows } = await pool.query(
      `SELECT u.display_owner, t.slug AS home_slug
       FROM users u LEFT JOIN tenants t ON t.id = u.home_tenant_id
       WHERE u.email = $1`,
      [email],
    )
    if (rows.length > 0) {
      owner = rows[0].display_owner
      homeBoard = rows[0].home_slug
      inUsersTable = true
      memberships = await loadMemberships(email)
    }
  }

  res.json({
    authenticated: true,
    email,
    name,
    oid: req.user.oid,
    owner,
    isSuperadmin: req.userCtx.isSuperadmin,
    homeBoard,
    memberships,
    inUsersTable,
  })
})

// PUT /api/me/home — body { slug }. The caller picks "their" board: it
// becomes the one they land on, and they join it as viewer if they were not
// a member yet (so they show up in its owner picker). An existing role on
// that board is never downgraded. Permissive by decision (2026-10-07):
// approval for joining is not required for now.
router.put('/home', async (req, res) => {
  if (!AUTH_ENABLED) return res.status(400).json({ error: 'Not available in demo mode' })
  const email = req.userCtx.email
  if (!email) return res.status(400).json({ error: 'Token has no email claim' })

  try {
    const { rows: [tenant] } = await pool.query('SELECT id, slug FROM tenants WHERE slug = $1', [req.body.slug])
    if (!tenant) return res.status(404).json({ error: `Unknown board: ${req.body.slug}` })

    // GET / registers users only when the token carries a name; make sure
    // the row exists, memberships reference it.
    await pool.query(
      `INSERT INTO users (email, role) VALUES ($1, 'viewer') ON CONFLICT (email) DO NOTHING`,
      [email],
    )
    await pool.query('UPDATE users SET home_tenant_id = $1 WHERE email = $2', [tenant.id, email])
    await pool.query(
      `INSERT INTO memberships (tenant_id, email, role) VALUES ($1, $2, 'viewer')
       ON CONFLICT (tenant_id, email) DO NOTHING`,
      [tenant.id, email],
    )
    res.json({ homeBoard: tenant.slug, memberships: await loadMemberships(email) })
  } catch (err) {
    console.error('PUT /api/me/home error:', err.message)
    res.status(500).json({ error: 'Failed to set home board' })
  }
})

export default router
