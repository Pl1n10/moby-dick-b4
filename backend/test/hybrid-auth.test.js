// AUTH_MODE=hybrid: Microsoft for the tenant's domains (ENTRA_DOMAINS),
// email + password for everyone else. Real PostgreSQL, real local verifier;
// only the Entra half is faked (setEntraVerifier), since the tests cannot
// reach Microsoft's keys. Names are fictional: the repository is public.

import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import jwt from 'jsonwebtoken'

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL || 'postgresql://moby:moby@localhost:5432/moby'
const DB_NAME = `kanbanops_hybrid_${process.pid}`
const SECRET = 'test-secret-test-secret-test-secret-0123'
const PASSWORD = 'correct horse battery'

let server, base, pool, auth, localAuth

async function adminQuery(sql) {
  const client = new pg.Client({ connectionString: ADMIN_URL })
  await client.connect()
  try { await client.query(sql) } finally { await client.end() }
}

async function call(method, path, body, token) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

// What a Microsoft access token looks like to the router: RS256 in the
// header. The fake Entra verifier trusts it if it carries `fake-entra`.
function entraToken(email) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'k1' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ preferred_username: email, name: email, iss: 'fake-entra' })).toString('base64url')
  return `${header}.${payload}.sig`
}

async function addUser(email, name, { superadmin = false, password = PASSWORD } = {}) {
  await pool.query(
    `INSERT INTO users (email, display_owner, is_superadmin, password_hash, password_set_at, password_set_by)
     VALUES ($1, $2, $3, $4, NOW(), 'cli')`,
    [email, name, superadmin, password ? await localAuth.hashPassword(password) : null],
  )
}

before(async () => {
  await adminQuery(`DROP DATABASE IF EXISTS ${DB_NAME}`)
  await adminQuery(`CREATE DATABASE ${DB_NAME}`)
  const url = new URL(ADMIN_URL)
  url.pathname = `/${DB_NAME}`
  process.env.DATABASE_URL = url.toString()
  // Read at import time.
  process.env.AUTH_MODE = 'hybrid'
  process.env.ENTRA_DOMAINS = 'Tenant.example, @second.example'
  process.env.LOCAL_AUTH_SECRET = SECRET
  process.env.LOCAL_AUTH_CLAIM_UNTIL = new Date(Date.now() + 3600_000).toISOString()

  const db = await import('../src/db.js')
  pool = db.default
  auth = await import('../src/auth.js')
  localAuth = await import('../src/localAuth.js')
  const { createApp } = await import('../src/app.js')
  await db.runMigrations()
  auth.setAuthEnabled(true)
  auth.setEntraVerifier(async (token) => {
    const decoded = jwt.decode(token)
    if (decoded?.iss !== 'fake-entra') throw new Error('bad signature')
    return decoded
  })

  // Tenant accounts still carry the password they chose in the local-only
  // period: exactly the case hybrid must shut.
  await addUser('chief@tenant.example', 'Chief Admin', { superadmin: true })
  await addUser('colleague@tenant.example', 'Col League')
  await addUser('manager@external.example', 'Mana Ger')
  await addUser('newcomer@external.example', 'New Comer', { password: null })

  server = createApp().listen(0)
  await new Promise(r => server.once('listening', r))
  base = `http://127.0.0.1:${server.address().port}/api`
})

after(async () => {
  server?.close()
  await pool?.end()
  await adminQuery(`DROP DATABASE IF EXISTS ${DB_NAME}`)
})

beforeEach(() => localAuth.resetLockouts())

test('config lists the domains that go to Microsoft', async () => {
  const r = await call('GET', '/auth/config')
  assert.equal(r.status, 200)
  assert.equal(r.body.mode, 'hybrid')
  assert.deepEqual(r.body.entraDomains, ['tenant.example', 'second.example'])
})

test('tenant accounts cannot use a password, whatever the case of the email', async () => {
  for (const email of ['colleague@tenant.example', 'Colleague@TENANT.example', 'nobody@second.example']) {
    const r = await call('POST', '/auth/login', { email, password: PASSWORD })
    assert.equal(r.status, 403, email)
    assert.equal(r.body.code, 'use_microsoft')
  }
  const claim = await call('POST', '/auth/claim', { email: 'someone@tenant.example', password: 'abbastanza lunga e buona' })
  assert.equal(claim.status, 403)
  assert.equal(claim.body.code, 'use_microsoft')
})

test('a password session opened before the switch no longer works for a tenant account', async () => {
  const { rows: [row] } = await pool.query(`SELECT password_set_at FROM users WHERE email = 'colleague@tenant.example'`)
  const old = localAuth.signToken({ email: 'colleague@tenant.example', name: 'Col League', passwordSetAt: row.password_set_at })
  assert.equal((await call('GET', '/me', undefined, old)).status, 401)
})

test('external accounts sign in with a password; tenant accounts with Microsoft', async () => {
  const login = await call('POST', '/auth/login', { email: 'manager@external.example', password: PASSWORD })
  assert.equal(login.status, 200, JSON.stringify(login.body))
  const me = await call('GET', '/me', undefined, login.body.token)
  assert.equal(me.status, 200)
  assert.equal(me.body.email, 'manager@external.example')

  const ms = await call('GET', '/me', undefined, entraToken('colleague@tenant.example'))
  assert.equal(ms.status, 200)
  assert.equal(ms.body.email, 'colleague@tenant.example')
})

test('a token is checked by the verifier of its own kind only', async () => {
  // HS256 with a guessed secret: refused by the local verifier, never handed to Entra.
  const forged = jwt.sign({ preferred_username: 'manager@external.example', iss: 'fake-entra', pwv: 0 }, 'x'.repeat(40), { algorithm: 'HS256' })
  assert.equal((await call('GET', '/me', undefined, forged)).status, 401)
  // RS256-looking token the Entra half rejects.
  const bad = entraToken('colleague@tenant.example').replace(/^[^.]+\.[^.]+/, (m) => {
    const [h] = m.split('.')
    return `${h}.${Buffer.from(JSON.stringify({ preferred_username: 'x@tenant.example', iss: 'evil' })).toString('base64url')}`
  })
  assert.equal((await call('GET', '/me', undefined, bad)).status, 401)
  assert.equal((await call('GET', '/me', undefined, 'not-a-jwt')).status, 401)
})

test('the console hands out passwords to external accounts only', async () => {
  const chief = entraToken('chief@tenant.example')
  const users = (await call('GET', '/users', undefined, chief)).body
  const id = (email) => users.find(u => u.email === email).id

  const tenant = await call('POST', `/users/${id('colleague@tenant.example')}/password`, {}, chief)
  assert.equal(tenant.status, 400)

  const ext = await call('POST', `/users/${id('newcomer@external.example')}/password`, {}, chief)
  assert.equal(ext.status, 200)
  const login = await call('POST', '/auth/login', { email: 'newcomer@external.example', password: ext.body.password })
  assert.equal(login.status, 200)
})

test('hybrid without ENTRA_DOMAINS refuses to start', () => {
  const saved = process.env.ENTRA_DOMAINS
  process.env.ENTRA_DOMAINS = ''
  try {
    assert.throws(() => localAuth.checkLocalConfig(), /ENTRA_DOMAINS/)
  } finally {
    process.env.ENTRA_DOMAINS = saved
  }
})

// Board admins hand out passwords to the members of their board, but only
// when that gives them nothing they do not already have.
test('a board admin issues passwords only to members entirely within their boards', async () => {
  await pool.query(`INSERT INTO tenants (slug, name) VALUES ('other', 'Other board') ON CONFLICT DO NOTHING`)
  await addUser('boardadmin@external.example', 'Board Admin')
  await addUser('onlyhere@external.example', 'Only Here', { password: null })
  await addUser('twoboards@external.example', 'Two Boards', { password: null })
  await addUser('elsewhere@external.example', 'Else Where', { password: null })
  await addUser('bigboss@external.example', 'Big Boss', { superadmin: true, password: null })
  await pool.query(`
    INSERT INTO memberships (tenant_id, email, role)
    SELECT t.id, v.email, v.role::user_role FROM tenants t, (VALUES
      ('backup', 'boardadmin@external.example', 'admin'),
      ('backup', 'onlyhere@external.example',   'viewer'),
      ('backup', 'twoboards@external.example',  'viewer'),
      ('other',  'twoboards@external.example',  'admin'),
      ('other',  'elsewhere@external.example',  'viewer'),
      ('backup', 'bigboss@external.example',    'viewer'),
      ('backup', 'colleague@tenant.example',    'viewer'),
      ('backup', 'manager@external.example',    'viewer')
    ) AS v(slug, email, role) WHERE t.slug = v.slug`)

  const admin = (await call('POST', '/auth/login', { email: 'boardadmin@external.example', password: PASSWORD })).body.token
  const viewer = (await call('POST', '/auth/login', { email: 'manager@external.example', password: PASSWORD })).body.token
  const pw = (email, token = admin) => call('POST', `/t/backup/members/${encodeURIComponent(email)}/password`, {}, token)

  const list = (await call('GET', '/t/backup/members', undefined, admin)).body
  const flag = (email) => list.find(m => m.email === email).canIssuePassword
  assert.equal(flag('onlyhere@external.example'), true)
  assert.equal(flag('twoboards@external.example'), false)
  assert.equal(flag('bigboss@external.example'), false)
  assert.equal(flag('colleague@tenant.example'), false)
  assert.equal(list.find(m => m.email === 'colleague@tenant.example').microsoft, true)

  const ok = await pw('onlyhere@external.example')
  assert.equal(ok.status, 200, JSON.stringify(ok.body))
  assert.equal(ok.body.member.passwordSetAt !== null, true)
  const login = await call('POST', '/auth/login', { email: 'onlyhere@external.example', password: ok.body.password })
  assert.equal(login.status, 200)

  assert.equal((await pw('twoboards@external.example')).status, 403)   // also admin elsewhere
  assert.equal((await pw('bigboss@external.example')).status, 403)     // superadmin
  assert.equal((await pw('colleague@tenant.example')).status, 400)     // Microsoft account
  assert.equal((await pw('elsewhere@external.example')).status, 404)   // not on this board
  assert.equal((await pw('onlyhere@external.example', viewer)).status, 403) // viewer caller

  // The superadmin may always (here: Microsoft-signed chief).
  const chief = entraToken('chief@tenant.example')
  assert.equal((await pw('twoboards@external.example', chief)).status, 200)
})
