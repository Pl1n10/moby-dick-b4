import { Router } from 'express'
import { AUTH_ENABLED } from '../auth.js'
import pool from '../db.js'

const router = Router()

// Returns the identity of the caller as derived from their validated JWT,
// enriched with display_owner + role + operator_groups from the users table.
//
// In demo mode (AUTH_ENABLED=false) returns a stub so the frontend can still
// render predictably.
//
// When the email is NOT in the users table: returns owner=null, role='viewer'
// and operatorGroups=[]. The frontend gates the UI accordingly; mutating
// endpoints enforce the same server-side via loadUserContext + canWrite.
router.get('/', async (req, res) => {
  if (!AUTH_ENABLED) {
    return res.json({ authenticated: false, demo: true })
  }
  if (!req.user) return res.status(401).json({ error: 'Unauthenticated' })

  const email = req.user.email
  const name = req.user.name
  let owner = null
  let role = 'viewer'
  let operatorGroups = []
  let inUsersTable = false

  if (email) {
    // Self-service auto-register: first-time logins get a row in users with
    // display_owner = JWT name claim, role = viewer, operator_groups = empty.
    // Admin can later promote / rename / hide / assign scope via the admin
    // page. ON CONFLICT keeps any manual edits intact.
    if (name) {
      await pool.query(
        `INSERT INTO users (email, display_owner, role)
         VALUES ($1, $2, 'viewer')
         ON CONFLICT (email) DO NOTHING`,
        [email, name],
      )
    }

    const { rows } = await pool.query(
      'SELECT display_owner, role, operator_groups FROM users WHERE email = $1',
      [email],
    )
    if (rows.length > 0) {
      owner = rows[0].display_owner
      role = rows[0].role
      operatorGroups = Array.isArray(rows[0].operator_groups) ? rows[0].operator_groups : []
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
    operatorGroups,
    inUsersTable,
  })
})

export default router
