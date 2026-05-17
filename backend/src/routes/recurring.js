import { Router } from 'express'
import pool from '../db.js'
import { requireAdmin } from '../auth.js'

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

// GET /api/recurring — list all templates
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM recurring_templates ORDER BY created_at')
    res.json(rows.map(mapTemplateToClient))
  } catch (err) {
    console.error('GET /api/recurring error:', err.message)
    res.status(500).json({ error: 'Failed to fetch recurring templates' })
  }
})

// PUT /api/recurring — replace all templates (full save from modal)
router.put('/', requireAdmin, async (req, res) => {
  const templates = req.body
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('DELETE FROM recurring_templates')

    for (const tmpl of templates) {
      await client.query(
        `INSERT INTO recurring_templates
           (id, group_name, reference, description, owner, frequency, scheduled_time, last_created_date, active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
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
        ]
      )
    }

    await client.query('COMMIT')

    const { rows } = await pool.query('SELECT * FROM recurring_templates ORDER BY created_at')
    res.json(rows.map(mapTemplateToClient))
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('PUT /api/recurring error:', err.message)
    res.status(500).json({ error: 'Failed to save recurring templates' })
  } finally {
    client.release()
  }
})

// DELETE /api/recurring — clear all
router.delete('/', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM recurring_templates')
    res.json([])
  } catch (err) {
    console.error('DELETE /api/recurring error:', err.message)
    res.status(500).json({ error: 'Failed to clear recurring templates' })
  }
})

export default router
