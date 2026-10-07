import apiFetch from '../../auth/apiFetch.js'

// JSON call for the admin console: resolves to the parsed body, rejects with
// the server's `error` message so panels can show it as is.
export async function adminCall(method, url, body) {
  const r = await apiFetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await r.json().catch(() => null)
  if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`)
  return data
}
