// Fire-and-forget assignment notifications.
//
// When a task gets an owner — on create, or when the owner field changes — this
// POSTs a JSON payload to a Power Automate "When a HTTP request is received"
// webhook. The Flow handles the last mile (email / Teams). See CLAUDE.md,
// section "Notifiche di assegnazione".
//
// Design rules:
//  - Never block the request: callers invoke without `await`.
//  - Never throw: every error is caught and logged. A failed notification must
//    not turn a successful task mutation into a 500.
//  - No-op when NOTIFY_WEBHOOK_URL is unset — dev/demo stays silent, and prod
//    enables the feature simply by setting the env var.

import pool from './db.js'

const WEBHOOK_URL = process.env.NOTIFY_WEBHOOK_URL || ''
const APP_URL = process.env.APP_PUBLIC_URL || 'https://kanbanops.mauden.com'

// Owner display names are free text; the users table is the bridge to an email.
// display_owner is not unique-constrained, so two homonyms are possible — log
// and take the first rather than guessing.
async function resolveOwnerEmail(ownerName) {
  const { rows } = await pool.query(
    'SELECT email FROM users WHERE display_owner = $1 ORDER BY created_at LIMIT 2',
    [ownerName],
  )
  if (rows.length === 0) return null
  if (rows.length > 1) {
    console.warn(`notify: display_owner "${ownerName}" maps to multiple users — using the first`)
  }
  return rows[0].email
}

function formatDeadline(d) {
  if (!d) return null
  if (d instanceof Date) return d.toISOString().slice(0, 10)
  return String(d).slice(0, 10)
}

/**
 * Fire-and-forget assignment notification. Safe to call without await.
 *
 * @param {object}   args
 * @param {object}   args.task      - task DB row (group_name, reference, …)
 * @param {string}   args.event     - 'task.assigned' | 'task.reassigned'
 * @param {object}  [args.assigner] - { email, name } of the user assigning (req.user)
 */
export async function notifyAssignment({ task, event, assigner }) {
  try {
    if (!WEBHOOK_URL) return            // feature off (dev/demo, or prod not yet wired)
    if (!task || !task.owner) return    // nothing to notify — task left unassigned

    const ownerEmail = await resolveOwnerEmail(task.owner)
    if (!ownerEmail) {
      console.warn(`notify: no email for owner "${task.owner}" — notification skipped`)
      return
    }

    // Don't ping someone for assigning a task to themselves.
    if (assigner?.email && assigner.email.toLowerCase() === ownerEmail.toLowerCase()) return

    const payload = {
      event,
      task: {
        id: task.id,
        group: task.group_name,
        reference: task.reference || '',
        description: task.description || '',
        status: task.status,
        deadline: formatDeadline(task.deadline),
      },
      owner: { name: task.owner, email: ownerEmail },
      assignedBy: assigner?.email ? { name: assigner.name || null, email: assigner.email } : null,
      appUrl: APP_URL,
      timestamp: new Date().toISOString(),
    }

    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      console.warn(`notify: webhook responded ${res.status} for task ${task.id}`)
    }
  } catch (err) {
    console.warn('notify: assignment notification failed:', err.message)
  }
}
