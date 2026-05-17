import { Router } from 'express'
import pool from '../db.js'

// Mounted at /api/users (requireAuth applied at the app level).
// This file currently exposes only the read-only owner list. Full users CRUD
// (admin-only) is the next planned step — when it lands, the admin UI page
// will live on top of these endpoints.
const router = Router()

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

export default router
