import { Router } from 'express'
import { AUTH_ENABLED } from '../auth.js'
import pool from '../db.js'

const router = Router()

// Returns the identity of the caller as derived from their validated JWT,
// enriched with display_owner + role from the users table.
//
// In demo mode (AUTH_ENABLED=false) returns a stub so the frontend can still
// render predictably.
//
// When the email is NOT in the users table: returns owner=null and
// role='viewer'. The frontend gates the UI accordingly; mutating endpoints
// will enforce role server-side (TODO when role enforcement lands).
router.get('/', async (req, res) => {
  if (!AUTH_ENABLED) {
    return res.json({ authenticated: false, demo: true })
  }
  if (!req.user) return res.status(401).json({ error: 'Unauthenticated' })

  const email = req.user.email
  let owner = null
  let role = 'viewer'

  if (email) {
    const { rows } = await pool.query(
      'SELECT display_owner, role FROM users WHERE email = $1',
      [email],
    )
    if (rows.length > 0) {
      owner = rows[0].display_owner
      role = rows[0].role
    }
  }

  res.json({
    authenticated: true,
    email,
    name: req.user.name,
    oid: req.user.oid,
    owner,
    role,
    inUsersTable: owner !== null,
  })
})

export default router
