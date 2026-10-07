import { Router } from 'express'
import pool from '../db.js'
import { requireSuperadmin } from '../auth.js'

// Mounted at /api/tenants (requireAuth + loadUserContext applied in app.js).
// The board directory. GET is open to any authenticated user: visibility is
// permissive for now (decision 2026-10-07) and the board chooser needs it.
// Creating, editing and deleting boards and their sections is superadmin-only.
const router = Router()

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

// Postgres error codes we turn into 4xx instead of a 500.
const UNIQUE_VIOLATION = '23505'
const FK_VIOLATION = '23503'

function mapTenantToClient(row, pillars) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    settings: row.settings || {},
    position: row.position,
    pillars: pillars.map(p => ({ id: p.id, name: p.name, position: p.position })),
  }
}

// settings shape: { labels: { <field>: string }, features: { <name>: boolean } }.
// Anything else is rejected, so the column cannot turn into a dumping ground.
function validateSettings(settings) {
  if (settings === null || typeof settings !== 'object' || Array.isArray(settings)) {
    return 'settings must be an object'
  }
  for (const key of Object.keys(settings)) {
    if (!['labels', 'features'].includes(key)) return `Unknown settings key: ${key}`
  }
  const { labels = {}, features = {} } = settings
  if (typeof labels !== 'object' || Array.isArray(labels)) return 'settings.labels must be an object'
  if (typeof features !== 'object' || Array.isArray(features)) return 'settings.features must be an object'
  for (const [k, v] of Object.entries(labels)) {
    if (typeof v !== 'string') return `settings.labels.${k} must be a string`
  }
  for (const [k, v] of Object.entries(features)) {
    if (typeof v !== 'boolean') return `settings.features.${k} must be a boolean`
  }
  return null
}

async function loadTenant(slug) {
  const { rows: [tenant] } = await pool.query('SELECT * FROM tenants WHERE slug = $1', [slug])
  if (!tenant) return null
  const { rows: pillars } = await pool.query(
    'SELECT * FROM pillars WHERE tenant_id = $1 ORDER BY position, name',
    [tenant.id],
  )
  return mapTenantToClient(tenant, pillars)
}

// GET /api/tenants — every board with its sections, in display order.
router.get('/', async (req, res) => {
  try {
    const { rows: tenants } = await pool.query('SELECT * FROM tenants ORDER BY position, name')
    const { rows: pillars } = await pool.query('SELECT * FROM pillars ORDER BY position, name')
    res.json(tenants.map(t => mapTenantToClient(t, pillars.filter(p => p.tenant_id === t.id))))
  } catch (err) {
    console.error('GET /api/tenants error:', err.message)
    res.status(500).json({ error: 'Failed to fetch boards' })
  }
})

// POST /api/tenants — body { slug, name, settings?, pillars?: string[] }.
router.post('/', requireSuperadmin, async (req, res) => {
  const { slug, name, settings = {}, pillars = [] } = req.body
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
    return res.status(400).json({ error: 'slug must be lowercase letters, digits and single dashes' })
  }
  if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name required' })
  const settingsError = validateSettings(settings)
  if (settingsError) return res.status(400).json({ error: settingsError })
  if (!Array.isArray(pillars) || pillars.some(p => typeof p !== 'string' || !p.trim())) {
    return res.status(400).json({ error: 'pillars must be an array of non-empty strings' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: [tenant] } = await client.query(
      `INSERT INTO tenants (slug, name, settings, position)
       VALUES ($1, $2, $3, (SELECT COALESCE(MAX(position), -1) + 1 FROM tenants))
       RETURNING *`,
      [slug, name.trim(), settings],
    )
    const names = [...new Set(pillars.map(p => p.trim()))]
    for (const [i, p] of names.entries()) {
      await client.query(
        'INSERT INTO pillars (tenant_id, name, position) VALUES ($1, $2, $3)',
        [tenant.id, p, i],
      )
    }
    await client.query('COMMIT')
    res.status(201).json(await loadTenant(tenant.slug))
  } catch (err) {
    await client.query('ROLLBACK')
    if (err.code === UNIQUE_VIOLATION) return res.status(409).json({ error: `Board already exists: ${slug}` })
    console.error('POST /api/tenants error:', err.message)
    res.status(500).json({ error: 'Failed to create board' })
  } finally {
    client.release()
  }
})

// PATCH /api/tenants/:slug — body { name?, slug?, settings?, position? }.
// Changing the slug changes the board's URL: old links stop working.
router.patch('/:slug', requireSuperadmin, async (req, res) => {
  const { name, slug, settings, position } = req.body
  const updates = []
  const values = [req.params.slug]
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name must be non-empty' })
    values.push(name.trim()); updates.push(`name = $${values.length}`)
  }
  if (slug !== undefined) {
    if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
      return res.status(400).json({ error: 'slug must be lowercase letters, digits and single dashes' })
    }
    values.push(slug); updates.push(`slug = $${values.length}`)
  }
  if (settings !== undefined) {
    const settingsError = validateSettings(settings)
    if (settingsError) return res.status(400).json({ error: settingsError })
    values.push(settings); updates.push(`settings = $${values.length}`)
  }
  if (position !== undefined) {
    if (!Number.isInteger(position)) return res.status(400).json({ error: 'position must be an integer' })
    values.push(position); updates.push(`position = $${values.length}`)
  }
  if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' })

  try {
    const { rows } = await pool.query(
      `UPDATE tenants SET ${updates.join(', ')} WHERE slug = $1 RETURNING slug`,
      values,
    )
    if (rows.length === 0) return res.status(404).json({ error: `Unknown board: ${req.params.slug}` })
    res.json(await loadTenant(rows[0].slug))
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) return res.status(409).json({ error: `Board already exists: ${slug}` })
    console.error('PATCH /api/tenants error:', err.message)
    res.status(500).json({ error: 'Failed to update board' })
  }
})

// DELETE /api/tenants/:slug — only an empty board: tasks and templates block
// the delete (FK RESTRICT) and must be removed first. Memberships, sections
// and settings go with the board.
router.delete('/:slug', requireSuperadmin, async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM tenants WHERE slug = $1', [req.params.slug])
    if (rowCount === 0) return res.status(404).json({ error: `Unknown board: ${req.params.slug}` })
    res.json({ ok: true })
  } catch (err) {
    if (err.code === FK_VIOLATION) {
      return res.status(409).json({ error: 'Board still has tasks or recurring templates' })
    }
    console.error('DELETE /api/tenants error:', err.message)
    res.status(500).json({ error: 'Failed to delete board' })
  }
})

// ── Sections (pillars) ──────────────────────────────────

async function tenantIdOf(slug) {
  const { rows: [t] } = await pool.query('SELECT id FROM tenants WHERE slug = $1', [slug])
  return t ? t.id : null
}

// POST /api/tenants/:slug/pillars — body { name }. Appended at the end.
router.post('/:slug/pillars', requireSuperadmin, async (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
  if (!name) return res.status(400).json({ error: 'name required' })
  try {
    const tenantId = await tenantIdOf(req.params.slug)
    if (!tenantId) return res.status(404).json({ error: `Unknown board: ${req.params.slug}` })
    await pool.query(
      `INSERT INTO pillars (tenant_id, name, position)
       VALUES ($1, $2, (SELECT COALESCE(MAX(position), -1) + 1 FROM pillars WHERE tenant_id = $1))`,
      [tenantId, name],
    )
    res.status(201).json(await loadTenant(req.params.slug))
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) return res.status(409).json({ error: `Section already exists: ${name}` })
    console.error('POST pillar error:', err.message)
    res.status(500).json({ error: 'Failed to create section' })
  }
})

// PATCH /api/tenants/:slug/pillars/:id — body { name?, position? }.
// A rename reaches tasks and templates through the ON UPDATE CASCADE foreign
// key; operator_groups is an array and is rewritten here, in the same
// transaction.
router.patch('/:slug/pillars/:id', requireSuperadmin, async (req, res) => {
  const { name, position } = req.body
  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    return res.status(400).json({ error: 'name must be non-empty' })
  }
  if (position !== undefined && !Number.isInteger(position)) {
    return res.status(400).json({ error: 'position must be an integer' })
  }
  if (name === undefined && position === undefined) return res.status(400).json({ error: 'Nothing to update' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: [pillar] } = await client.query(
      `SELECT p.* FROM pillars p JOIN tenants t ON t.id = p.tenant_id
       WHERE p.id = $1 AND t.slug = $2 FOR UPDATE OF p`,
      [req.params.id, req.params.slug],
    )
    if (!pillar) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Section not found' })
    }
    if (name !== undefined && name.trim() !== pillar.name) {
      await client.query('UPDATE pillars SET name = $2 WHERE id = $1', [pillar.id, name.trim()])
      await client.query(
        `UPDATE memberships SET operator_groups = array_replace(operator_groups, $2, $3)
         WHERE tenant_id = $1 AND $2 = ANY(operator_groups)`,
        [pillar.tenant_id, pillar.name, name.trim()],
      )
    }
    if (position !== undefined) {
      await client.query('UPDATE pillars SET position = $2 WHERE id = $1', [pillar.id, position])
    }
    await client.query('COMMIT')
    res.json(await loadTenant(req.params.slug))
  } catch (err) {
    await client.query('ROLLBACK')
    if (err.code === UNIQUE_VIOLATION) return res.status(409).json({ error: `Section already exists: ${name}` })
    console.error('PATCH pillar error:', err.message)
    res.status(500).json({ error: 'Failed to update section' })
  } finally {
    client.release()
  }
})

// DELETE /api/tenants/:slug/pillars/:id — only a section with no tasks or
// templates (FK RESTRICT). It is also dropped from operator scopes.
router.delete('/:slug/pillars/:id', requireSuperadmin, async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: [pillar] } = await client.query(
      `DELETE FROM pillars p USING tenants t
       WHERE p.id = $1 AND t.id = p.tenant_id AND t.slug = $2
       RETURNING p.tenant_id, p.name`,
      [req.params.id, req.params.slug],
    )
    if (!pillar) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Section not found' })
    }
    await client.query(
      `UPDATE memberships SET operator_groups = array_remove(operator_groups, $2)
       WHERE tenant_id = $1 AND $2 = ANY(operator_groups)`,
      [pillar.tenant_id, pillar.name],
    )
    await client.query('COMMIT')
    res.json(await loadTenant(req.params.slug))
  } catch (err) {
    await client.query('ROLLBACK')
    if (err.code === FK_VIOLATION) {
      return res.status(409).json({ error: 'Section still has tasks or recurring templates' })
    }
    console.error('DELETE pillar error:', err.message)
    res.status(500).json({ error: 'Failed to delete section' })
  } finally {
    client.release()
  }
})

export default router
