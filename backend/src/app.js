import express from 'express'
import cors from 'cors'
import { requireAuth, loadUserContext, loadBoard, loadFixedBoard } from './auth.js'
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
  // Legacy owner picker of the pre-multi-board bundle: see the legacy routes
  // below. Must come before the users router, which is superadmin-only.
  app.get('/api/users/owners', auth, loadFixedBoard('backup'), (req, res, next) => {
    req.url = '/owners'
    membersRouter(req, res, next)
  })
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

  // Legacy single-board routes, for the transition only: a tab opened before
  // the multi-board deploy still runs the old bundle, which polls /api/tasks
  // every 60s and saves through it. Without these, that tab would fail every
  // poll and roll back every edit until reloaded. They all mean the backup
  // board (the only one that existed). Remove a few weeks after the deploy.
  // (/api/users/owners is mounted above, before the superadmin-only users
  // router would answer it with 403.)
  const legacy = [...auth, loadFixedBoard('backup')]
  app.use('/api/tasks', legacy, tasksRouter)
  app.use('/api/recurring', legacy, recurringRouter)
  app.use('/api/settings', legacy, settingsRouter)

  return app
}
