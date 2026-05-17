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
 * Express middleware to gate mutating endpoints behind the 'admin' role.
 * Source of truth: the `users` table (display_owner + role mapped by email).
 *
 * Chain after requireAuth so req.user is populated. In demo mode this is a
 * no-op — keeps local dev open and matches the demo behaviour of requireAuth.
 *
 * 403 codes:
 *  - "No email claim": JWT doesn't carry preferred_username/upn/email (optional
 *    claims may be missing on the app registration).
 *  - "Admin role required": user is authenticated but not in users with
 *    role='admin' — viewers and unmapped users land here.
 */
export async function requireAdmin(req, res, next) {
  if (!AUTH_ENABLED) return next()
  if (!req.user) return res.status(401).json({ error: 'Unauthenticated' })

  const email = req.user.email
  if (!email) return res.status(403).json({ error: 'No email claim in token' })

  try {
    const { rows } = await pool.query('SELECT role FROM users WHERE email = $1', [email])
    if (rows.length === 0 || rows[0].role !== 'admin') {
      return res.status(403).json({ error: 'Admin role required' })
    }
    next()
  } catch (err) {
    console.error('requireAdmin DB error:', err.message)
    res.status(500).json({ error: 'Authorization check failed' })
  }
}
