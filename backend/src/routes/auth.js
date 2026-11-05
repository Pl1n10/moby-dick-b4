import { Router } from 'express'
import pool from '../db.js'
import {
  AUTH_MODE, PASSWORD_MIN, claimOpen, claimUntil, verifyPassword, hashPassword, validNewPassword,
  signToken, isLockedOut, recordFailure, clearFailures,
} from '../localAuth.js'

// Mounted at /api/auth, PUBLIC (no requireAuth): it is how a token is obtained.
// Only meaningful with AUTH_MODE=local; in Entra mode login/claim answer 404.
//
// Error bodies carry a `code` the login screen branches on, and an Italian
// `error` it shows as is.
const router = Router()

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
    claimOpen: AUTH_MODE === 'local' && claimOpen(),
    claimUntil: until ? until.toISOString() : null,
    passwordMin: PASSWORD_MIN,
  })
})

router.use((req, res, next) => {
  if (AUTH_MODE !== 'local') return res.status(404).json({ error: 'Local login is not enabled' })
  next()
})

const NOT_REGISTERED = {
  code: 'not_registered',
  error: 'Email non registrata: chiedi a un amministratore di aggiungerti.',
}

// POST /api/auth/login — body { email, password }.
router.post('/login', async (req, res) => {
  const email = normEmail(req.body.email)
  const password = typeof req.body.password === 'string' ? req.body.password : ''
  if (!email || !password) return res.status(400).json({ code: 'missing', error: 'Inserisci email e password.' })

  try {
    const user = await findUser(email)
    if (!user) return res.status(401).json(NOT_REGISTERED)
    const key = user.email.toLowerCase()
    if (isLockedOut(key)) {
      return res.status(429).json({ code: 'locked', error: 'Troppi tentativi sbagliati: riprova tra 15 minuti.' })
    }
    if (!user.password_hash) {
      return res.status(401).json({
        code: 'not_activated',
        error: claimOpen()
          ? 'Account non ancora attivato: scegli la tua password con «Primo accesso».'
          : 'Account non ancora attivato: chiedi a un amministratore una password.',
      })
    }
    if (!(await verifyPassword(password, user.password_hash))) {
      recordFailure(key)
      return res.status(401).json({ code: 'wrong_password', error: 'Password errata.' })
    }
    clearFailures(key)
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
  const email = normEmail(req.body.email)
  const password = req.body.password
  if (!email) return res.status(400).json({ code: 'missing', error: 'Inserisci la tua email.' })
  if (!validNewPassword(password)) {
    return res.status(400).json({ code: 'weak_password', error: `La password deve avere almeno ${PASSWORD_MIN} caratteri.` })
  }

  try {
    const user = await findUser(email)
    if (!user) return res.status(404).json(NOT_REGISTERED)
    // Whoever claims first owns the account: for a superadmin that would be
    // the whole console. Their password is set on the VM only
    // (src/scripts/set-password.js).
    if (user.is_superadmin && !user.password_hash) {
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
      return res.status(409).json({
        code: 'already_active',
        error: 'Questo account ha già una password. Se non l\'hai scelta tu, avvisa subito un amministratore.',
      })
    }
    console.log(`Local auth: ${row.email} activated their account`)
    res.json(session(row))
  } catch (err) {
    console.error('POST /api/auth/claim error:', err.message)
    res.status(500).json({ error: 'Attivazione non riuscita' })
  }
})

export default router
