import { Router } from 'express'
import { AUTH_ENABLED } from '../auth.js'

const router = Router()

// Returns the identity of the caller as derived from their validated JWT.
// In demo mode (AUTH_ENABLED=false) returns a stub so the frontend can still
// render predictably.
//
// TODO (when users table lands): enrich response with mapped owner
// (Bob/Erica/Walker) and role (admin/viewer) looked up by email.
router.get('/', (req, res) => {
  if (!AUTH_ENABLED) {
    return res.json({ authenticated: false, demo: true })
  }
  if (!req.user) return res.status(401).json({ error: 'Unauthenticated' })
  res.json({
    authenticated: true,
    email: req.user.email,
    name: req.user.name,
    oid: req.user.oid,
    roles: req.user.roles,
  })
})

export default router
