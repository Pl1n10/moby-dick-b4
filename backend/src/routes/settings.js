import { Router } from 'express'
import pool from '../db.js'
import { requireAdmin } from '../auth.js'

// Mounted at /api/settings (requireAuth + loadUserContext applied app-level).
// Singleton app-wide settings, stored in the app_settings key/value table.
// Reads are open to any authenticated user; writes are admin-only.
const router = Router()

// Keys the API is willing to serve/accept. Anything else 404s — keeps the
// endpoint from becoming an arbitrary key/value store for the client.
const ALLOWED_KEYS = ['on_call']

function mapSettingToClient(row) {
  return {
    key: row.key,
    value: row.value,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    updatedBy: row.updated_by,
  }
}

// GET /api/settings/on_call — who is currently on call (a display_owner
// value, or null when nobody is set).
router.get('/:key', async (req, res) => {
  const { key } = req.params
  if (!ALLOWED_KEYS.includes(key)) return res.status(404).json({ error: `Unknown setting: ${key}` })
  try {
    const { rows } = await pool.query('SELECT * FROM app_settings WHERE key = $1', [key])
    if (rows.length === 0) return res.json({ key, value: null, updatedAt: null, updatedBy: null })
    res.json(mapSettingToClient(rows[0]))
  } catch (err) {
    console.error('GET /api/settings error:', err.message)
    res.status(500).json({ error: 'Failed to fetch setting' })
  }
})

// PUT /api/settings/on_call — admin-only. Body: { value }.
// `value` must be an existing display_owner (or null/'' to clear): storing a
// free-text name would silently break the "assign to the on-call person"
// habit the moment someone typos it.
router.put('/:key', requireAdmin, async (req, res) => {
  const { key } = req.params
  if (!ALLOWED_KEYS.includes(key)) return res.status(404).json({ error: `Unknown setting: ${key}` })

  try {
    const raw = req.body.value
    const value = (raw == null || raw === '') ? null : String(raw)

    if (value !== null) {
      const { rows } = await pool.query(
        'SELECT 1 FROM users WHERE display_owner = $1 LIMIT 1',
        [value],
      )
      if (rows.length === 0) {
        return res.status(400).json({ error: `Unknown owner: ${value}` })
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO app_settings (key, value, updated_at, updated_by)
       VALUES ($1, $2, NOW(), $3)
       ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value,
             updated_at = EXCLUDED.updated_at,
             updated_by = EXCLUDED.updated_by
       RETURNING *`,
      [key, value, (req.user && req.user.email) || null],
    )
    res.json(mapSettingToClient(rows[0]))
  } catch (err) {
    console.error('PUT /api/settings error:', err.message)
    res.status(500).json({ error: 'Failed to update setting' })
  }
})

export default router
