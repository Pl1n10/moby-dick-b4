import { Router } from 'express'
import pool from '../db.js'
import { requireBoardAdmin, isPillar } from '../auth.js'
import { syncIntegration } from '../integrations/sync.js'
import { getProvider, listProviders } from '../integrations/providers/index.js'

// Mounted at /api/t/:slug/integrations, after loadBoard. Board admins (and the
// superadmin, admin everywhere) manage the integrations of THEIR board: the
// session is an account of whoever connects it, and the sync writes only on
// this board. Every query filters on req.tenant.id: an integration id from
// another board behaves as not found.
// Credentials are WRITE-ONLY: no response ever contains them.

const router = Router()
router.use(requireBoardAdmin)

const SELECT = `
  SELECT i.*,
         (SELECT COALESCE(array_agg(vc.status), '{}') FROM vendor_cases vc
          WHERE vc.integration_id = i.id AND vc.tenant_id = i.tenant_id) AS case_statuses
  FROM integrations i`

function toClient(row) {
  const provider = getProvider(row.provider)
  return {
    id: row.id,
    provider: row.provider,
    providerLabel: provider?.label || row.provider,
    name: row.name,
    enabled: row.enabled === true,
    group: row.group_name ?? null,
    hasSession: provider ? provider.hasSession(row.credentials) : false,
    sessionSetAt: row.session_set_at ?? null,
    sessionSetBy: row.session_set_by ?? null,
    lastSyncAt: row.last_sync_at ?? null,
    lastOkAt: row.last_ok_at ?? null,
    lastError: row.last_error ?? null,
    // "Open" is the provider's call (statuses differ per portal).
    openCases: provider ? (row.case_statuses || []).filter(st => provider.isOpen({ status: st })).length : 0,
  }
}

async function loadOne(tenantId, id) {
  const { rows: [row] } = await pool.query(`${SELECT} WHERE i.id = $1 AND i.tenant_id = $2`, [id, tenantId])
  return row || null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

router.param('id', (req, res, next, id) => {
  if (!UUID.test(id)) return res.status(404).json({ error: 'Integration not found' })
  next()
})

function cleanName(v) {
  return typeof v === 'string' ? v.trim().slice(0, 80) : ''
}

async function validate(req, res, { name, group }) {
  if (name !== undefined && !cleanName(name)) {
    res.status(400).json({ error: 'Il nome non può essere vuoto' })
    return false
  }
  if (group !== undefined && group !== null && !(await isPillar(req.tenant.id, group))) {
    res.status(400).json({ error: `Unknown section: ${group}` })
    return false
  }
  return true
}

// GET /api/t/:slug/integrations/providers — portals that can be connected.
router.get('/providers', (req, res) => res.json(listProviders()))

// GET /api/t/:slug/integrations — the board's integrations.
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`${SELECT} WHERE i.tenant_id = $1 ORDER BY i.created_at`, [req.tenant.id])
    res.json(rows.map(toClient))
  } catch (err) {
    console.error('GET integrations error:', err.message)
    res.status(500).json({ error: 'Failed to load integrations' })
  }
})

// POST /api/t/:slug/integrations — { provider, name, group? }. Starts off,
// without a session: the admin pastes it, then switches it on.
router.post('/', async (req, res) => {
  const { provider: providerId, name, group = null } = req.body
  if (!getProvider(providerId)) return res.status(400).json({ error: `Unknown provider: ${providerId}` })
  if (!(await validate(req, res, { name: name ?? '', group }))) return
  try {
    const { rows: [row] } = await pool.query(
      `INSERT INTO integrations (tenant_id, provider, name, group_name) VALUES ($1, $2, $3, $4) RETURNING id`,
      [req.tenant.id, providerId, cleanName(name), group],
    )
    res.status(201).json(toClient(await loadOne(req.tenant.id, row.id)))
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Esiste già un\'integrazione con questo nome su questa lavagna' })
    console.error('POST integration error:', err.message)
    res.status(500).json({ error: 'Failed to create integration' })
  }
})

// PATCH /api/t/:slug/integrations/:id — { name?, enabled?, group?, credential? }.
// A new credential replaces the whole session and clears the last error.
router.patch('/:id', async (req, res) => {
  const { name, enabled, group, credential } = req.body
  if (enabled !== undefined && typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled must be a boolean' })
  }
  if (!(await validate(req, res, { name, group }))) return
  try {
    const row = await loadOne(req.tenant.id, req.params.id)
    if (!row) return res.status(404).json({ error: 'Integration not found' })

    let creds = null
    if (credential !== undefined) {
      creds = getProvider(row.provider)?.credentialsFrom(credential)
      if (!creds) {
        return res.status(400).json({ error: 'La sessione incollata non ha il formato atteso: copia solo il Value del cookie.' })
      }
    }

    const sets = []
    const vals = [row.id, req.tenant.id]
    const set = (sql, v) => { vals.push(v); sets.push(sql.replace('?', `$${vals.length}`)) }
    if (name !== undefined) set('name = ?', cleanName(name))
    if (enabled !== undefined) set('enabled = ?', enabled)
    if (group !== undefined) set('group_name = ?', group)
    if (creds) {
      set('credentials = ?', JSON.stringify(creds))
      set('session_set_by = ?', req.userCtx.email || 'demo')
      sets.push('session_set_at = NOW()', 'last_error = NULL')
    }
    if (sets.length) {
      await pool.query(`UPDATE integrations SET ${sets.join(', ')} WHERE id = $1 AND tenant_id = $2`, vals)
    }
    res.json(toClient(await loadOne(req.tenant.id, row.id)))
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Esiste già un\'integrazione con questo nome su questa lavagna' })
    console.error('PATCH integration error:', err.message)
    res.status(500).json({ error: 'Failed to save integration' })
  }
})

// DELETE /api/t/:slug/integrations/:id — the session and the case links go;
// the mirrored tasks stay on the board, without their tab.
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM integrations WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenant.id],
    )
    if (!rowCount) return res.status(404).json({ error: 'Integration not found' })
    res.json({ ok: true })
  } catch (err) {
    console.error('DELETE integration error:', err.message)
    res.status(500).json({ error: 'Failed to delete integration' })
  }
})

// POST /api/t/:slug/integrations/:id/sync — sync now, wait for the outcome.
router.post('/:id/sync', async (req, res) => {
  try {
    const row = await loadOne(req.tenant.id, req.params.id)
    if (!row) return res.status(404).json({ error: 'Integration not found' })
    const result = await syncIntegration(row)
    res.json({ result, integration: toClient(await loadOne(req.tenant.id, row.id)) })
  } catch (err) {
    console.error('POST integration sync error:', err.message)
    res.status(500).json({ error: 'Sync failed' })
  }
})

export default router
