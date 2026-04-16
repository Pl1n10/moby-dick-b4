// Microsoft Entra ID JWT validation middleware.
// Validates Bearer tokens issued by the configured Mauden tenant against the
// app's API audience, using Microsoft's public JWKS endpoint.
//
// Behaviour is gated by AUTH_ENABLED — when false, requireAuth is a no-op so
// the app keeps working in demo mode until the IT team finishes the Entra
// app registration.

import jwt from 'jsonwebtoken'
import jwksClient from 'jwks-rsa'

export const AUTH_ENABLED = process.env.AUTH_ENABLED === 'true'

const TENANT_ID = process.env.AZURE_TENANT_ID || ''
const CLIENT_ID = process.env.AZURE_CLIENT_ID || ''
// Audience the backend will accept. Defaults to `api://<client-id>` which is
// the format Entra emits when you expose a custom API in the app registration.
const AUDIENCE = process.env.AZURE_API_AUDIENCE || (CLIENT_ID ? `api://${CLIENT_ID}` : '')

const ISSUER = TENANT_ID ? `https://login.microsoftonline.com/${TENANT_ID}/v2.0` : ''
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
      { audience: AUDIENCE, issuer: ISSUER, algorithms: ['RS256'] },
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
