// Provider: Cohesity support portal (support.cohesity.com). After the Veritas
// merger it also carries NetBackup cases.
//
// There is no public API for support cases: this speaks the undocumented JSON
// API of the portal's own web app, verified by hand on 2026-11-23. It can
// change without notice — every failure must end up in integrations.last_error,
// never in a crash or a half-written board.
//
// Session, as the portal's browser app does it:
//   POST /auth/refresh  Cookie refresh_token=…  →  Set-Cookie access_token (~58 min)
//                                                   + a NEW refresh_token (8 h)
//   GET  /api/cases     Cookie access_token=…   →  { response: [ Salesforce Case… ] }
// The refresh token ROTATES: the one sent is spent, the new one is handed to
// `saveCredentials` before anything else happens.
//
// Read-only on purpose: no comments, no case creation through an API nobody
// documented.

import { PortalError, timedFetch, parseSetCookies, errorText } from './http.js'

const PORTAL = 'https://support.cohesity.com'
const REFRESH_MARGIN_MS = 5 * 60 * 1000

const CLOSED = new Set(['Closed', 'Duplicate'])

// Cohesity case status → KanbanOps status.
const STATUS_MAP = {
  'Customer pending': 'Waiting',
  'Dispatch/RMA pending': 'Waiting',
  'Work in progress': 'In Progress',
  'Customer Updated': 'In Progress',
  'Solution provided/monitoring': 'Resolved',
  'Close Pending': 'Resolved',
  'Resolved - Customer Updated': 'Resolved',
  Closed: 'Closed',
  Duplicate: 'Closed',
}

const asDate = (v) => (v ? new Date(String(v).replace(/([+-]\d{2})(\d{2})$/, '$1:$2')) : null)

async function refresh(refreshToken) {
  const res = await timedFetch(`${PORTAL}/auth/refresh`, {
    method: 'POST',
    headers: { Cookie: `refresh_token=${refreshToken}` },
  })
  if (res.status === 401 || res.status === 403) {
    throw new PortalError(`refresh rifiutato (${res.status}: ${await errorText(res)})`,
      { status: res.status, sessionExpired: true })
  }
  if (!res.ok) throw new PortalError(`refresh fallito (HTTP ${res.status})`, { status: res.status })
  const cookies = parseSetCookies(res.headers)
  if (!cookies.access_token?.value || !cookies.refresh_token?.value) {
    throw new PortalError('refresh senza token nella risposta: il portale è cambiato?')
  }
  const ttl = Number.isFinite(cookies.access_token.maxAge) ? cookies.access_token.maxAge : 3000
  return {
    refreshToken: cookies.refresh_token.value,
    accessToken: cookies.access_token.value,
    accessExpiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
  }
}

async function getCases(accessToken) {
  const res = await timedFetch(`${PORTAL}/api/cases`, {
    headers: { Accept: 'application/json', Cookie: `access_token=${accessToken}` },
  })
  if (res.status === 401) throw new PortalError('accesso ai case rifiutato (401)', { status: 401 })
  if (!res.ok) throw new PortalError(`lettura dei case fallita (HTTP ${res.status})`, { status: res.status })
  const body = await res.json()
  if (!Array.isArray(body?.response)) {
    throw new PortalError('risposta dei case senza la lista attesa: il portale è cambiato?')
  }
  return body.response.map(normalizeCase).filter(Boolean)
}

// Salesforce Case → the fields we keep. No contact names or emails: we do not
// need them and they are other people's data.
export function normalizeCase(c) {
  if (!c?.Id || !c?.CaseNumber) return null
  return {
    extId: String(c.Id),
    number: String(c.CaseNumber),
    subject: String(c.Subject || ''),
    status: String(c.Status || ''),
    priority: c.Priority ? String(c.Priority) : null,
    product: c.Customer_Selected_Case_Product__c || null,
    clusterName: c.Cluster_Name__c || c.Cluster_ID__r?.Cluster_Name__c || null,
    origin: c.Origin || null,
    openedAt: asDate(c.CreatedDate),
    modifiedAt: asDate(c.LastModifiedDate),
    closedAt: asDate(c.ClosedDate),
  }
}

export default {
  id: 'cohesity',
  label: 'Cohesity',
  portal: PORTAL,

  // What a board admin pastes in the console, and how to get it.
  credential: {
    label: 'refresh_token',
    help: [
      'Entra su support.cohesity.com con l\'account da collegare.',
      'F12 → Application → Cookies → support.cohesity.com.',
      'Riga refresh_token: doppio clic sul Value, copia.',
      'Incollalo qui, poi chiudi la scheda del portale senza fare Logout.',
      'Un login per ogni integrazione: se la stessa sessione è usata in due posti, il primo che la rinnova butta fuori l\'altro.',
    ],
  },

  // Pasted value → the credentials object stored in integrations.credentials.
  // Returns null when it does not look like the cookie value.
  credentialsFrom(pasted) {
    const v = typeof pasted === 'string' ? pasted.trim() : ''
    if (!/^[A-Za-z0-9._~+/=-]{40,4000}$/.test(v)) return null
    return { refreshToken: v }
  },

  hasSession: (cred) => Boolean(cred?.refreshToken),

  // Fetches every case of the account. Rotated tokens go to saveCredentials
  // immediately, before the cases are even requested.
  async fetchCases(cred, saveCredentials) {
    let current = { ...cred }
    const renew = async () => {
      current = await refresh(current.refreshToken)
      await saveCredentials(current)
    }
    const fresh = current.accessToken && current.accessExpiresAt &&
      new Date(current.accessExpiresAt).getTime() - Date.now() > REFRESH_MARGIN_MS
    if (!fresh) await renew()
    try {
      return await getCases(current.accessToken)
    } catch (err) {
      // An access token can die before its cookie says so: one forced refresh.
      if (!(err instanceof PortalError) || err.status !== 401) throw err
      await renew()
      return getCases(current.accessToken)
    }
  },

  isOpen: (c) => !CLOSED.has(c.status),
  mapStatus: (status) => STATUS_MAP[status] || 'In Progress',
  // "P1".."P4" → 1..4 (KanbanOps P0 stays a human decision). Unknown → P3.
  mapPriority(p) {
    const m = /^P([1-4])$/.exec(p || '')
    return m ? Number(m[1]) : 3
  },
  // The case is waiting for us: the folder tab turns amber.
  waitingOnUs: (status) => status === 'Customer pending',
  caseUrl: (extId) => `${PORTAL}/cases/c/${encodeURIComponent(extId)}`,
  describe(c) {
    const lines = [`Case Cohesity ${c.number}${c.product ? ` · ${c.product}` : ''}`]
    if (c.clusterName) lines.push(`Cluster: ${c.clusterName}`)
    if (c.openedAt) {
      const d = c.openedAt.toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' })
      lines.push(`Aperto il ${d}${c.origin ? ` (${c.origin})` : ''}`)
    }
    return lines.join('\n')
  },
}
