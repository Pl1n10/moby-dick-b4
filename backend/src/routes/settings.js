import { Router } from 'express'
import pool from '../db.js'
import { requireBoardAdmin, boardFeature } from '../auth.js'

// Mounted at /api/t/:slug/settings, after loadBoard. Singleton settings of
// one board, stored in app_settings keyed by (tenant_id, key). Reads are open
// to any authenticated user; writes are board-admin only.
const router = Router()

// Keys the API is willing to serve/accept, each with the board feature that
// must be on for the key to exist. Anything else 404s — keeps the endpoint
// from becoming an arbitrary key/value store for the client.
const ALLOWED_KEYS = { on_call: 'reperibile' }

function keyAvailable(req) {
  const feature = ALLOWED_KEYS[req.params.key]
  return feature !== undefined && boardFeature(req.tenant, feature)
}

function mapSettingToClient(row) {
  return {
    key: row.key,
    value: row.value,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    updatedBy: row.updated_by,
  }
}

// GET /api/t/:slug/settings/on_call — who is currently on call (a
// display_owner value, or null when nobody is set).
router.get('/:key', async (req, res) => {
  const { key } = req.params
  if (!keyAvailable(req)) return res.status(404).json({ error: `Unknown setting: ${key}` })
  try {
    const { rows } = await pool.query(
      'SELECT * FROM app_settings WHERE tenant_id = $1 AND key = $2',
      [req.tenant.id, key],
    )
    if (rows.length === 0) return res.json({ key, value: null, updatedAt: null, updatedBy: null })
    res.json(mapSettingToClient(rows[0]))
  } catch (err) {
    console.error('GET /api/settings error:', err.message)
    res.status(500).json({ error: 'Failed to fetch setting' })
  }
})

// PUT /api/t/:slug/settings/on_call — board-admin only. Body: { value }.
// `value` must be the display_owner of a member of this board (or null/'' to
// clear): storing a free-text name would silently break the "assign to the
// on-call person" habit the moment someone typos it.
router.put('/:key', requireBoardAdmin, async (req, res) => {
  const { key } = req.params
  if (!keyAvailable(req)) return res.status(404).json({ error: `Unknown setting: ${key}` })

  try {
    const raw = req.body.value
    const value = (raw == null || raw === '') ? null : String(raw)

    if (value !== null) {
      const { rows } = await pool.query(
        `SELECT 1 FROM users u JOIN memberships m ON m.email = u.email
         WHERE m.tenant_id = $1 AND u.display_owner = $2 LIMIT 1`,
        [req.tenant.id, value],
      )
      if (rows.length === 0) {
        return res.status(400).json({ error: `Unknown owner: ${value}` })
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO app_settings (tenant_id, key, value, updated_at, updated_by)
       VALUES ($4, $1, $2, NOW(), $3)
       ON CONFLICT (tenant_id, key) DO UPDATE
         SET value = EXCLUDED.value,
             updated_at = EXCLUDED.updated_at,
             updated_by = EXCLUDED.updated_by
       RETURNING *`,
      [key, value, (req.user && req.user.email) || null, req.tenant.id],
    )
    res.json(mapSettingToClient(rows[0]))
  } catch (err) {
    console.error('PUT /api/settings error:', err.message)
    res.status(500).json({ error: 'Failed to update setting' })
  }
})

export default router
