// Emergency / bootstrap: set a new random password for an existing user and
// print it once. For when nobody can reach the superadmin console (e.g. the
// superadmin forgot their own password). On the VM:
//
//   docker exec moby-api node src/scripts/set-password.js nome.cognome@mauden.com
//
// Revokes every session of that user, like a reset from the console.

import pool from '../db.js'
import { generatePassword, hashPassword, mustUseMicrosoft } from '../localAuth.js'

const email = (process.argv[2] || '').trim()
if (!email) {
  console.error('Usage: node src/scripts/set-password.js <email>')
  process.exit(2)
}

if (mustUseMicrosoft(email)) {
  console.error(`${email} signs in with Microsoft (AUTH_MODE=hybrid, ENTRA_DOMAINS): a password would be refused.`)
  console.error('If Microsoft login is broken, switch AUTH_MODE back to local (HANDOFF) and run this again.')
  process.exit(1)
}

try {
  const password = generatePassword()
  const { rows: [row] } = await pool.query(
    `UPDATE users SET password_hash = $2, password_set_at = NOW(), password_set_by = 'cli'
     WHERE lower(email) = lower($1) RETURNING email`,
    [email, await hashPassword(password)],
  )
  if (!row) {
    console.error(`No user with email ${email}. Add it from the console first (Utenti → Pre-registra).`)
    process.exitCode = 1
  } else {
    console.log(`New password for ${row.email}: ${password}`)
  }
} finally {
  await pool.end()
}
