// Local login (AUTH_MODE=local) end to end over HTTP against a real
// PostgreSQL, with the real token verifier (no fake). Same throwaway-database
// pattern as tenancy.test.js. Names are fictional: the repository is public.

import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import jwt from 'jsonwebtoken'

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL || 'postgresql://moby:moby@localhost:5432/moby'
const DB_NAME = `kanbanops_localauth_${process.pid}`
const SECRET = 'test-secret-test-secret-test-secret-0123'

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

const openWindow = () => { process.env.LOCAL_AUTH_CLAIM_UNTIL = new Date(Date.now() + 3600_000).toISOString() }
const closeWindow = () => { process.env.LOCAL_AUTH_CLAIM_UNTIL = new Date(Date.now() - 1000).toISOString() }

async function addUser(email, name, { superadmin = false } = {}) {
  await pool.query('INSERT INTO users (email, display_owner, is_superadmin) VALUES ($1, $2, $3)', [email, name, superadmin])
}

before(async () => {
  await adminQuery(`DROP DATABASE IF EXISTS ${DB_NAME}`)
  await adminQuery(`CREATE DATABASE ${DB_NAME}`)
  const url = new URL(ADMIN_URL)
  url.pathname = `/${DB_NAME}`
  process.env.DATABASE_URL = url.toString()
  // AUTH_MODE is read at import time.
  process.env.AUTH_MODE = 'local'
  process.env.LOCAL_AUTH_SECRET = SECRET

  const db = await import('../src/db.js')
  pool = db.default
  auth = await import('../src/auth.js')
  localAuth = await import('../src/localAuth.js')
  const { createApp } = await import('../src/app.js')
  await db.runMigrations()
  await db.runMigrations()
  auth.setAuthEnabled(true)

  await addUser('chief@example.com', 'Chief Admin', { superadmin: true })
  await addUser('Mixed.Case@example.com', 'Mixed Case')
  await addUser('member@example.com', 'Mem Ber')
  await pool.query(`INSERT INTO memberships (tenant_id, email, role)
                    SELECT id, 'member@example.com', 'admin' FROM tenants WHERE slug = 'backup'`)

  server = createApp().listen(0)
  await new Promise(r => server.once('listening', r))
  base = `http://127.0.0.1:${server.address().port}/api`
})

after(async () => {
  server?.close()
  await pool?.end()
  await adminQuery(`DROP DATABASE IF EXISTS ${DB_NAME}`)
})

beforeEach(() => {
  openWindow()
  localAuth.resetLockouts()
})

async function claimed(email, password) {
  const r = await call('POST', '/auth/claim', { email, password })
  assert.equal(r.status, 200, JSON.stringify(r.body))
  return r.body.token
}

test('config tells the login screen about the claim window', async () => {
  const r = await call('GET', '/auth/config')
  assert.equal(r.status, 200)
  assert.equal(r.body.mode, 'local')
  assert.equal(r.body.claimOpen, true)
  closeWindow()
  assert.equal((await call('GET', '/auth/config')).body.claimOpen, false)
})

test('nothing behind the gate without a token', async () => {
  assert.equal((await call('GET', '/me')).status, 401)
  assert.equal((await call('GET', '/tenants')).status, 401)
  assert.equal((await call('GET', '/me', undefined, 'not-a-jwt')).status, 401)
})

test('a superadmin cannot self-activate: the password is set on the VM', async () => {
  const r = await call('POST', '/auth/claim', { email: 'chief@example.com', password: 'correct horse battery' })
  assert.equal(r.status, 403)
  assert.equal(r.body.code, 'superadmin_cli')
  // What scripts/set-password.js does, with a known password for the tests.
  await pool.query(
    `UPDATE users SET password_hash = $1, password_set_at = NOW(), password_set_by = 'cli' WHERE email = 'chief@example.com'`,
    [await localAuth.hashPassword('correct horse battery')],
  )
})

test('first access: the user picks a password, then it is locked', async () => {
  const token = await claimed('member@example.com', 'member password 0')

  const me = await call('GET', '/me', undefined, token)
  assert.equal(me.status, 200)
  assert.equal(me.body.email, 'member@example.com')

  const again = await call('POST', '/auth/claim', { email: 'member@example.com', password: 'another password!' })
  assert.equal(again.status, 409)
  assert.equal(again.body.code, 'already_active')

  const login = await call('POST', '/auth/login', { email: 'chief@example.com', password: 'correct horse battery' })
  assert.equal(login.status, 200)
  assert.equal((await call('GET', '/tenants', undefined, login.body.token)).status, 200)
})

test('claim refuses unknown emails, short passwords and a closed window', async () => {
  const unknown = await call('POST', '/auth/claim', { email: 'stranger@example.com', password: 'long enough pw' })
  assert.equal(unknown.status, 404)
  assert.equal(unknown.body.code, 'not_registered')
  await addUser('late@example.com', 'La Te')
  const short = await call('POST', '/auth/claim', { email: 'late@example.com', password: 'short' })
  assert.equal(short.status, 400)
  closeWindow()
  const closed = await call('POST', '/auth/claim', { email: 'late@example.com', password: 'long enough pw' })
  assert.equal(closed.status, 403)
  assert.equal(closed.body.code, 'claim_closed')
  const { rows: [row] } = await pool.query(`SELECT password_hash FROM users WHERE email = 'late@example.com'`)
  assert.equal(row.password_hash, null)
})

test('login errors say what is wrong', async () => {
  assert.equal((await call('POST', '/auth/login', { email: 'stranger@example.com', password: 'x' })).body.code, 'not_registered')
  assert.equal((await call('POST', '/auth/login', { email: 'late@example.com', password: 'whatever pw' })).body.code, 'not_activated')
  const wrong = await call('POST', '/auth/login', { email: 'chief@example.com', password: 'wrong password' })
  assert.equal(wrong.status, 401)
  assert.equal(wrong.body.code, 'wrong_password')
})

test('email is matched case-insensitively and the token keeps the stored one', async () => {
  const token = await claimed('mixed.case@EXAMPLE.com', 'mixed case password')
  const me = await call('GET', '/me', undefined, token)
  assert.equal(me.body.email, 'Mixed.Case@example.com')
})

test('ten wrong passwords lock the account for a while', async () => {
  for (let i = 0; i < 10; i++) {
    assert.equal((await call('POST', '/auth/login', { email: 'chief@example.com', password: `nope ${i}` })).status, 401)
  }
  const locked = await call('POST', '/auth/login', { email: 'chief@example.com', password: 'correct horse battery' })
  assert.equal(locked.status, 429)
})

test('a superadmin reset hands out a new password and revokes old sessions', async () => {
  const chief = (await call('POST', '/auth/login', { email: 'chief@example.com', password: 'correct horse battery' })).body.token
  const memberToken = (await call('POST', '/auth/login', { email: 'member@example.com', password: 'member password 0' })).body.token
  const { rows: [member] } = await pool.query(`SELECT id FROM users WHERE email = 'member@example.com'`)

  // A board admin is not a superadmin: no resets.
  assert.equal((await call('POST', `/users/${member.id}/password`, {}, memberToken)).status, 403)

  const reset = await call('POST', `/users/${member.id}/password`, {}, chief)
  assert.equal(reset.status, 200)
  assert.match(reset.body.password, /^[A-Za-z0-9]{4}(-[A-Za-z0-9]{4}){3}$/)
  assert.equal(reset.body.user.passwordSetBy, 'chief@example.com')

  assert.equal((await call('GET', '/me', undefined, memberToken)).status, 401)
  assert.equal((await call('POST', '/auth/login', { email: 'member@example.com', password: 'member password 0' })).status, 401)
  const fresh = await call('POST', '/auth/login', { email: 'member@example.com', password: reset.body.password })
  assert.equal(fresh.status, 200)
  assert.equal((await call('GET', '/me', undefined, fresh.body.token)).status, 200)

  // The console lists the activation state, never the hash.
  const list = await call('GET', '/users', undefined, chief)
  const row = list.body.find(u => u.email === 'member@example.com')
  assert.ok(row.passwordSetAt)
  assert.ok(!JSON.stringify(list.body).includes('scrypt$'))

  // Clearing goes back to "not activated": sessions die, the user claims again.
  assert.equal((await call('DELETE', `/users/${member.id}/password`, undefined, chief)).status, 200)
  assert.equal((await call('GET', '/me', undefined, fresh.body.token)).status, 401)
  await claimed('member@example.com', 'member password 2')
})

test('tokens signed with another secret or expired are refused', async () => {
  const { rows: [u] } = await pool.query(`SELECT password_set_at FROM users WHERE email = 'chief@example.com'`)
  const claims = { preferred_username: 'chief@example.com', pwv: new Date(u.password_set_at).getTime() }
  const opts = { algorithm: 'HS256', issuer: 'kanbanops', audience: 'kanbanops-local' }
  const forged = jwt.sign(claims, 'some-other-secret-some-other-secret-xx', opts)
  assert.equal((await call('GET', '/me', undefined, forged)).status, 401)
  const expired = jwt.sign({ ...claims, exp: Math.floor(Date.now() / 1000) - 10 }, SECRET, opts)
  assert.equal((await call('GET', '/me', undefined, expired)).status, 401)
  const good = jwt.sign(claims, SECRET, { ...opts, expiresIn: '1h' })
  assert.equal((await call('GET', '/me', undefined, good)).status, 200)
})

test('deleting the account ends its sessions', async () => {
  await addUser('leaver@example.com', 'Lea Ver')
  const token = await claimed('leaver@example.com', 'leaver password')
  await pool.query(`DELETE FROM users WHERE email = 'leaver@example.com'`)
  assert.equal((await call('GET', '/me', undefined, token)).status, 401)
})
