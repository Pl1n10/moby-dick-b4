// Board isolation and permissions, end to end over HTTP against a real
// PostgreSQL. Each run creates a throwaway database, applies every migration
// and drops it at the end — no shared state with the dev DB.
//
// Needs a local PostgreSQL where TEST_DATABASE_ADMIN_URL (default: the dev
// `moby` role) may CREATE DATABASE. Entra is replaced by a fake verifier:
// the bearer token IS the email.
//
// Names here are fictional on purpose: the repository is public.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL || 'postgresql://moby:moby@localhost:5432/moby'
const DB_NAME = `kanbanops_test_${process.pid}`

let server, base, pool, auth

const NAMES = {
  'super@example.com': 'Super Admin',
  'backup-admin@example.com': 'Backup Admin',
  'sm-admin@example.com': 'Sm Admin',
  'operator@example.com': 'Op Erator',
  'newbie@example.com': 'New Bie',
}

async function adminQuery(sql) {
  const client = new pg.Client({ connectionString: ADMIN_URL })
  await client.connect()
  try { await client.query(sql) } finally { await client.end() }
}

function api(email) {
  const call = async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(email ? { Authorization: `Bearer ${email}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await res.text()
    return { status: res.status, body: text ? JSON.parse(text) : null }
  }
  return {
    get: (p) => call('GET', p),
    post: (p, b) => call('POST', p, b ?? {}),
    put: (p, b) => call('PUT', p, b ?? {}),
    patch: (p, b) => call('PATCH', p, b ?? {}),
    del: (p) => call('DELETE', p),
  }
}

const su = api('super@example.com')
const backupAdmin = api('backup-admin@example.com')
const smAdmin = api('sm-admin@example.com')
const operator = api('operator@example.com')
const newbie = api('newbie@example.com')

before(async () => {
  await adminQuery(`DROP DATABASE IF EXISTS ${DB_NAME}`)
  await adminQuery(`CREATE DATABASE ${DB_NAME}`)
  const url = new URL(ADMIN_URL)
  url.pathname = `/${DB_NAME}`
  process.env.DATABASE_URL = url.toString()

  // Imported after DATABASE_URL is set: db.js builds its pool at import time.
  const db = await import('../src/db.js')
  pool = db.default
  auth = await import('../src/auth.js')
  const { createApp } = await import('../src/app.js')

  await db.runMigrations()
  // Second run: every migration must be idempotent (they re-run at each boot).
  await db.runMigrations()

  auth.setAuthEnabled(true)
  auth.setTokenVerifier(async (token) => ({ preferred_username: token, name: NAMES[token] || null, oid: token }))

  // Fixture: the backfilled "backup" board gets a fictional admin; the
  // superadmin is a fictional account too.
  await pool.query(`INSERT INTO users (email, display_owner, is_superadmin) VALUES ('super@example.com', 'Super Admin', true)`)
  await pool.query(`INSERT INTO users (email, display_owner) VALUES ('backup-admin@example.com', 'Backup Admin')`)
  await pool.query(`INSERT INTO memberships (tenant_id, email, role)
                    SELECT id, 'backup-admin@example.com', 'admin' FROM tenants WHERE slug = 'backup'`)

  server = createApp().listen(0)
  await new Promise(r => server.once('listening', r))
  base = `http://127.0.0.1:${server.address().port}/api`

  // Second board, as the superadmin console will create it.
  const created = await su.post('/tenants', {
    slug: 'sm', name: 'Service Manager',
    settings: { labels: { reference: 'Attività' }, features: { reperibile: false } },
    pillars: ['Sezione A', 'Sezione B'],
  })
  assert.equal(created.status, 201, JSON.stringify(created.body))
  assert.equal((await su.put('/t/sm/members/sm-admin@example.com', { role: 'admin', displayOwner: 'Sm Admin' })).status, 200)
  assert.equal((await su.put('/t/sm/members/operator@example.com', { operatorGroups: ['Sezione A'], displayOwner: 'Op Erator' })).status, 200)
})

after(async () => {
  server?.close()
  await pool?.end()
  await adminQuery(`DROP DATABASE IF EXISTS ${DB_NAME}`)
})

async function newTask(client, slug, group, extra = {}) {
  const r = await client.post(`/t/${slug}/tasks`, { group, reference: `ref ${group}`, owner: '', ...extra })
  assert.equal(r.status, 201, JSON.stringify(r.body))
  return r.body
}

test('a task id from another board behaves as not found', async () => {
  const task = await newTask(backupAdmin, 'backup', 'Commvault')

  const smList = await smAdmin.get('/t/sm/tasks')
  assert.equal(smList.status, 200)
  assert.ok(!smList.body.some(t => t.id === task.id))

  assert.equal((await smAdmin.patch(`/t/sm/tasks/${task.id}`, { field: 'reference', value: 'x' })).status, 404)
  assert.equal((await smAdmin.del(`/t/sm/tasks/${task.id}`)).status, 404)
  assert.equal((await smAdmin.get(`/t/sm/tasks/${task.id}/subtasks`)).status, 404)
  assert.equal((await smAdmin.post(`/t/sm/tasks/${task.id}/subtasks`, { description: 'x' })).status, 404)
})

test('any user can read another board but not write it', async () => {
  const task = await newTask(backupAdmin, 'backup', 'Cohesity')
  const list = await smAdmin.get('/t/backup/tasks')
  assert.equal(list.status, 200)
  assert.ok(list.body.some(t => t.id === task.id))
  assert.equal((await smAdmin.patch(`/t/backup/tasks/${task.id}`, { field: 'reference', value: 'x' })).status, 403)
  assert.equal((await smAdmin.post('/t/backup/tasks', { group: 'Cohesity', owner: '' })).status, 403)
  assert.equal((await smAdmin.post('/t/backup/tasks/reset')).status, 403)
})

test('sections are validated against the board', async () => {
  assert.equal((await smAdmin.post('/t/sm/tasks', { group: 'Commvault', owner: '' })).status, 400)
  const task = await newTask(smAdmin, 'sm', 'Sezione A')
  assert.equal((await smAdmin.patch(`/t/sm/tasks/${task.id}`, { field: 'group', value: 'Commvault' })).status, 400)
  assert.equal((await smAdmin.put('/t/sm/recurring', [{ id: crypto.randomUUID(), group: 'Commvault', owner: '' }])).status, 400)
})

test('operators write only their sections', async () => {
  await newTask(operator, 'sm', 'Sezione A')
  assert.equal((await operator.post('/t/sm/tasks', { group: 'Sezione B', owner: '' })).status, 403)
  assert.equal((await operator.put('/t/sm/recurring', [])).status, 403)
})

test('reperibile exists only where the feature is on', async () => {
  const task = await newTask(smAdmin, 'sm', 'Sezione B', { reperibile: true })
  assert.equal(task.reperibile, false)
  assert.equal((await smAdmin.patch(`/t/sm/tasks/${task.id}`, { field: 'reperibile', value: true })).status, 400)
  assert.equal((await smAdmin.get('/t/sm/settings/on_call')).status, 404)
  assert.equal((await backupAdmin.get('/t/backup/settings/on_call')).status, 200)
  // on_call must be a member of that board
  assert.equal((await backupAdmin.put('/t/backup/settings/on_call', { value: 'Sm Admin' })).status, 400)
  assert.equal((await backupAdmin.put('/t/backup/settings/on_call', { value: 'Backup Admin' })).status, 200)
})

test('owner picker lists only the board members', async () => {
  const sm = (await operator.get('/t/sm/members/owners')).body
  assert.ok(sm.includes('Sm Admin') && sm.includes('Op Erator'))
  assert.ok(!sm.includes('Backup Admin'))
  const backup = (await operator.get('/t/backup/members/owners')).body
  assert.ok(backup.includes('Backup Admin') && !backup.includes('Op Erator'))
})

test('first login: no board, then the user picks one and joins it as viewer', async () => {
  const me = await newbie.get('/me')
  assert.equal(me.status, 200)
  assert.equal(me.body.homeBoard, null)
  assert.deepEqual(me.body.memberships, [])

  const boards = await newbie.get('/tenants')
  assert.deepEqual(boards.body.map(b => b.slug), ['backup', 'sm'])

  const picked = await newbie.put('/me/home', { slug: 'sm' })
  assert.equal(picked.status, 200)
  assert.equal(picked.body.homeBoard, 'sm')
  assert.deepEqual(picked.body.memberships.map(m => [m.slug, m.role]), [['sm', 'viewer']])
  assert.ok((await newbie.get('/t/sm/members/owners')).body.includes('New Bie'))
  assert.equal((await newbie.post('/t/sm/tasks', { group: 'Sezione A', owner: '' })).status, 403)

  // Picking a board never downgrades an existing role there.
  await smAdmin.put('/me/home', { slug: 'sm' })
  assert.equal((await smAdmin.get('/me')).body.memberships.find(m => m.slug === 'sm').role, 'admin')
})

test('board admins manage only their own board', async () => {
  assert.equal((await smAdmin.get('/t/sm/members')).status, 200)
  assert.equal((await smAdmin.get('/t/backup/members')).status, 403)
  assert.equal((await smAdmin.put('/t/backup/members/sm-admin@example.com', { role: 'admin' })).status, 403)
  assert.equal((await smAdmin.put('/t/sm/members/sm-admin@example.com', { role: 'viewer' })).status, 400)
  assert.equal((await smAdmin.del('/t/sm/members/sm-admin@example.com')).status, 400)
  assert.equal((await smAdmin.put('/t/sm/members/operator@example.com', { operatorGroups: ['Commvault'] })).status, 400)
  assert.equal((await smAdmin.post('/tenants', { slug: 'x', name: 'X' })).status, 403)
  assert.equal((await smAdmin.get('/users')).status, 403)
})

test('reset wipes only the current board', async () => {
  const keep = await newTask(backupAdmin, 'backup', 'Commvault')
  await newTask(smAdmin, 'sm', 'Sezione A')
  assert.equal((await smAdmin.post('/t/sm/tasks/reset')).status, 200)
  assert.deepEqual((await smAdmin.get('/t/sm/tasks')).body, [])
  assert.ok((await backupAdmin.get('/t/backup/tasks')).body.some(t => t.id === keep.id))
})

test('renaming a section renames tasks and operator scopes', async () => {
  const board = (await su.get('/tenants')).body.find(b => b.slug === 'sm')
  const pillar = board.pillars.find(p => p.name === 'Sezione A')
  const task = await newTask(smAdmin, 'sm', 'Sezione A')

  const renamed = await su.patch(`/tenants/sm/pillars/${pillar.id}`, { name: 'Sezione A2' })
  assert.equal(renamed.status, 200)
  assert.equal((await smAdmin.get('/t/sm/tasks')).body.find(t => t.id === task.id).group, 'Sezione A2')
  const op = (await smAdmin.get('/t/sm/members')).body.find(m => m.email === 'operator@example.com')
  assert.deepEqual(op.operatorGroups, ['Sezione A2'])

  // A section in use cannot be deleted; an empty board cannot hide tasks.
  assert.equal((await su.del(`/tenants/sm/pillars/${pillar.id}`)).status, 409)
  assert.equal((await su.del('/tenants/sm')).status, 409)
})

test('a superadmin cannot lock themselves out', async () => {
  const me = (await su.get('/users')).body.find(u => u.email === 'super@example.com')
  assert.equal((await su.patch(`/users/${me.id}`, { isSuperadmin: false })).status, 400)
  assert.equal((await su.del(`/users/${me.id}`)).status, 400)
})
