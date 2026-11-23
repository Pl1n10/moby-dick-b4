// KanbanOps Connector — content script, runs only on KanbanOps pages.
//
// Bridges the page and the service worker:
//   page → { source: 'kanbanops-page', type: 'connect' | 'finish', requestId, ... }
//   page ← { source: 'kanbanops-connector', type: 'result' | 'finished', requestId, ... }
// The attribute on <html> tells the page the extension is installed and
// which providers it can connect.

const VERSION = '1.0.0'
const PROVIDERS = ['cohesity']   // keep in sync with background.js

document.documentElement.dataset.kanbanopsConnector = `${VERSION};${PROVIDERS.join(',')}`

const ports = new Map()   // requestId → port

function toPage(msg) {
  window.postMessage({ source: 'kanbanops-connector', ...msg }, window.location.origin)
}

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return
  const msg = event.data
  if (!msg || msg.source !== 'kanbanops-page' || typeof msg.requestId !== 'string') return

  if (msg.type === 'connect') {
    const port = chrome.runtime.connect({ name: 'kanbanops-connector' })
    ports.set(msg.requestId, port)
    // A service worker sleeps after ~30 s of silence: keep it awake while
    // the user is logging in.
    const keepAlive = setInterval(() => { try { port.postMessage({ type: 'ping' }) } catch { /* gone */ } }, 20_000)
    const done = () => { clearInterval(keepAlive); ports.delete(msg.requestId) }

    port.onMessage.addListener((reply) => {
      if (reply.type === 'token') toPage({ type: 'result', requestId: msg.requestId, ok: true, token: reply.token })
      else if (reply.type === 'cancelled') { toPage({ type: 'result', requestId: msg.requestId, ok: false, cancelled: true }); done(); port.disconnect() }
      else if (reply.type === 'error') { toPage({ type: 'result', requestId: msg.requestId, ok: false, error: reply.message }); done(); port.disconnect() }
      else if (reply.type === 'finished') { toPage({ type: 'finished', requestId: msg.requestId }); done(); port.disconnect() }
    })
    port.onDisconnect.addListener(done)
    port.postMessage({ type: 'connect', provider: msg.provider })
    return
  }

  if (msg.type === 'finish') {
    ports.get(msg.requestId)?.postMessage({ type: 'finish', saved: msg.saved === true })
  }
})
