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
  const name = req.user.name
  let owner = null
  let role = 'viewer'
  let inUsersTable = false

  if (email) {
    // Self-service auto-register: first-time logins get a row in users with
    // display_owner = JWT name claim and role = viewer. Anyone @mauden who
    // logs in becomes immediately assignable as a task owner. Admin can
    // later promote / rename / hide (set display_owner = NULL) / remove via
    // the admin page (TODO). ON CONFLICT keeps any manual edits intact.
    if (name) {
      await pool.query(
        `INSERT INTO users (email, display_owner, role)
         VALUES ($1, $2, 'viewer')
         ON CONFLICT (email) DO NOTHING`,
        [email, name],
      )
    }

    const { rows } = await pool.query(
      'SELECT display_owner, role FROM users WHERE email = $1',
      [email],
    )
    if (rows.length > 0) {
      owner = rows[0].display_owner
      role = rows[0].role
      inUsersTable = true
    }
  }

  res.json({
    authenticated: true,
    email,
    name,
    oid: req.user.oid,
    owner,
    role,
    inUsersTable,
  })
})

export default router
