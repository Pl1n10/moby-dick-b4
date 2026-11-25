// Local login: email + password against the users table, with tokens signed
// by the backend itself. Born as a stopgap for when Entra was not available
// (2026-11-05: old tenant gone, new one not under our control). Enabled with
// AUTH_ENABLED=true + AUTH_MODE=local, or AUTH_MODE=hybrid next to Entra; the rest of the app does not know the
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

// 'entra' (Microsoft only), 'local' (email + password only) or 'hybrid'
// (2026-11-25): Microsoft for the accounts of the tenant's domains
// (ENTRA_DOMAINS), email + password for everyone else (external colleagues,
// e.g. the incoming management with addresses outside the tenant).
export const AUTH_MODE = ['local', 'hybrid'].includes(process.env.AUTH_MODE) ? process.env.AUTH_MODE : 'entra'

/** True when the email + password login is offered at all. */
export const LOCAL_LOGIN = AUTH_MODE !== 'entra'

/** Domains whose accounts must sign in with Microsoft (hybrid mode), lowercase. */
export function entraDomains() {
  if (AUTH_MODE !== 'hybrid') return []
  return (process.env.ENTRA_DOMAINS || '')
    .split(',').map(d => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean)
}

/**
 * Hybrid mode: an account of the tenant has one way in, Microsoft. A local
 * password next to it would be a second, weaker door (and the ones chosen
 * during the local-only period, 2026-11-05 → hybrid, stay in the database).
 */
export function mustUseMicrosoft(email) {
  const domain = String(email || '').toLowerCase().split('@')[1] || ''
  return Boolean(domain) && entraDomains().includes(domain)
}

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
  // Hybrid without the list would let tenant accounts in with a password:
  // fail closed.
  if (AUTH_MODE === 'hybrid' && entraDomains().length === 0) {
    throw new Error('AUTH_MODE=hybrid needs ENTRA_DOMAINS (e.g. mauden.com)')
  }
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

// Passwords someone spraying the login would try first. Compared after
// lowercasing and dropping digits and symbols, so "Mauden2026!" and
// "password1234" are both caught.
const OBVIOUS_WORDS = [
  'password', 'passw', 'mauden', 'kanbanops', 'kanban', 'backup', 'qwerty', 'azerty',
  'asdfgh', 'abcdef', 'letmein', 'welcome', 'benvenuto', 'admin', 'changeme', 'cambiami',
  'ciao', 'estate', 'inverno', 'autunno', 'primavera', 'gennaio', 'febbraio', 'marzo', 'aprile',
  'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
  'commvault', 'cohesity', 'netbackup', 'service', 'manager',
]

/** Reason (Italian) why a chosen password is too guessable, or null if fine. */
export function weakPasswordReason(password, email = '') {
  const lower = password.toLowerCase()
  const letters = lower.replace(/[^a-zà-ÿ]/g, '')
  if (new Set(lower).size < 4) return 'La password ha troppi caratteri ripetuti.'
  if (/^[0-9\W_]+$/.test(password)) return 'La password non può essere fatta solo di numeri e simboli.'
  if (/(0123|1234|2345|3456|4567|5678|6789|abcd|qwer|asdf)/.test(lower) && letters.length < 6) {
    return 'La password è una sequenza troppo prevedibile.'
  }
  const local = email.toLowerCase().split('@')[0] || ''
  const nameParts = local.split(/[._-]+/).filter(p => p.length >= 3)
  if (nameParts.some(p => lower.includes(p))) return 'La password non può contenere il tuo nome o cognome.'
  if (OBVIOUS_WORDS.some(w => letters === w || (letters.length - w.length <= 2 && letters.includes(w)))) {
    return 'La password è troppo facile da indovinare: evita parole come "password", "mauden" o il nome di un mese.'
  }
  return null
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
  // Sessions opened with a password before the switch to hybrid die with it.
  if (mustUseMicrosoft(decoded.preferred_username)) throw new Error('account must sign in with Microsoft')
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

// Site-wide cap: the per-email lock does not stop one obvious password tried
// on every account (password spraying) or a sweep of guessed emails. Past
// GLOBAL_MAX failed logins of any kind in 15 minutes, every login is refused
// until the oldest failures age out. Sessions already open keep working
// (they last a week), so the worst an attacker gets is a pause on new logins.
export const GLOBAL_MAX = 50
let globalFailures = []
let globalTripLogged = false

function pruneGlobal(now) {
  while (globalFailures.length && now - globalFailures[0] > FAIL_WINDOW_MS) globalFailures.shift()
  if (globalFailures.length < GLOBAL_MAX) globalTripLogged = false
}

export function globalLocked(now = Date.now()) {
  pruneGlobal(now)
  return globalFailures.length >= GLOBAL_MAX
}

export function recordGlobalFailure(now = Date.now()) {
  pruneGlobal(now)
  if (globalFailures.length < GLOBAL_MAX) globalFailures.push(now)
  if (globalFailures.length >= GLOBAL_MAX && !globalTripLogged) {
    globalTripLogged = true
    console.warn(`Local auth: ${GLOBAL_MAX} failed logins in 15 minutes, new logins paused (possible attack)`)
  }
}

// Client IP that the proxies in front of us vouch for. X-Forwarded-For is a
// list each proxy appends to, so its left end is whatever the client sent
// (verified 2026-11-05: a forged "1.2.3.4" came through first). Only the
// entries added by our own proxies are trustworthy, counted from the right:
// TRUST_PROXY_HOPS = how many proxies append to it (default 2: the Mauden
// reverse proxy adds the client, our nginx adds the reverse proxy).
export function clientIp(req) {
  const hops = Math.max(1, Number.parseInt(process.env.TRUST_PROXY_HOPS || '2', 10) || 2)
  const chain = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean)
  if (chain.length >= hops) return chain[chain.length - hops]
  return chain[0] || req.socket?.remoteAddress || ''
}

// Per-IP failures: the fail2ban of this app. A ban on the VM firewall would
// hit the reverse proxy, i.e. everyone; here the IP is the one the proxy saw.
// 20 failed logins/claims from one IP in 15 minutes block that IP for the
// rest of the window. Bounded: past IP_MAP_MAX addresses the oldest go.
const IP_FAIL_MAX = 20
const IP_MAP_MAX = 10000
const ipFailures = new Map()

export function ipLocked(ip, now = Date.now()) {
  const f = ipFailures.get(ip)
  if (!f) return false
  if (now - f.first > FAIL_WINDOW_MS) { ipFailures.delete(ip); return false }
  return f.count >= IP_FAIL_MAX
}

export function recordIpFailure(ip, now = Date.now()) {
  if (!ip) return
  const f = ipFailures.get(ip)
  if (!f || now - f.first > FAIL_WINDOW_MS) {
    ipFailures.delete(ip)
    if (ipFailures.size >= IP_MAP_MAX) ipFailures.delete(ipFailures.keys().next().value)
    ipFailures.set(ip, { count: 1, first: now })
  } else {
    f.count += 1
    if (f.count === IP_FAIL_MAX) console.warn(`Local auth: ip=${ip} blocked for 15 minutes after ${IP_FAIL_MAX} failures`)
  }
}

export function resetLockouts() {
  failures.clear()
  ipFailures.clear()
  globalFailures = []
  globalTripLogged = false
}
