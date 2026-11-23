// Vendor support cases → tasks, end to end over HTTP against a real
// PostgreSQL, with the vendor portal replaced by a fake: no test ever calls
// support.cohesity.com. Same throwaway-database setup as tenancy.test.js.
//
// Covers the multi-board side too: integrations on two boards, two accounts
// on one board, admins of one board against the other.
//
// Case data and names here are fictional on purpose: the repository is public.

import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL || 'postgresql://moby:moby@localhost:5432/moby'
const DB_NAME = `kanbanops_test_integ_${process.pid}`

let server, base, pool, http, providers

async function adminQuery(sql) {
  const client = new pg.Client({ connectionString: ADMIN_URL })
  await client.connect()
  try { await client.query(sql) } finally { await client.end() }
}

function api(email) {
  const call = async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${email}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await res.text()
    return { status: res.status, body: text ? JSON.parse(text) : null, raw: text }
  }
  return {
    get: (p) => call('GET', p),
    post: (p, b) => call('POST', p, b ?? {}),
    patch: (p, b) => call('PATCH', p, b ?? {}),
    del: (p) => call('DELETE', p),
  }
}

const su = api('super@example.com')
const backupAdmin = api('backup-admin@example.com')
const smAdmin = api('sm-admin@example.com')
const smViewer = api('sm-viewer@example.com')

// ── Fake portal ─────────────────────────────────────────────
// Each account has its own cases and its own rotating refresh tokens: a spent
// token is refused, as a rotating refresh token should be.
const portal = { accounts: new Map(), refreshCalls: 0, casesCalls: 0, down: false, seq: 0 }

function account(name) {
  let a = portal.accounts.get(name)
  if (!a) {
    a = { cases: [], refresh: new Set(), access: new Set() }
    portal.accounts.set(name, a)
  }
  return a
}
// A fresh session for `name`, as if someone logged in on the portal.
function login(name) {
  const t = `rt-${name}-${++portal.seq}-` + 'x'.repeat(50)
  account(name).refresh.add(t)
  return t
}
const ownerOf = (kind, token) => [...portal.accounts].find(([, a]) => a[kind].has(token))?.[0]

function sfCase(id, number, status, extra = {}) {
  return {
    attributes: { type: 'Case', url: '/services/data/x' },
    Id: id, CaseNumber: number, Status: status, Subject: `Subject ${number}`,
    Priority: 'P3', CreatedDate: '2026-11-19T06:45:19.000+0000',
    LastModifiedDate: '2026-11-23T10:17:19.000+0000', ClosedDate: null,
    Origin: 'Web', Customer_Selected_Case_Product__c: 'Data Protect',
    Cluster_Name__c: 'cluster-test-01',
    Contact: { Name: 'Should Not Be Stored', Email: 'nobody@example.com' },
    ...extra,
  }
}

async function fakeFetch(url, opts = {}) {
  const cookie = opts.headers?.Cookie || ''
  assert.ok(opts.signal, 'every portal call must carry a timeout signal')
  if (url.endsWith('/auth/refresh')) {
    portal.refreshCalls++
    const rt = /refresh_token=([^;]+)/.exec(cookie)?.[1]
    const who = ownerOf('refresh', rt)
    if (portal.down || !who) return new Response(JSON.stringify({ error: 'Missing refresh token' }), { status: 401 })
    const a = account(who)
    a.refresh.delete(rt)
    const next = login(who)
    const at = `at-${who}-${portal.seq}`
    a.access.add(at)
    const headers = new Headers()
    headers.append('set-cookie', `access_token=${at}; Max-Age=3500; Path=/; HttpOnly; Secure`)
    headers.append('set-cookie', `refresh_token=${next}; Max-Age=28800; Path=/auth/refresh; HttpOnly; Secure`)
    return new Response('{}', { status: 200, headers })
  }
  if (url.endsWith('/api/cases')) {
    portal.casesCalls++
    const who = ownerOf('access', /access_token=([^;]+)/.exec(cookie)?.[1])
    if (!who) return new Response('{"error":"Unauthorized"}', { status: 401 })
    return new Response(JSON.stringify({ response: account(who).cases }), { status: 200 })
  }
  throw new Error(`unexpected fetch ${url}`)
}

before(async () => {
  await adminQuery(`DROP DATABASE IF EXISTS ${DB_NAME}`)
  await adminQuery(`CREATE DATABASE ${DB_NAME}`)
  const url = new URL(ADMIN_URL)
  url.pathname = `/${DB_NAME}`
  process.env.DATABASE_URL = url.toString()

  const db = await import('../src/db.js')
  pool = db.default
  const auth = await import('../src/auth.js')
  http = await import('../src/integrations/providers/http.js')
  providers = await import('../src/integrations/providers/index.js')
  const { createApp } = await import('../src/app.js')

  await db.runMigrations()
  await db.runMigrations()   // idempotent

  auth.setAuthEnabled(true)
  auth.setTokenVerifier(async (token) => ({ preferred_username: token, name: token, oid: token }))
  http.setFetch(fakeFetch)

  await pool.query(`INSERT INTO users (email, display_owner, is_superadmin) VALUES ('super@example.com', 'Super Admin', true)`)
  await pool.query(`INSERT INTO users (email, display_owner) VALUES ('backup-admin@example.com', 'Backup Admin')`)
  await pool.query(`INSERT INTO memberships (tenant_id, email, role)
                    SELECT id, 'backup-admin@example.com', 'admin' FROM tenants WHERE slug = 'backup'`)

  server = createApp().listen(0)
  await new Promise(r => server.once('listening', r))
  base = `http://127.0.0.1:${server.address().port}/api`

  // A second board, as the console creates it.
  const created = await su.post('/tenants', { slug: 'sm', name: 'Service Manager', pillars: ['Fornitori', 'Altro'] })
  assert.equal(created.status, 201, created.raw)
  await pool.query(`INSERT INTO users (email) VALUES ('sm-admin@example.com'), ('sm-viewer@example.com')`)
  await pool.query(`INSERT INTO memberships (tenant_id, email, role)
                    SELECT id, 'sm-admin@example.com', 'admin'::user_role FROM tenants WHERE slug = 'sm'
                    UNION ALL SELECT id, 'sm-viewer@example.com', 'viewer'::user_role FROM tenants WHERE slug = 'sm'`)
})

after(async () => {
  http?.setFetch(null)
  server?.close()
  await pool?.end()
  await adminQuery(`DROP DATABASE IF EXISTS ${DB_NAME}`)
})

beforeEach(async () => {
  await pool.query('DELETE FROM integrations')
  await pool.query('DELETE FROM tasks')
  portal.accounts = new Map()
  portal.refreshCalls = 0
  portal.casesCalls = 0
  portal.down = false
})

// Creates an integration on `slug` with a fresh login on `accountName`.
async function connect(client, slug, { name = 'Cohesity', group = 'Cohesity', accountName = 'acme', enabled = true } = {}) {
  const c = await client.post(`/t/${slug}/integrations`, { provider: 'cohesity', name, group })
  assert.equal(c.status, 201, c.raw)
  const p = await client.patch(`/t/${slug}/integrations/${c.body.id}`, { enabled, credential: login(accountName) })
  assert.equal(p.status, 200, p.raw)
  return p.body
}
const syncOf = (client, slug, id) => client.post(`/t/${slug}/integrations/${id}/sync`)
const tasksOf = async (slug) => (await su.get(`/t/${slug}/tasks`)).body
const byCase = (list, number) => list.find(t => t.vendorCase?.number === number)

// ── Permissions and isolation ───────────────────────────────

test('board admins manage the integrations of their own board only', async () => {
  const backupInteg = await connect(su, 'backup')
  const smInteg = await connect(smAdmin, 'sm', { group: 'Fornitori', accountName: 'sm-account' })

  // The SM admin cannot see, change, sync or delete the backup board's one,
  // not even by guessing its id under their own board.
  assert.equal((await smAdmin.get('/t/backup/integrations')).status, 403)
  assert.equal((await smAdmin.patch(`/t/backup/integrations/${backupInteg.id}`, { enabled: false })).status, 403)
  assert.equal((await smAdmin.patch(`/t/sm/integrations/${backupInteg.id}`, { enabled: false })).status, 404)
  assert.equal((await smAdmin.post(`/t/sm/integrations/${backupInteg.id}/sync`)).status, 404)
  assert.equal((await smAdmin.del(`/t/sm/integrations/${backupInteg.id}`)).status, 404)
  // …and vice versa.
  assert.equal((await backupAdmin.get('/t/sm/integrations')).status, 403)
  assert.equal((await backupAdmin.del(`/t/backup/integrations/${smInteg.id}`)).status, 404)
  // A viewer of the board does not manage integrations.
  assert.equal((await smViewer.get('/t/sm/integrations')).status, 403)

  const smList = (await smAdmin.get('/t/sm/integrations')).body
  assert.deepEqual(smList.map(i => i.id), [smInteg.id])
  assert.equal((await smAdmin.patch(`/t/sm/integrations/${smInteg.id}`, { group: 'Cohesity' })).status, 400,
    'the target section must be a section of the same board')
  assert.equal((await su.patch('/t/backup/integrations/not-a-uuid', { enabled: true })).status, 404)
})

test('each board mirrors its own account into its own section', async () => {
  account('acme').cases = [sfCase('500A', '01000001', 'Work in progress')]
  account('sm-account').cases = [sfCase('500Z', '09000001', 'Customer pending')]
  const backupInteg = await connect(su, 'backup')
  const smInteg = await connect(smAdmin, 'sm', { group: 'Fornitori', accountName: 'sm-account' })

  assert.equal((await syncOf(su, 'backup', backupInteg.id)).body.result.created, 1)
  assert.equal((await syncOf(smAdmin, 'sm', smInteg.id)).body.result.created, 1)

  const backup = await tasksOf('backup')
  const sm = await tasksOf('sm')
  assert.deepEqual(backup.map(t => t.vendorCase?.number), ['01000001'])
  assert.deepEqual(sm.map(t => t.vendorCase?.number), ['09000001'])
  assert.equal(sm[0].group, 'Fornitori')
  assert.equal(sm[0].number, 1, 'numbered with the SM board counter')
})

test('one board can connect two accounts, each with its own session', async () => {
  account('customer-a').cases = [sfCase('500A', '01000001', 'Work in progress')]
  account('customer-b').cases = [sfCase('500B', '02000001', 'Work in progress')]
  const a = await connect(smAdmin, 'sm', { name: 'Cohesity · Cliente A', group: 'Fornitori', accountName: 'customer-a' })
  const b = await connect(smAdmin, 'sm', { name: 'Cohesity · Cliente B', group: 'Altro', accountName: 'customer-b' })
  assert.equal((await smAdmin.post('/t/sm/integrations', { provider: 'cohesity', name: 'Cohesity · Cliente A' })).status, 409)

  await syncOf(smAdmin, 'sm', a.id)
  await syncOf(smAdmin, 'sm', b.id)
  const sm = await tasksOf('sm')
  assert.equal(byCase(sm, '01000001').group, 'Fornitori')
  assert.equal(byCase(sm, '02000001').group, 'Altro')
  assert.equal(byCase(sm, '02000001').vendorCase.integration, 'Cohesity · Cliente B')

  // Deleting one integration: its tasks stay, without the tab; the other is untouched.
  assert.equal((await smAdmin.del(`/t/sm/integrations/${a.id}`)).status, 200)
  const after = await tasksOf('sm')
  assert.equal(after.length, 2)
  assert.equal(after.find(t => t.reference === 'Subject 01000001').vendorCase, null)
  assert.ok(byCase(after, '02000001'))
})

test('a failing portal on one board does not stop the others', async () => {
  account('acme').cases = [sfCase('500A', '01000001', 'Work in progress')]
  account('sm-account').cases = [sfCase('500Z', '09000001', 'Work in progress')]
  const backupInteg = await connect(su, 'backup')
  await connect(smAdmin, 'sm', { group: 'Fornitori', accountName: 'sm-account' })
  // The backup session dies (someone else used it): the SM board still syncs.
  account('acme').refresh.clear()

  const { syncAll } = await import('../src/integrations/sync.js')
  await syncAll()
  assert.equal((await tasksOf('backup')).length, 0)
  assert.equal((await tasksOf('sm')).length, 1)
  const backupState = (await su.get('/t/backup/integrations')).body.find(i => i.id === backupInteg.id)
  assert.match(backupState.lastError, /Sessione del portale Cohesity scaduta/)
})

test('disabled integrations are skipped by the timer', async () => {
  account('acme').cases = [sfCase('500A', '01000001', 'Work in progress')]
  await connect(su, 'backup', { enabled: false })
  const { syncAll } = await import('../src/integrations/sync.js')
  await syncAll()
  assert.equal(portal.refreshCalls, 0)
  assert.equal((await tasksOf('backup')).length, 0)
})

// ── Session ─────────────────────────────────────────────────

test('the session is write-only and validated', async () => {
  const c = await su.post('/t/backup/integrations', { provider: 'cohesity', name: 'Cohesity', group: 'Cohesity' })
  assert.equal((await su.post('/t/backup/integrations', { provider: 'nope', name: 'x' })).status, 400)
  assert.equal((await su.patch(`/t/backup/integrations/${c.body.id}`, { credential: 'refresh_token=abc def' })).status, 400)
  const token = login('acme')
  const ok = await su.patch(`/t/backup/integrations/${c.body.id}`, { credential: token })
  assert.equal(ok.body.hasSession, true)
  assert.ok(!ok.raw.includes(token), 'the token must never come back')
  assert.ok(!(await su.get('/t/backup/integrations')).raw.includes(token))
  assert.ok(!(await su.get('/t/backup/integrations/providers')).raw.includes(token))
})

test('the refresh token rotates and the new one is kept', async () => {
  account('acme').cases = [sfCase('500A', '01000001', 'Work in progress')]
  const integ = await connect(su, 'backup')
  await syncOf(su, 'backup', integ.id)
  // The first token is spent: a second sync works only if the rotated one was saved.
  await pool.query(`UPDATE integrations SET credentials = credentials || '{"accessExpiresAt": "2000-01-01T00:00:00Z"}'`)
  const r = await syncOf(su, 'backup', integ.id)
  assert.equal(r.body.integration.lastError, null)
  assert.equal(portal.refreshCalls, 2)
  // A fresh access token is reused, not refreshed at every sync.
  await syncOf(su, 'backup', integ.id)
  assert.equal(portal.refreshCalls, 2)
  assert.equal(portal.casesCalls, 3)
})

test('an expired session is reported and touches nothing; a new one fixes it', async () => {
  account('acme').cases = [sfCase('500A', '01000001', 'Work in progress')]
  const integ = await connect(su, 'backup')
  portal.down = true
  const r = await syncOf(su, 'backup', integ.id)
  assert.match(r.body.integration.lastError, /Sessione del portale Cohesity scaduta/)
  assert.equal(r.body.integration.lastOkAt, null)
  assert.equal((await tasksOf('backup')).length, 0)

  portal.down = false
  await su.patch(`/t/backup/integrations/${integ.id}`, { credential: login('acme') })
  const again = await syncOf(su, 'backup', integ.id)
  assert.equal(again.body.integration.lastError, null)
  assert.equal((await tasksOf('backup')).length, 1)
})

test('a portal that hangs or is unreachable becomes an error, not a crash', async () => {
  const integ = await connect(su, 'backup')
  http.setFetch(async () => { const e = new Error('timed out'); e.name = 'TimeoutError'; throw e })
  try {
    const r = await syncOf(su, 'backup', integ.id)
    assert.match(r.body.integration.lastError, /non risponde/)
  } finally {
    http.setFetch(fakeFetch)
  }
})

// ── Board behaviour ─────────────────────────────────────────

test('open cases become tasks with mapped status and priority; closed ones are ignored', async () => {
  account('acme').cases = [
    sfCase('500A', '01000001', 'Customer pending', { Priority: 'P1' }),
    sfCase('500B', '01000002', 'Work in progress'),
    sfCase('500C', '01000003', 'Closed', { ClosedDate: '2026-11-20T10:00:00.000+0000' }),
  ]
  const integ = await connect(su, 'backup')
  const r = await syncOf(su, 'backup', integ.id)
  assert.equal(r.body.result.created, 2)
  assert.equal(r.body.integration.openCases, 2)

  const list = await tasksOf('backup')
  const a = byCase(list, '01000001')
  assert.equal(byCase(list, '01000003'), undefined)
  assert.equal(a.group, 'Cohesity')
  assert.equal(a.status, 'Waiting')
  assert.equal(a.priority, 1)
  assert.equal(a.owner, '')
  assert.equal(a.reference, 'Subject 01000001')
  assert.match(a.description, /Case Cohesity 01000001 · Data Protect/)
  assert.equal(a.vendorCase.waitingOnUs, true)
  assert.equal(a.vendorCase.providerLabel, 'Cohesity')
  assert.equal(a.vendorCase.url, 'https://support.cohesity.com/cases/c/500A')
  assert.equal(byCase(list, '01000002').status, 'In Progress')
  assert.equal(byCase(list, '01000002').vendorCase.waitingOnUs, false)

  const { rows } = await pool.query('SELECT row_to_json(v)::text AS j FROM vendor_cases v')
  assert.ok(rows.every(x => !x.j.includes('Should Not Be Stored')), 'no contact data stored')
})

test('the task follows the case, but a hand-set status stays until the case moves', async () => {
  account('acme').cases = [sfCase('500A', '01000001', 'Work in progress')]
  const integ = await connect(su, 'backup')
  await syncOf(su, 'backup', integ.id)
  let t = byCase(await tasksOf('backup'), '01000001')

  assert.equal((await su.patch(`/t/backup/tasks/${t.id}`, { field: 'status', value: 'New' })).status, 200)
  assert.equal((await su.patch(`/t/backup/tasks/${t.id}`, { field: 'owner', value: 'Super Admin' })).status, 200)
  await syncOf(su, 'backup', integ.id)
  t = byCase(await tasksOf('backup'), '01000001')
  assert.equal(t.status, 'New')
  assert.equal(t.owner, 'Super Admin')

  account('acme').cases = [sfCase('500A', '01000001', 'Customer pending', { Priority: 'P2', Subject: 'changed upstream' })]
  await syncOf(su, 'backup', integ.id)
  t = byCase(await tasksOf('backup'), '01000001')
  assert.equal(t.status, 'Waiting')
  assert.equal(t.priority, 2)
  assert.equal(t.owner, 'Super Admin')
  assert.equal(t.reference, 'Subject 01000001')

  account('acme').cases = [sfCase('500A', '01000001', 'Closed')]
  await syncOf(su, 'backup', integ.id)
  assert.equal((await tasksOf('backup')).find(x => x.id === t.id).status, 'Closed')
})

test('a case closing does not close a task with open checklist items', async () => {
  account('acme').cases = [sfCase('500A', '01000001', 'Work in progress')]
  const integ = await connect(su, 'backup')
  await syncOf(su, 'backup', integ.id)
  const t = byCase(await tasksOf('backup'), '01000001')
  assert.equal((await su.post(`/t/backup/tasks/${t.id}/subtasks`, { description: 'call the customer' })).status, 201)
  account('acme').cases = [sfCase('500A', '01000001', 'Closed')]
  await syncOf(su, 'backup', integ.id)
  assert.equal((await tasksOf('backup')).find(x => x.id === t.id).status, 'Resolved')
})

test('a deleted mirrored task is not recreated, and its undo-restore relinks it', async () => {
  account('acme').cases = [sfCase('500A', '01000001', 'Work in progress')]
  const integ = await connect(su, 'backup')
  await syncOf(su, 'backup', integ.id)
  const t = byCase(await tasksOf('backup'), '01000001')
  assert.equal((await su.del(`/t/backup/tasks/${t.id}`)).status, 200)
  await syncOf(su, 'backup', integ.id)
  assert.equal((await tasksOf('backup')).length, 0)

  const restored = await su.post('/t/backup/tasks', { id: t.id, group: 'Cohesity', reference: t.reference, owner: '', skipNotify: true })
  assert.equal(restored.status, 201, restored.raw)
  assert.equal(byCase(await tasksOf('backup'), '01000001')?.id, t.id)
})

test('sections: renames are followed, a deleted section stops the sync with a clear error', async () => {
  const integ = await connect(smAdmin, 'sm', { group: 'Altro', accountName: 'sm-account' })
  const { rows: [p] } = await pool.query(`SELECT id FROM pillars WHERE name = 'Altro' AND tenant_id = (SELECT id FROM tenants WHERE slug = 'sm')`)
  assert.equal((await su.patch(`/tenants/sm/pillars/${p.id}`, { name: 'Altro 2' })).status, 200)
  assert.equal((await smAdmin.get('/t/sm/integrations')).body[0].group, 'Altro 2')

  assert.equal((await su.del(`/tenants/sm/pillars/${p.id}`)).status, 200)
  const r = await syncOf(smAdmin, 'sm', integ.id)
  assert.match(r.body.integration.lastError, /Nessuna sezione/)
  await su.post('/tenants/sm/pillars', { name: 'Altro' })
})

test('provider registry and Cohesity mapping', () => {
  const list = providers.listProviders()
  assert.deepEqual(list.map(p => p.id), ['cohesity'])
  assert.ok(list[0].credential.help.length > 0)
  const c = providers.getProvider('cohesity')
  assert.equal(c.mapStatus('Customer pending'), 'Waiting')
  assert.equal(c.mapStatus('Dispatch/RMA pending'), 'Waiting')
  assert.equal(c.mapStatus('Solution provided/monitoring'), 'Resolved')
  assert.equal(c.mapStatus('Duplicate'), 'Closed')
  assert.equal(c.mapStatus('Something new'), 'In Progress')
  assert.equal(c.mapPriority('P4'), 4)
  assert.equal(c.mapPriority('P0'), 3)
  assert.equal(c.isOpen({ status: 'Duplicate' }), false)
  assert.equal(c.credentialsFrom('short'), null)
  assert.equal(providers.getProvider('nope'), null)
})
