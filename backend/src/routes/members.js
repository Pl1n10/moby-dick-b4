import { Router } from 'express'
import pool from '../db.js'
import { requireBoardAdmin } from '../auth.js'

// Mounted at /api/t/:slug/members, after loadBoard. Who belongs to this
// board and with which role. GET /owners is open to any authenticated user
// (the task owner picker needs it); the rest is board-admin only — a board
// admin manages the members of their own board (decision 2026-10-07).
const router = Router()

function mapMemberToClient(row) {
  return {
    email: row.email,
    displayOwner: row.display_owner,
    role: row.role,
    operatorGroups: Array.isArray(row.operator_groups) ? row.operator_groups : [],
    isHome: row.is_home === true,
  }
}

// Validates operatorGroups against the board's sections. Returns the cleaned
// array (deduplicated) or throws an Error suitable for a 400.
async function normalizeOperatorGroups(tenantId, input) {
  if (input == null) return []
  if (!Array.isArray(input)) throw new Error('operatorGroups must be an array')
  const { rows } = await pool.query('SELECT name FROM pillars WHERE tenant_id = $1', [tenantId])
  const valid = new Set(rows.map(r => r.name))
  const cleaned = []
  for (const g of input) {
    if (typeof g !== 'string') throw new Error('operatorGroups entries must be strings')
    if (!valid.has(g)) throw new Error(`Unknown section: ${g}`)
    if (!cleaned.includes(g)) cleaned.push(g)
  }
  return cleaned
}

async function loadMember(tenantId, email) {
  const { rows: [row] } = await pool.query(
    `SELECT u.email, u.display_owner, m.role, m.operator_groups,
            (u.home_tenant_id = m.tenant_id) AS is_home
     FROM memberships m JOIN users u ON u.email = m.email
     WHERE m.tenant_id = $1 AND m.email = $2`,
    [tenantId, email],
  )
  return row ? mapMemberToClient(row) : null
}

// Self-protection: a board admin cannot demote or remove themselves (they
// would lock themselves out of their own board). A superadmin can, since
// they keep admin rights everywhere anyway.
function isSelfLockout(req, email) {
  return !req.userCtx.isSuperadmin && req.userCtx.email && req.userCtx.email === email
}

// GET /api/t/:slug/members/owners — display_owner values selectable as task
// owners on this board: members only (decision 2026-10-07, owners are per
// board). NULL display_owner hides a member from the picker.
router.get('/owners', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT u.display_owner
       FROM memberships m JOIN users u ON u.email = m.email
       WHERE m.tenant_id = $1 AND u.display_owner IS NOT NULL
       ORDER BY u.display_owner`,
      [req.tenant.id],
    )
    res.json(rows.map(r => r.display_owner))
  } catch (err) {
    console.error('GET owners error:', err.message)
    res.status(500).json({ error: 'Failed to fetch owners' })
  }
})

// GET /api/t/:slug/members — the board's members, admins first.
router.get('/', requireBoardAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.email, u.display_owner, m.role, m.operator_groups,
              (u.home_tenant_id = m.tenant_id) AS is_home
       FROM memberships m JOIN users u ON u.email = m.email
       WHERE m.tenant_id = $1
       ORDER BY (m.role = 'admin') DESC, u.display_owner NULLS LAST, u.email`,
      [req.tenant.id],
    )
    res.json(rows.map(mapMemberToClient))
  } catch (err) {
    console.error('GET members error:', err.message)
    res.status(500).json({ error: 'Failed to fetch members' })
  }
})

// PUT /api/t/:slug/members/:email — add or update a member.
// Body: { role?, operatorGroups?, displayOwner? }. A colleague who never
// logged in is pre-registered (users row) so they can be assigned tasks
// right away. displayOwner is global (users table): renaming it renames the
// person on every board.
router.put('/:email', requireBoardAdmin, async (req, res) => {
  const email = req.params.email.trim()
  const { role, operatorGroups, displayOwner } = req.body
  if (!email.includes('@')) return res.status(400).json({ error: 'Invalid email' })
  if (role !== undefined && !['admin', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'role must be admin or viewer' })
  }
  if (role === 'viewer' && isSelfLockout(req, email)) {
    return res.status(400).json({ error: 'You cannot demote yourself' })
  }

  let groups
  try {
    groups = operatorGroups === undefined ? undefined : await normalizeOperatorGroups(req.tenant.id, operatorGroups)
  } catch (e) {
    return res.status(400).json({ error: e.message })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const owner = displayOwner === undefined ? undefined
      : (displayOwner === null || String(displayOwner).trim() === '' ? null : String(displayOwner).trim())

    await client.query(
      `INSERT INTO users (email, display_owner, role) VALUES ($1, $2, 'viewer')
       ON CONFLICT (email) DO NOTHING`,
      [email, owner ?? null],
    )
    if (owner !== undefined) {
      await client.query('UPDATE users SET display_owner = $2 WHERE email = $1', [email, owner])
    }
    await client.query(
      `INSERT INTO memberships (tenant_id, email, role, operator_groups)
       VALUES ($1, $2, COALESCE($3::user_role, 'viewer'), COALESCE($4::text[], '{}'))
       ON CONFLICT (tenant_id, email) DO UPDATE
         SET role            = COALESCE($3::user_role, memberships.role),
             operator_groups = COALESCE($4::text[], memberships.operator_groups)`,
      [req.tenant.id, email, role ?? null, groups ?? null],
    )
    await client.query('COMMIT')
    res.json(await loadMember(req.tenant.id, email))
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('PUT member error:', err.message)
    res.status(500).json({ error: 'Failed to save member' })
  } finally {
    client.release()
  }
})

// DELETE /api/t/:slug/members/:email — remove from this board only. The user
// keeps their account, other boards and read access; they disappear from
// this board's owner picker. Tasks they own keep the name as plain text.
router.delete('/:email', requireBoardAdmin, async (req, res) => {
  const email = req.params.email.trim()
  if (isSelfLockout(req, email)) return res.status(400).json({ error: 'You cannot remove yourself' })
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM memberships WHERE tenant_id = $1 AND email = $2',
      [req.tenant.id, email],
    )
    if (rowCount === 0) return res.status(404).json({ error: 'Member not found' })
    res.json({ ok: true })
  } catch (err) {
    console.error('DELETE member error:', err.message)
    res.status(500).json({ error: 'Failed to remove member' })
  }
})

export default router
