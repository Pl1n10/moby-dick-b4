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

export const AUTH_ENABLED = process.env.AUTH_ENABLED === 'true'

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

// Canonical pillar list. Kept in sync with the CHECK constraint on
// tasks.group_name and the frontend src/data.js GROUPS array. Used to
// validate operator_groups values incoming from the admin UI.
export const VALID_GROUPS = ['Commvault', 'Cohesity', 'Data Domain - ZFS', 'NBU - Banche Estere']

function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err)
    callback(null, key.getPublicKey())
  })
}

function verifyToken(token) {
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getKey,
      { audience: AUDIENCE, issuer: ISSUERS, algorithms: ['RS256'] },
      (err, decoded) => (err ? reject(err) : resolve(decoded)),
    )
  })
}

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
 * Loads role + operator_groups from the users table and attaches them as
 * req.userCtx. Designed to run once per request right after requireAuth so
 * downstream handlers and middlewares can decide write access without
 * issuing extra DB queries.
 *
 * Unknown email (not in users table) → defaults to viewer with empty scope.
 * Demo mode (AUTH_ENABLED=false) → no-op, leaves req.userCtx undefined; the
 * permissive defaults of requireAdmin/requireWriteAccess take over.
 */
export async function loadUserContext(req, res, next) {
  if (!AUTH_ENABLED) {
    // Demo mode: act as admin so inline canWrite checks stay permissive,
    // matching requireAuth/requireAdmin/requireWriteAccess which are no-ops.
    req.userCtx = { role: 'admin', operatorGroups: [] }
    return next()
  }
  if (!req.user) return res.status(401).json({ error: 'Unauthenticated' })

  const email = req.user.email
  if (!email) {
    req.userCtx = { role: 'viewer', operatorGroups: [] }
    return next()
  }

  try {
    const { rows } = await pool.query(
      'SELECT role, operator_groups FROM users WHERE email = $1',
      [email],
    )
    if (rows.length === 0) {
      req.userCtx = { role: 'viewer', operatorGroups: [] }
    } else {
      req.userCtx = {
        role: rows[0].role,
        operatorGroups: Array.isArray(rows[0].operator_groups) ? rows[0].operator_groups : [],
      }
    }
    next()
  } catch (err) {
    console.error('loadUserContext error:', err.message)
    res.status(500).json({ error: 'Authorization context load failed' })
  }
}

/**
 * Express middleware to gate endpoints behind the 'admin' role.
 * Relies on loadUserContext having populated req.userCtx upstream.
 */
export function requireAdmin(req, res, next) {
  if (!AUTH_ENABLED) return next()
  if (!req.user) return res.status(401).json({ error: 'Unauthenticated' })
  if (!req.userCtx) return res.status(500).json({ error: 'User context missing (loadUserContext not chained)' })
  if (req.userCtx.role !== 'admin') {
    return res.status(403).json({ error: 'Admin role required' })
  }
  next()
}

/**
 * Pure helper. Returns true when the user can write tasks/subtasks in the
 * given pillar group: admins everywhere, viewers with that group in their
 * operator_groups, nobody else.
 */
export function canWrite(userCtx, group) {
  if (!userCtx) return false
  if (userCtx.role === 'admin') return true
  return Array.isArray(userCtx.operatorGroups) && userCtx.operatorGroups.includes(group)
}

/**
 * Middleware factory. `getGroups` is a function (req) => string | string[]
 * that extracts the pillar group(s) the request is trying to mutate. When
 * multiple groups are returned (e.g. PATCH that moves a task between groups)
 * the user must have write access on ALL of them.
 *
 * Demo mode → no-op (no enforcement off-prod).
 */
export function requireWriteAccess(getGroups) {
  return (req, res, next) => {
    if (!AUTH_ENABLED) return next()
    if (!req.userCtx) return res.status(500).json({ error: 'User context missing' })

    const raw = getGroups(req)
    const groups = Array.isArray(raw) ? raw : [raw]
    for (const g of groups) {
      if (!g) return res.status(400).json({ error: 'Group not specified' })
      if (!canWrite(req.userCtx, g)) {
        return res.status(403).json({ error: `Write access denied for group: ${g}` })
      }
    }
    next()
  }
}
