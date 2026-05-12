import pg from 'pg'
import { readFileSync, readdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const { Pool } = pg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://moby:moby@localhost:5432/moby',
})

/** Wait for PostgreSQL to be reachable (useful at container startup) */
export async function waitForDb(maxRetries = 15) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await pool.query('SELECT 1')
      console.log('Database connected')
      return
    } catch (err) {
      console.log(`Waiting for database... (${i + 1}/${maxRetries})`)
      await new Promise(r => setTimeout(r, 2000))
    }
  }
  throw new Error('Could not connect to database after ' + maxRetries + ' attempts')
}

/** Run SQL migrations (idempotent — safe to re-run).
 *  Applies every *.sql file in migrations/ in lexicographic order, so naming
 *  files NNN_description.sql is enough to control ordering. */
export async function runMigrations() {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const migrationsDir = join(__dirname, '..', 'migrations')
  const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf-8')
    await pool.query(sql)
    console.log(`Applied migration: ${file}`)
  }
  console.log('Migrations completed')
}

export default pool
