import express from 'express'
import cors from 'cors'
import { waitForDb, runMigrations } from './db.js'
import { processRecurring } from './recurring-processor.js'
import { requireAuth, loadUserContext, AUTH_ENABLED } from './auth.js'
import tasksRouter from './routes/tasks.js'
import recurringRouter from './routes/recurring.js'
import meRouter from './routes/me.js'
import usersRouter from './routes/users.js'
import bitadderRouter from './routes/bitadder.js'

const app = express()
const PORT = process.env.PORT || 3000

// ── Middleware ───────────────────────────────────────────
app.use(cors())
app.use(express.json())

// ── Routes ──────────────────────────────────────────────
// Health stays public — used by Docker healthcheck.
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }))

// All other /api routes require auth when AUTH_ENABLED=true (no-op otherwise).
// loadUserContext runs right after to hydrate role + operator_groups from the
// users table, so handlers/middlewares can authorize without extra queries.
app.use('/api/me', requireAuth, loadUserContext, meRouter)
app.use('/api/users', requireAuth, loadUserContext, usersRouter)
app.use('/api/tasks', requireAuth, loadUserContext, tasksRouter)
app.use('/api/recurring', requireAuth, loadUserContext, recurringRouter)
app.use('/api/bitadder', requireAuth, loadUserContext, bitadderRouter)

console.log(`Auth: ${AUTH_ENABLED ? 'ENABLED (Entra ID)' : 'DISABLED (demo mode)'}`)

// ── Startup ─────────────────────────────────────────────
async function start() {
  await waitForDb()
  await runMigrations()

  // Recurring task processor — runs every 60 seconds
  processRecurring()
  setInterval(processRecurring, 60_000)

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Moby Dick B4 API listening on port ${PORT}`)
  })
}

start().catch(err => {
  console.error('Failed to start:', err)
  process.exit(1)
})
