// Talks to the "KanbanOps Connector" browser extension (extension/ in the
// repo). The extension opens a vendor portal's login in a popup, waits for the
// session cookie after the login the user makes, and hands it to this page,
// which saves it on the board (PATCH integration). No password ever passes
// through here.

// "1.0.0;cohesity,other" on <html>, set by the extension's content script.
export function connectorProviders() {
  const v = document.documentElement.dataset.kanbanopsConnector
  if (!v) return null
  return (v.split(';')[1] || '').split(',').filter(Boolean)
}

// Resolves to { token, finish(saved) }. finish() tells the extension whether
// the board saved the session: only then it removes it from the browser and
// closes the login window. Rejects with { cancelled: true } if the user closed
// the window.
export function connectProvider(provider) {
  const requestId = (crypto.randomUUID && crypto.randomUUID()) || String(Math.random())
  return new Promise((resolve, reject) => {
    const onMessage = (event) => {
      if (event.source !== window || event.origin !== window.location.origin) return
      const msg = event.data
      if (!msg || msg.source !== 'kanbanops-connector' || msg.requestId !== requestId || msg.type !== 'result') return
      window.removeEventListener('message', onMessage)
      if (!msg.ok) {
        const err = new Error(msg.cancelled ? 'Login annullato' : (msg.error || 'Collegamento non riuscito'))
        err.cancelled = msg.cancelled === true
        reject(err)
        return
      }
      resolve({
        token: msg.token,
        finish: (saved) => window.postMessage(
          { source: 'kanbanops-page', type: 'finish', requestId, saved }, window.location.origin),
      })
    }
    window.addEventListener('message', onMessage)
    window.postMessage({ source: 'kanbanops-page', type: 'connect', requestId, provider }, window.location.origin)
  })
}
