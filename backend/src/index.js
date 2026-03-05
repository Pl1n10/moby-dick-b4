import express from 'express'
import cors from 'cors'
import { waitForDb, runMigrations } from './db.js'
import { processRecurring } from './recurring-processor.js'
import tasksRouter from './routes/tasks.js'
import recurringRouter from './routes/recurring.js'

const app = express()
const PORT = process.env.PORT || 3000

// ── Middleware ───────────────────────────────────────────
app.use(cors())
app.use(express.json())

// ── Routes ──────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }))
app.use('/api/tasks', tasksRouter)
app.use('/api/recurring', recurringRouter)

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
