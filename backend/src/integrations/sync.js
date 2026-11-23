// Mirrors vendor support cases into board tasks, for every integration of
// every board. The provider (providers/) knows the portal; this file knows
// the board.
//
// Rules (decided with Roberto on 2026-11-23):
//   - every OPEN case becomes a task in the integration's section, once;
//   - the task status follows the case status (provider.mapStatus), but only
//     when the CASE changes: a status someone set by hand stays until the
//     vendor moves the case again. Same for priority;
//   - reference, description, owner, deadline, checklist belong to the team:
//     written at creation, never touched again;
//   - a mirrored task someone deleted is not recreated (see migration 017);
//   - a case closing never closes a task with open checklist items (the same
//     rule PATCH enforces): it goes to Resolved instead.
//
// Board isolation: an integration writes only on its own board
// (integ.tenant_id) and only into a section of that board (FK on group_name).
//
// One sync at a time per integration: sessions can rotate, so two concurrent
// refreshes would burn them. The API runs as a single process, so an
// in-memory guard is enough. Integrations run one after the other; each
// portal call has a timeout (providers/http.js), so one hanging portal delays
// the others by at most that.

import pool from '../db.js'
import { getProvider } from './providers/index.js'
import { PortalError } from './providers/http.js'

const running = new Set()

function sessionExpiredMsg(provider) {
  return `Sessione del portale ${provider.label} scaduta: rifai il login sul portale e incolla una nuova sessione nella console (Integrazioni).`
}

async function saveOutcome(integ, { error = null, ok = false }) {
  await pool.query(
    `UPDATE integrations SET last_sync_at = NOW(), last_error = $3,
       last_ok_at = CASE WHEN $4 THEN NOW() ELSE last_ok_at END
     WHERE id = $1 AND tenant_id = $2`,
    [integ.id, integ.tenant_id, error, ok],
  )
}

// Writes the cases into vendor_cases and the board, in one transaction.
async function applyCases(integ, provider, cases) {
  const stats = { created: 0, updated: 0, open: 0 }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: known } = await client.query(
      `SELECT vc.*, t.id AS live_task_id
       FROM vendor_cases vc LEFT JOIN tasks t ON t.id = vc.task_id AND t.tenant_id = vc.tenant_id
       WHERE vc.integration_id = $1 AND vc.tenant_id = $2`,
      [integ.id, integ.tenant_id],
    )
    const byId = new Map(known.map(r => [r.ext_id, r]))

    for (const c of cases) {
      const open = provider.isOpen(c)
      if (open) stats.open++
      const prev = byId.get(c.extId)
      if (!prev && !open) continue   // closed before we ever saw it: not our business

      let taskId = prev?.task_id ?? null
      if (!prev) {
        const { rows: [task] } = await client.query(
          `INSERT INTO tasks (tenant_id, group_name, reference, description, status, priority, owner, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, '', NOW()) RETURNING id`,
          [integ.tenant_id, integ.group_name, c.subject || `Case ${c.number}`, provider.describe(c),
           provider.mapStatus(c.status), provider.mapPriority(c.priority)],
        )
        taskId = task.id
        stats.created++
      } else if (prev.live_task_id) {
        const sets = []
        const vals = [prev.live_task_id, integ.tenant_id]
        if (prev.status !== c.status) {
          let status = provider.mapStatus(c.status)
          if (status === 'Closed') {
            const { rows: [{ open: openItems }] } = await client.query(
              'SELECT COUNT(*)::int AS open FROM subtasks WHERE task_id = $1 AND NOT done',
              [prev.live_task_id],
            )
            if (openItems > 0) status = 'Resolved'
          }
          vals.push(status)
          sets.push(`status = $${vals.length}`)
        }
        if (prev.priority !== c.priority && c.priority) {
          vals.push(provider.mapPriority(c.priority))
          sets.push(`priority = $${vals.length}`)
        }
        if (sets.length) {
          await client.query(
            `UPDATE tasks SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
            vals,
          )
          stats.updated++
        }
      }

      await client.query(
        `INSERT INTO vendor_cases (integration_id, tenant_id, ext_id, case_number, subject, status, priority,
                                   product, cluster_name, origin, opened_at, modified_at, closed_at, task_id, synced_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
         ON CONFLICT (integration_id, ext_id) DO UPDATE SET
           case_number = EXCLUDED.case_number, subject = EXCLUDED.subject, status = EXCLUDED.status,
           priority = EXCLUDED.priority, product = EXCLUDED.product, cluster_name = EXCLUDED.cluster_name,
           origin = EXCLUDED.origin, opened_at = EXCLUDED.opened_at, modified_at = EXCLUDED.modified_at,
           closed_at = EXCLUDED.closed_at, synced_at = NOW()`,
        [integ.id, integ.tenant_id, c.extId, c.number, c.subject, c.status, c.priority,
         c.product, c.clusterName, c.origin, c.openedAt, c.modifiedAt, c.closedAt, taskId],
      )
    }
    await client.query('COMMIT')
    return stats
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

// Syncs one integration row. Never throws: the outcome goes to the row.
export async function syncIntegration(integ) {
  if (running.has(integ.id)) return { skipped: 'already running' }
  running.add(integ.id)
  const provider = getProvider(integ.provider)
  try {
    if (!provider) {
      await saveOutcome(integ, { error: `Fornitore sconosciuto: ${integ.provider}` })
      return { error: 'unknown provider' }
    }
    if (!integ.group_name) {
      await saveOutcome(integ, { error: 'Nessuna sezione di destinazione: sceglila nella console.' })
      return { error: 'no section' }
    }
    if (!provider.hasSession(integ.credentials)) {
      await saveOutcome(integ, { error: 'Nessuna sessione: incollala nella console.' })
      return { error: 'no session' }
    }

    const saveCredentials = (cred) => pool.query(
      'UPDATE integrations SET credentials = $3 WHERE id = $1 AND tenant_id = $2',
      [integ.id, integ.tenant_id, JSON.stringify(cred)],
    )
    const cases = await provider.fetchCases(integ.credentials, saveCredentials)
    const stats = await applyCases(integ, provider, cases)
    await saveOutcome(integ, { ok: true })
    console.log(`[integrations] ${integ.provider} "${integ.name}" (${integ.id}): ${stats.open} open, +${stats.created} tasks, ${stats.updated} updated`)
    return stats
  } catch (err) {
    const label = provider?.label || integ.provider
    const msg = err instanceof PortalError && err.sessionExpired ? sessionExpiredMsg(provider)
      : err instanceof PortalError ? `Portale ${label}: ${err.message}`
      : 'Errore interno durante la sincronizzazione (vedi log del container).'
    console.error(`[integrations] ${integ.provider} "${integ.name}" (${integ.id}) failed:`, err.message)
    await saveOutcome(integ, { error: msg }).catch(() => {})
    return { error: msg }
  } finally {
    running.delete(integ.id)
  }
}

// Timer entry point: every enabled integration of every board, in turn.
export async function syncAll() {
  try {
    const { rows } = await pool.query('SELECT * FROM integrations WHERE enabled ORDER BY tenant_id, created_at')
    for (const integ of rows) await syncIntegration(integ)
  } catch (err) {
    console.error('[integrations] sync loop error:', err.message)
  }
}
