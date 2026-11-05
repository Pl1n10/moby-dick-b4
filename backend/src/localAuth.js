// Local login: email + password against the users table, with tokens signed
// by the backend itself. Stopgap for when Entra is not available (2026-11-05:
// old tenant gone, new one not under our control). Enabled with
// AUTH_ENABLED=true + AUTH_MODE=local; the rest of the app does not know the
// difference, because the token carries the same `preferred_username` claim
// an Entra token does, and identity is the email everywhere.
//
// No dependencies beyond what the backend already has: scrypt from node:crypto,
// HS256 from jsonwebtoken.

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import jwt from 'jsonwebtoken'
import pool from './db.js'

const scrypt = promisify(scryptCb)

export const AUTH_MODE = process.env.AUTH_MODE === 'local' ? 'local' : 'entra'

const ISSUER = 'kanbanops'
const AUDIENCE = 'kanbanops-local'
// Sessions last a week: a reset revokes them at once anyway (pwv below).
const TOKEN_TTL = '7d'

export const PASSWORD_MIN = 10
const PASSWORD_MAX = 200

// N=2^14, r=8 → 16 MB per hash, under Node's default scrypt memory cap.
const SCRYPT = { N: 16384, r: 8, p: 1 }
const KEY_LEN = 32

// Read at call time, not import time, so tests can set them.
function secret() {
  const s = process.env.LOCAL_AUTH_SECRET || ''
  if (s.length < 32) throw new Error('LOCAL_AUTH_SECRET missing or shorter than 32 characters')
  return s
}

export function checkLocalConfig() {
  secret()
}

/** End of the self-activation window as a Date, or null if unset/invalid. */
export function claimUntil() {
  const raw = process.env.LOCAL_AUTH_CLAIM_UNTIL || ''
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

export function claimOpen(now = new Date()) {
  const until = claimUntil()
  return until !== null && now < until
}

export async function hashPassword(password) {
  const salt = randomBytes(16)
  const key = await scrypt(password, salt, KEY_LEN, SCRYPT)
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, N, r, p, saltB64, keyB64] = parts
  const expected = Buffer.from(keyB64, 'base64')
  const key = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(N), r: Number(r), p: Number(p),
  })
  return key.length === expected.length && timingSafeEqual(key, expected)
}

/** Password handed out by a superadmin: 16 characters without look-alikes (~80 bits). */
export function generatePassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(16)
  let out = ''
  for (const b of bytes) out += alphabet[b % alphabet.length]
  return out.replace(/(.{4})(?!$)/g, '$1-')
}

export function validNewPassword(password) {
  return typeof password === 'string' && password.length >= PASSWORD_MIN && password.length <= PASSWORD_MAX
}

/**
 * `pwv` = password version (password_set_at in ms). The verifier compares it
 * with the database, so a reset, a cleared password or a deleted account
 * logs out every session issued before.
 */
export function signToken({ email, name, passwordSetAt }) {
  return jwt.sign(
    { preferred_username: email, name: name || null, pwv: new Date(passwordSetAt).getTime() },
    secret(),
    { algorithm: 'HS256', issuer: ISSUER, audience: AUDIENCE, subject: email, expiresIn: TOKEN_TTL },
  )
}

export async function localVerifyToken(token) {
  const decoded = jwt.verify(token, secret(), { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE })
  const { rows: [row] } = await pool.query(
    'SELECT password_hash, password_set_at FROM users WHERE email = $1',
    [decoded.preferred_username],
  )
  if (!row || !row.password_hash || !row.password_set_at) throw new Error('account not active')
  if (new Date(row.password_set_at).getTime() !== decoded.pwv) throw new Error('session revoked')
  return decoded
}

// Failed logins per account, in memory: 10 wrong passwords in 15 minutes
// lock that email for the rest of the window. Keyed by email, not IP: behind
// nginx and the corporate proxy every request comes from the same address.
// Unknown emails are not counted (nothing to guess there), so the map is
// bounded by the number of users.
const FAIL_WINDOW_MS = 15 * 60 * 1000
const FAIL_MAX = 10
const failures = new Map()

export function isLockedOut(email, now = Date.now()) {
  const f = failures.get(email)
  if (!f) return false
  if (now - f.first > FAIL_WINDOW_MS) { failures.delete(email); return false }
  return f.count >= FAIL_MAX
}

export function recordFailure(email, now = Date.now()) {
  const f = failures.get(email)
  if (!f || now - f.first > FAIL_WINDOW_MS) failures.set(email, { count: 1, first: now })
  else f.count += 1
}

export function clearFailures(email) {
  failures.delete(email)
}

export function resetLockouts() {
  failures.clear()
}
