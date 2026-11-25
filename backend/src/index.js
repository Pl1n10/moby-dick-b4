import { waitForDb, runMigrations } from './db.js'
import { processRecurring } from './recurring-processor.js'
import { syncAll } from './integrations/sync.js'
import { AUTH_ENABLED } from './auth.js'
import { createApp } from './app.js'
import { AUTH_MODE, LOCAL_LOGIN, checkLocalConfig, claimUntil, entraDomains } from './localAuth.js'

const PORT = process.env.PORT || 3000

const authLabel = !AUTH_ENABLED ? 'DISABLED (demo mode)'
  : AUTH_MODE === 'local' ? 'ENABLED (local email + password)'
  : AUTH_MODE === 'hybrid' ? `ENABLED (Entra ID for ${entraDomains().join(', ') || '?'}, email + password for the rest)`
  : 'ENABLED (Entra ID)'
console.log(`Auth: ${authLabel}`)
if (AUTH_ENABLED && LOCAL_LOGIN) {
  // Refuse to start rather than sign tokens with a weak or missing secret.
  checkLocalConfig()
  const until = claimUntil()
  console.log(`Local auth: self-activation ${until ? `open until ${until.toISOString()}` : 'closed'}`)
}

async function start() {
  await waitForDb()
  await runMigrations()

  // Recurring task processor — runs every 60 seconds
  processRecurring()
  setInterval(processRecurring, 60_000)

  // Vendor support cases (Cohesity) → tasks. Only integrations switched on
  // from the console do anything. 0 disables the timer (dev, demo).
  const syncMinutes = Number(process.env.INTEGRATIONS_SYNC_MINUTES ?? 15)
  if (syncMinutes > 0) {
    setTimeout(syncAll, 30_000)
    setInterval(syncAll, syncMinutes * 60_000)
    console.log(`Integrations: sync every ${syncMinutes} min`)
  }

  createApp().listen(PORT, '0.0.0.0', () => {
    console.log(`KanbanOps API listening on port ${PORT}`)
  })
}

start().catch(err => {
  console.error('Failed to start:', err)
  process.exit(1)
})
