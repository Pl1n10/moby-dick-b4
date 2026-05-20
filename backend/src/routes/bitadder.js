import { Router } from 'express'
import pool from '../db.js'

// Bit Adder — easter egg clicker game.
// Mounted at /api/bitadder (requireAuth + loadUserContext applied app-level).
// State per utente in tabella bit_adder. Server è authoritative sui bit:
// il client batcha i delta ogni ~5s, qui validiamo che siano plausibili
// (rate cap manuale + rate cap bot con margine 50%) e clampiamo se necessario.

const router = Router()

// Prezzo del prossimo bot dato il numero attualmente posseduto.
// Curva Cookie Clicker (1.15^k) con base 1024 = 1 Kibit: il primo bot costa
// un'eternità di click manuali (~8 minuti a 2 click/s) — l'automazione si paga.
// Poi il roll-out esponenziale: 1024, 1177, 1354, 1557, 1790, 2059, 2367...
function nextBotPrice(bots) {
  return Math.floor(1024 * Math.pow(1.15, bots))
}

function shapeState(row) {
  const bits = Number(row.bits)
  const bots = Number(row.bots)
  return { bits, bots, nextBotPrice: nextBotPrice(bots) }
}

// Garantisce che esista una riga per l'utente corrente. Idempotente.
async function ensureRow(email) {
  await pool.query(
    `INSERT INTO bit_adder (email) VALUES ($1)
     ON CONFLICT (email) DO NOTHING`,
    [email],
  )
}

// GET /api/bitadder/me — stato corrente dell'utente (auto-INSERT alla prima
// chiamata). Risposta: { bits, bots, nextBotPrice }.
router.get('/me', async (req, res) => {
  try {
    if (!req.user || !req.user.email) return res.status(401).json({ error: 'Unauthenticated' })
    await ensureRow(req.user.email)
    const { rows } = await pool.query(
      'SELECT bits, bots FROM bit_adder WHERE email = $1',
      [req.user.email],
    )
    res.json(shapeState(rows[0]))
  } catch (err) {
    console.error('GET /api/bitadder/me error:', err.message)
    res.status(500).json({ error: 'Failed to load state' })
  }
})

// POST /api/bitadder/click — batch di click accumulati lato client.
// Body: { delta: number, elapsedSec: number }
// - delta: bit guadagnati dall'ultima sync (manuali + bot)
// - elapsedSec: tempo trascorso dall'ultima sync
// Server clampa delta a (50 * elapsedSec) + (bots * elapsedSec * 1.5) + 5 di
// buffer per arrotondamenti. Non rifiutiamo mai — silenziosamente cappiamo
// per non rompere l'esperienza in caso di tab in background, throttling, ecc.
router.post('/click', async (req, res) => {
  try {
    if (!req.user || !req.user.email) return res.status(401).json({ error: 'Unauthenticated' })
    const delta = Number(req.body?.delta)
    const elapsedSec = Number(req.body?.elapsedSec)
    if (!Number.isFinite(delta) || delta < 0) return res.status(400).json({ error: 'delta must be a non-negative number' })
    if (!Number.isFinite(elapsedSec) || elapsedSec < 0) return res.status(400).json({ error: 'elapsedSec must be a non-negative number' })

    await ensureRow(req.user.email)
    const { rows: [current] } = await pool.query(
      'SELECT bits, bots FROM bit_adder WHERE email = $1',
      [req.user.email],
    )
    const bots = Number(current.bots)
    const maxManual = 50 * elapsedSec
    const maxBots = bots * elapsedSec * 1.5
    const maxDelta = Math.floor(maxManual + maxBots) + 5
    const cappedDelta = Math.min(Math.floor(delta), maxDelta)

    const { rows } = await pool.query(
      `UPDATE bit_adder
       SET bits = bits + $1, updated_at = NOW()
       WHERE email = $2
       RETURNING bits, bots`,
      [cappedDelta, req.user.email],
    )
    res.json(shapeState(rows[0]))
  } catch (err) {
    console.error('POST /api/bitadder/click error:', err.message)
    res.status(500).json({ error: 'Failed to apply click' })
  }
})

// POST /api/bitadder/buy-bot — spende bit per +1 bot al prezzo corrente.
// TOCTOU benigno: leggi prezzo, poi UPDATE con WHERE bits >= price.
// Se nel mentre i bit sono scesi (impossibile nella pratica: gioco single-user)
// l'UPDATE non matcha e torniamo 400.
router.post('/buy-bot', async (req, res) => {
  try {
    if (!req.user || !req.user.email) return res.status(401).json({ error: 'Unauthenticated' })
    await ensureRow(req.user.email)
    const { rows: [current] } = await pool.query(
      'SELECT bits, bots FROM bit_adder WHERE email = $1',
      [req.user.email],
    )
    const price = nextBotPrice(Number(current.bots))

    const { rows } = await pool.query(
      `UPDATE bit_adder
       SET bits = bits - $1, bots = bots + 1, updated_at = NOW()
       WHERE email = $2 AND bits >= $1
       RETURNING bits, bots`,
      [price, req.user.email],
    )
    if (rows.length === 0) {
      return res.status(400).json({ error: 'Not enough bits', required: price, have: Number(current.bits) })
    }
    res.json(shapeState(rows[0]))
  } catch (err) {
    console.error('POST /api/bitadder/buy-bot error:', err.message)
    res.status(500).json({ error: 'Failed to buy bot' })
  }
})

// GET /api/bitadder/leaderboard — top 10 + propria riga se fuori top.
// Display name: display_owner se presente, altrimenti la parte locale dell'email.
// La risposta include sempre meRank/me anche se l'utente è nel top10 (il
// frontend decide se duplicare la riga o solo evidenziarla).
router.get('/leaderboard', async (req, res) => {
  try {
    const myEmail = req.user?.email || null
    if (!myEmail) return res.status(401).json({ error: 'Unauthenticated' })

    const { rows: ranked } = await pool.query(
      `SELECT
         ba.email,
         ba.bits,
         ba.bots,
         COALESCE(u.display_owner, split_part(ba.email, '@', 1)) AS display_name,
         RANK() OVER (ORDER BY ba.bits DESC, ba.updated_at ASC) AS rank
       FROM bit_adder ba
       LEFT JOIN users u ON u.email = ba.email
       ORDER BY rank ASC`,
    )
    const top = ranked.slice(0, 10).map(r => ({
      rank: Number(r.rank),
      name: r.display_name,
      bits: Number(r.bits),
      bots: Number(r.bots),
      isMe: r.email === myEmail,
    }))
    const mine = ranked.find(r => r.email === myEmail)
    const me = mine ? {
      rank: Number(mine.rank),
      name: mine.display_name,
      bits: Number(mine.bits),
      bots: Number(mine.bots),
    } : null

    res.json({ top, me })
  } catch (err) {
    console.error('GET /api/bitadder/leaderboard error:', err.message)
    res.status(500).json({ error: 'Failed to load leaderboard' })
  }
})

export default router
