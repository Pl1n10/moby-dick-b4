import pool from './db.js'

function formatDate(d) {
  if (d instanceof Date) return d.toISOString().slice(0, 10)
  return String(d).slice(0, 10)
}

function shouldSkip(tmpl) {
  if (!tmpl.last_created_date) return false
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const lastStr = formatDate(tmpl.last_created_date)

  switch (tmpl.frequency) {
    case 'daily':
      return lastStr === todayStr
    case 'weekly': {
      const last = new Date(tmpl.last_created_date)
      return Math.floor((now - last) / (1000 * 60 * 60 * 24)) < 7
    }
    case 'monthly': {
      const last = new Date(tmpl.last_created_date)
      return last.getFullYear() === now.getFullYear() && last.getMonth() === now.getMonth()
    }
    default: return false
  }
}

/**
 * Server-side recurring task processor.
 * Runs on a timer — checks active templates, creates tasks when due.
 */
export async function processRecurring() {
  try {
    const { rows: templates } = await pool.query(
      'SELECT * FROM recurring_templates WHERE active = true'
    )
    if (templates.length === 0) return

    const now = new Date()
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')
    const currentTime = `${hh}:${mm}`
    const todayStr = now.toISOString().slice(0, 10)

    for (const tmpl of templates) {
      if (currentTime < tmpl.scheduled_time) continue
      if (shouldSkip(tmpl)) continue

      await pool.query(
        `INSERT INTO tasks
           (group_name, reference, description, status, owner, deadline, recurring_template_id, updated_at)
         VALUES ($1, $2, $3, 'New', $4, NULL, $5, NOW())`,
        [tmpl.group_name, tmpl.reference, tmpl.description, tmpl.owner, tmpl.id]
      )

      await pool.query(
        'UPDATE recurring_templates SET last_created_date = $1 WHERE id = $2',
        [todayStr, tmpl.id]
      )

      console.log(`[recurring] Created task from template "${tmpl.reference}"`)
    }
  } catch (err) {
    console.error('[recurring] Processing error:', err.message)
  }
}
