import express from 'express'
import cors from 'cors'
import { requireAuth, loadUserContext, loadBoard } from './auth.js'
import tasksRouter from './routes/tasks.js'
import recurringRouter from './routes/recurring.js'
import meRouter from './routes/me.js'
import usersRouter from './routes/users.js'
import bitadderRouter from './routes/bitadder.js'
import settingsRouter from './routes/settings.js'
import tenantsRouter from './routes/tenants.js'
import membersRouter from './routes/members.js'

// Built separately from index.js so the test suite can mount the app without
// starting the recurring scheduler or binding a port.
export function createApp() {
  const app = express()

  app.use(cors())
  app.use(express.json())

  // Health stays public — used by Docker healthcheck.
  app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }))

  // Every other /api route requires auth when AUTH_ENABLED=true (no-op
  // otherwise). loadUserContext hydrates the global identity (superadmin,
  // home board) from the users table.
  const auth = [requireAuth, loadUserContext]

  // Global routes: identity, board directory, user administration, easter egg.
  app.use('/api/me', auth, meRouter)
  app.use('/api/tenants', auth, tenantsRouter)
  app.use('/api/users', auth, usersRouter)
  app.use('/api/bitadder', auth, bitadderRouter)

  // Board routes. loadBoard resolves :slug and the caller's role on that
  // board; every query below it filters on req.tenant.id. A route that talks
  // to tasks/templates/settings outside this prefix is an isolation bug.
  const board = express.Router({ mergeParams: true })
  board.use('/tasks', tasksRouter)
  board.use('/recurring', recurringRouter)
  board.use('/settings', settingsRouter)
  board.use('/members', membersRouter)
  app.use('/api/t/:slug', auth, loadBoard, board)

  return app
}
