import { waitForDb, runMigrations } from './db.js'
import { processRecurring } from './recurring-processor.js'
import { AUTH_ENABLED } from './auth.js'
import { createApp } from './app.js'

const PORT = process.env.PORT || 3000

console.log(`Auth: ${AUTH_ENABLED ? 'ENABLED (Entra ID)' : 'DISABLED (demo mode)'}`)

async function start() {
  await waitForDb()
  await runMigrations()

  // Recurring task processor — runs every 60 seconds
  processRecurring()
  setInterval(processRecurring, 60_000)

  createApp().listen(PORT, '0.0.0.0', () => {
    console.log(`KanbanOps API listening on port ${PORT}`)
  })
}

start().catch(err => {
  console.error('Failed to start:', err)
  process.exit(1)
})
