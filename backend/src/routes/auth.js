import { Router } from 'express'
import pool from '../db.js'
import {
  AUTH_MODE, LOCAL_LOGIN, PASSWORD_MIN, entraDomains, mustUseMicrosoft, claimOpen, claimUntil, verifyPassword, hashPassword, validNewPassword,
  weakPasswordReason, signToken, isLockedOut, recordFailure, clearFailures, globalLocked, recordGlobalFailure,
  clientIp, ipLocked, recordIpFailure,
} from '../localAuth.js'

// Mounted at /api/auth, PUBLIC (no requireAuth): it is how a token is obtained.
// Only meaningful with AUTH_MODE=local or hybrid; in Entra mode login/claim
// answer 404. In hybrid mode the tenant's domains are refused here: they sign
// in with Microsoft.
//
// Error bodies carry a `code` the login screen branches on, and an Italian
// `error` it shows as is.
const router = Router()

// One line per attempt in `docker logs moby-api`: the audit trail for
// spotting an account used by someone else. `ip` is the trusted hop (see
// clientIp); `xff` is the raw chain, kept so the hop count can be checked.
function audit(req, event, email, detail = '') {
  const xff = String(req.headers['x-forwarded-for'] || '')
  console.log(`Local auth: ${event} email=${JSON.stringify(email || '')} ip=${clientIp(req)} xff=${JSON.stringify(xff)}${detail ? ` ${detail}` : ''}`)
}

// Every failed attempt counts against the caller's IP and the site-wide cap.
function failed(req) {
  recordIpFailure(clientIp(req))
  recordGlobalFailure()
}

function ipGate(req, res) {
  if (!ipLocked(clientIp(req))) return false
  res.status(429).json({ code: 'ip_locked', error: 'Troppi tentativi falliti da questa rete: riprova tra 15 minuti.' })
  return true
}

function normEmail(v) {
  return typeof v === 'string' ? v.trim() : ''
}

async function findUser(email) {
  const { rows: [row] } = await pool.query(
    `SELECT id, email, display_owner, is_superadmin, password_hash, password_set_at
     FROM users WHERE lower(email) = lower($1)
     ORDER BY created_at LIMIT 1`,
    [email],
  )
  return row || null
}

function session(row) {
  return {
    token: signToken({ email: row.email, name: row.display_owner, passwordSetAt: row.password_set_at }),
    user: { email: row.email, name: row.display_owner },
  }
}

// GET /api/auth/config — what the login screen should offer.
router.get('/config', (req, res) => {
  const until = claimUntil()
  res.json({
    mode: AUTH_MODE,
    claimOpen: LOCAL_LOGIN && claimOpen(),
    claimUntil: until ? until.toISOString() : null,
    // Hybrid: the login screen sends these straight to Microsoft.
    entraDomains: entraDomains(),
    passwordMin: PASSWORD_MIN,
  })
})

router.use((req, res, next) => {
  if (!LOCAL_LOGIN) return res.status(404).json({ error: 'Local login is not enabled' })
  next()
})

const USE_MICROSOFT = {
  code: 'use_microsoft',
  error: 'Questo account entra con Microsoft: usa «Accedi con Microsoft».',
}

const NOT_REGISTERED = {
  code: 'not_registered',
  error: 'Email non registrata: chiedi a un amministratore di aggiungerti.',
}

// POST /api/auth/login — body { email, password }.
router.post('/login', async (req, res) => {
  const email = normEmail(req.body.email)
  const password = typeof req.body.password === 'string' ? req.body.password : ''
  if (!email || !password) return res.status(400).json({ code: 'missing', error: 'Inserisci email e password.' })
  // Before any lookup or password check: answered the same whether the
  // account exists or not, and never a guess worth counting.
  if (mustUseMicrosoft(email)) {
    audit(req, 'login_refused', email, 'reason=use_microsoft')
    return res.status(403).json(USE_MICROSOFT)
  }

  if (ipGate(req, res)) return audit(req, 'login_refused', email, 'reason=ip_locked')
  if (globalLocked()) {
    audit(req, 'login_refused', email, 'reason=global_pause')
    return res.status(429).json({ code: 'paused', error: 'Troppi tentativi falliti sul sito: riprova tra qualche minuto.' })
  }

  try {
    const user = await findUser(email)
    if (!user) {
      failed(req)
      audit(req, 'login_failed', email, 'reason=not_registered')
      return res.status(401).json(NOT_REGISTERED)
    }
    const key = user.email.toLowerCase()
    if (isLockedOut(key)) {
      audit(req, 'login_refused', user.email, 'reason=locked')
      return res.status(429).json({ code: 'locked', error: 'Troppi tentativi sbagliati: riprova tra 15 minuti.' })
    }
    if (!user.password_hash) {
      audit(req, 'login_failed', user.email, 'reason=not_activated')
      return res.status(401).json({
        code: 'not_activated',
        error: claimOpen()
          ? 'Account non ancora attivato: scegli la tua password con «Primo accesso».'
          : 'Account non ancora attivato: chiedi a un amministratore una password.',
      })
    }
    if (!(await verifyPassword(password, user.password_hash))) {
      recordFailure(key)
      failed(req)
      audit(req, 'login_failed', user.email, 'reason=wrong_password')
      return res.status(401).json({ code: 'wrong_password', error: 'Password errata.' })
    }
    clearFailures(key)
    audit(req, 'login_ok', user.email)
    res.json(session(user))
  } catch (err) {
    console.error('POST /api/auth/login error:', err.message)
    res.status(500).json({ error: 'Login non riuscito' })
  }
})

// POST /api/auth/claim — body { email, password }. First access during the
// claim window: the user picks their password, once. Afterwards it is locked
// and only a superadmin can set a new one (POST /api/users/:id/password).
router.post('/claim', async (req, res) => {
  if (!claimOpen()) {
    return res.status(403).json({ code: 'claim_closed', error: 'L\'attivazione libera è chiusa: chiedi a un amministratore una password.' })
  }
  if (ipGate(req, res)) return audit(req, 'claim_refused', normEmail(req.body.email), 'reason=ip_locked')
  const email = normEmail(req.body.email)
  const password = req.body.password
  if (!email) return res.status(400).json({ code: 'missing', error: 'Inserisci la tua email.' })
  if (mustUseMicrosoft(email)) {
    audit(req, 'claim_refused', email, 'reason=use_microsoft')
    return res.status(403).json(USE_MICROSOFT)
  }
  if (!validNewPassword(password)) {
    return res.status(400).json({ code: 'weak_password', error: `La password deve avere almeno ${PASSWORD_MIN} caratteri.` })
  }
  const weak = weakPasswordReason(password, email)
  if (weak) return res.status(400).json({ code: 'weak_password', error: weak })

  try {
    const user = await findUser(email)
    if (!user) {
      // Sweeping emails to find claimable accounts costs attempts too.
      recordIpFailure(clientIp(req))
      audit(req, 'claim_failed', email, 'reason=not_registered')
      return res.status(404).json(NOT_REGISTERED)
    }
    // Whoever claims first owns the account: for a superadmin that would be
    // the whole console. Their password is set on the VM only
    // (src/scripts/set-password.js).
    if (user.is_superadmin && !user.password_hash) {
      audit(req, 'claim_refused', user.email, 'reason=superadmin')
      return res.status(403).json({
        code: 'superadmin_cli',
        error: 'Gli account super admin non si attivano da qui: la password si imposta dalla VM.',
      })
    }
    const hash = await hashPassword(password)
    // The IS NULL guard makes two concurrent claims on the same account
    // resolve to one winner.
    const { rows: [row] } = await pool.query(
      `UPDATE users SET password_hash = $2, password_set_at = NOW(), password_set_by = 'self'
       WHERE id = $1 AND password_hash IS NULL
       RETURNING id, email, display_owner, password_set_at`,
      [user.id, hash],
    )
    if (!row) {
      // Worth a look: either a double click, or someone else got there first.
      audit(req, 'claim_refused', user.email, 'reason=already_active')
      return res.status(409).json({
        code: 'already_active',
        error: 'Questo account ha già una password. Se non l\'hai scelta tu, avvisa subito un amministratore.',
      })
    }
    audit(req, 'claim_ok', row.email)
    res.json(session(row))
  } catch (err) {
    console.error('POST /api/auth/claim error:', err.message)
    res.status(500).json({ error: 'Attivazione non riuscita' })
  }
})

export default router
