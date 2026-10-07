// Microsoft Entra ID JWT validation middleware.
// Validates Bearer tokens issued by the configured Mauden tenant against the
// app's API audience, using Microsoft's public JWKS endpoint.
//
// Behaviour is gated by AUTH_ENABLED — when false, requireAuth is a no-op so
// the app keeps working in demo mode until the IT team finishes the Entra
// app registration.

import jwt from 'jsonwebtoken'
import jwksClient from 'jwks-rsa'
import pool from './db.js'

// `let` + setter for the same reason as setTokenVerifier: tests flip it.
export let AUTH_ENABLED = process.env.AUTH_ENABLED === 'true'
export function setAuthEnabled(v) { AUTH_ENABLED = v }

const TENANT_ID = process.env.AZURE_TENANT_ID || ''
const CLIENT_ID = process.env.AZURE_CLIENT_ID || ''
// Audience the backend will accept. Defaults to `api://<client-id>` which is
// the format Entra emits when you expose a custom API in the app registration.
const AUDIENCE = process.env.AZURE_API_AUDIENCE || (CLIENT_ID ? `api://${CLIENT_ID}` : '')

// Accept both v2 and v1 issuers. Entra emits v1 access tokens by default;
// switching to v2 requires `accessTokenAcceptedVersion: 2` in the app
// manifest, which not all tenants set. Both shapes are valid.
const ISSUERS = TENANT_ID ? [
  `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
  `https://sts.windows.net/${TENANT_ID}/`,
] : []
const JWKS_URI = TENANT_ID ? `https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys` : ''

const client = AUTH_ENABLED && JWKS_URI
  ? jwksClient({ jwksUri: JWKS_URI, cache: true, rateLimit: true })
  : null

function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err)
    callback(null, key.getPublicKey())
  })
}

function entraVerifyToken(token) {
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getKey,
      { audience: AUDIENCE, issuer: ISSUERS, algorithms: ['RS256'] },
      (err, decoded) => (err ? reject(err) : resolve(decoded)),
    )
  })
}

// Swappable only so the test suite can authenticate fake users without
// Entra. Production never calls setTokenVerifier.
let verifyToken = entraVerifyToken
export function setTokenVerifier(fn) { verifyToken = fn || entraVerifyToken }

/**
 * Express middleware. When auth is enabled, requires a valid Bearer token
 * and attaches `req.user = { email, name, oid, roles }`.
 */
export function requireAuth(req, res, next) {
  if (!AUTH_ENABLED) return next()

  const header = req.headers.authorization || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (!match) return res.status(401).json({ error: 'Missing bearer token' })

  verifyToken(match[1])
    .then((decoded) => {
      req.user = {
        email: decoded.preferred_username || decoded.upn || decoded.email || null,
        name: decoded.name || null,
        oid: decoded.oid || decoded.sub || null,
        // App roles assigned in Entra surface here. Empty until IT configures them.
        roles: Array.isArray(decoded.roles) ? decoded.roles : [],
        raw: decoded,
      }
      next()
    })
    .catch((err) => {
      console.warn('JWT verification failed:', err.message)
      res.status(401).json({ error: 'Invalid token' })
    })
}

/**
 * Loads the caller's global identity from `users` into req.userCtx:
 * { email, isSuperadmin, homeTenantId }. Board-level role lives in
 * `memberships` and is loaded per request by loadBoard.
 *
 * Demo mode (AUTH_ENABLED=false) → superadmin with no email: everything is
 * permitted, as before multi-tenancy.
 */
export async function loadUserContext(req, res, next) {
  if (!AUTH_ENABLED) {
    req.userCtx = { email: null, isSuperadmin: true, homeTenantId: null, demo: true }
    return next()
  }
  if (!req.user) return res.status(401).json({ error: 'Unauthenticated' })

  const email = req.user.email
  req.userCtx = { email, isSuperadmin: false, homeTenantId: null }
  if (!email) return next()

  try {
    const { rows } = await pool.query(
      'SELECT is_superadmin, home_tenant_id FROM users WHERE email = $1',
      [email],
    )
    if (rows.length > 0) {
      req.userCtx.isSuperadmin = rows[0].is_superadmin === true
      req.userCtx.homeTenantId = rows[0].home_tenant_id
    }
    next()
  } catch (err) {
    console.error('loadUserContext error:', err.message)
    res.status(500).json({ error: 'Authorization context load failed' })
  }
}

/** Gate for global administration: boards, sections, users. */
export function requireSuperadmin(req, res, next) {
  if (!req.userCtx) return res.status(500).json({ error: 'User context missing (loadUserContext not chained)' })
  if (!req.userCtx.isSuperadmin) return res.status(403).json({ error: 'Superadmin role required' })
  next()
}

/**
 * Resolves the board from the `:slug` route param and the caller's role on it.
 * Sets req.tenant = { id, slug, name, settings } and
 * req.boardCtx = { role: 'admin' | 'viewer' | null, operatorGroups, member }.
 *
 * Visibility is permissive for now (decision 2026-10-07): any authenticated
 * user can READ any board. `member` says whether they belong to it (owner
 * picker, on-call); `role` decides writes. A superadmin acts as admin
 * everywhere without being a member.
 */
export async function loadBoard(req, res, next) {
  try {
    const { rows: [tenant] } = await pool.query(
      'SELECT id, slug, name, settings FROM tenants WHERE slug = $1',
      [req.params.slug],
    )
    if (!tenant) return res.status(404).json({ error: `Unknown board: ${req.params.slug}` })
    req.tenant = tenant

    let membership = null
    if (req.userCtx.email) {
      const { rows } = await pool.query(
        'SELECT role, operator_groups FROM memberships WHERE tenant_id = $1 AND email = $2',
        [tenant.id, req.userCtx.email],
      )
      membership = rows[0] || null
    }
    req.boardCtx = {
      role: req.userCtx.isSuperadmin ? 'admin' : (membership ? membership.role : null),
      operatorGroups: membership && Array.isArray(membership.operator_groups) ? membership.operator_groups : [],
      member: membership !== null,
    }
    next()
  } catch (err) {
    console.error('loadBoard error:', err.message)
    res.status(500).json({ error: 'Board context load failed' })
  }
}

/** True when the board has the feature switched on in tenants.settings. */
export function boardFeature(tenant, name) {
  return tenant?.settings?.features?.[name] === true
}

/** Gate for board administration (members, recurring, reset, on-call). */
export function requireBoardAdmin(req, res, next) {
  if (!req.boardCtx) return res.status(500).json({ error: 'Board context missing (loadBoard not chained)' })
  if (req.boardCtx.role !== 'admin') return res.status(403).json({ error: 'Board admin role required' })
  next()
}

/**
 * Pure helper. True when the caller can write tasks/subtasks in the given
 * section of the current board: board admins everywhere on it, viewers with
 * that section in their operator_groups, nobody else.
 */
export function canWrite(boardCtx, group) {
  if (!boardCtx) return false
  if (boardCtx.role === 'admin') return true
  return Array.isArray(boardCtx.operatorGroups) && boardCtx.operatorGroups.includes(group)
}

/** True when `name` is a section of the board. */
export async function isPillar(tenantId, name) {
  if (typeof name !== 'string' || !name) return false
  const { rows } = await pool.query(
    'SELECT 1 FROM pillars WHERE tenant_id = $1 AND name = $2',
    [tenantId, name],
  )
  return rows.length > 0
}
