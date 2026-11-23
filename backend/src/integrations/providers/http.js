// HTTP helpers shared by the vendor portal providers.

const UA = 'KanbanOps-sync/1.0'
const TIMEOUT_MS = 30_000

// Swappable for tests: no test ever calls a real portal.
let fetchImpl = (...args) => fetch(...args)
export function setFetch(fn) { fetchImpl = fn || ((...args) => fetch(...args)) }

export class PortalError extends Error {
  constructor(message, { status = null, sessionExpired = false } = {}) {
    super(message)
    this.status = status
    this.sessionExpired = sessionExpired
  }
}

// Every call has a timeout: the sync visits the integrations of every board
// one after the other, and one portal hanging must not stall the others.
export async function timedFetch(url, opts = {}) {
  try {
    return await fetchImpl(url, {
      redirect: 'manual',
      ...opts,
      headers: { 'User-Agent': UA, ...(opts.headers || {}) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new PortalError(`il portale non risponde (timeout ${TIMEOUT_MS / 1000}s)`)
    }
    throw new PortalError(`portale irraggiungibile (${err?.cause?.code || err?.message || 'errore di rete'})`)
  }
}

// Set-Cookie headers → { name: { value, maxAge } }. Only what we need.
export function parseSetCookies(headers) {
  const raw = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : []
  const out = {}
  for (const line of raw) {
    const [pair, ...attrs] = line.split(';')
    const eq = pair.indexOf('=')
    if (eq < 1) continue
    const name = pair.slice(0, eq).trim()
    const value = pair.slice(eq + 1).trim()
    let maxAge = null
    for (const a of attrs) {
      const [k, v] = a.split('=')
      if (k.trim().toLowerCase() === 'max-age') maxAge = Number(v)
    }
    out[name] = { value, maxAge }
  }
  return out
}

export async function errorText(res) {
  try {
    const body = await res.json()
    return body?.error || res.statusText
  } catch {
    return res.statusText
  }
}
