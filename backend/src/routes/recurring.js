import { Router } from 'express'
import pool from '../db.js'
import { requireBoardAdmin } from '../auth.js'

const router = Router()

// ── Helpers ─────────────────────────────────────────────

function formatDate(d) {
  if (!d) return null
  if (d instanceof Date) return d.toISOString().slice(0, 10)
  return String(d).slice(0, 10)
}

function mapTemplateToClient(row) {
  return {
    id: row.id,
    group: row.group_name,
    reference: row.reference,
    description: row.description,
    owner: row.owner,
    frequency: row.frequency,
    scheduledTime: row.scheduled_time,
    lastCreatedDate: formatDate(row.last_created_date),
    active: row.active,
  }
}

// ── Routes ──────────────────────────────────────────────
// Mounted at /api/t/:slug/recurring, after loadBoard. Every query filters on
// the board (req.tenant.id).

// GET /api/t/:slug/recurring — the board's templates
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM recurring_templates WHERE tenant_id = $1 ORDER BY created_at',
      [req.tenant.id],
    )
    res.json(rows.map(mapTemplateToClient))
  } catch (err) {
    console.error('GET /api/recurring error:', err.message)
    res.status(500).json({ error: 'Failed to fetch recurring templates' })
  }
})

// PUT /api/t/:slug/recurring — replace the board's templates (full save
// from the modal). Board-admin only. Sections are checked up front so a bad
// one is a 400, not a foreign-key 500.
router.put('/', requireBoardAdmin, async (req, res) => {
  const templates = req.body
  if (!Array.isArray(templates)) return res.status(400).json({ error: 'Expected an array of templates' })
  const { rows: pillarRows } = await pool.query('SELECT name FROM pillars WHERE tenant_id = $1', [req.tenant.id])
  const pillars = new Set(pillarRows.map(r => r.name))
  const bad = templates.find(t => !pillars.has(t.group))
  if (bad) return res.status(400).json({ error: `Unknown section: ${bad.group}` })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('DELETE FROM recurring_templates WHERE tenant_id = $1', [req.tenant.id])

    for (const tmpl of templates) {
      await client.query(
        `INSERT INTO recurring_templates
           (id, tenant_id, group_name, reference, description, owner, frequency, scheduled_time, last_created_date, active)
         VALUES ($1, $10, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          tmpl.id,
          tmpl.group,
          tmpl.reference || '',
          tmpl.description || '',
          tmpl.owner,
          tmpl.frequency || 'daily',
          tmpl.scheduledTime || '08:00',
          tmpl.lastCreatedDate || null,
          tmpl.active ?? true,
          req.tenant.id,
        ]
      )
    }

    await client.query('COMMIT')

    const { rows } = await pool.query(
      'SELECT * FROM recurring_templates WHERE tenant_id = $1 ORDER BY created_at',
      [req.tenant.id],
    )
    res.json(rows.map(mapTemplateToClient))
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('PUT /api/recurring error:', err.message)
    res.status(500).json({ error: 'Failed to save recurring templates' })
  } finally {
    client.release()
  }
})

// DELETE /api/t/:slug/recurring — clear the board's templates
router.delete('/', requireBoardAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM recurring_templates WHERE tenant_id = $1', [req.tenant.id])
    res.json([])
  } catch (err) {
    console.error('DELETE /api/recurring error:', err.message)
    res.status(500).json({ error: 'Failed to clear recurring templates' })
  }
})

export default router
