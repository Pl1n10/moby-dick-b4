// KanbanOps Connector — service worker.
//
// What it does, and nothing else: when a KanbanOps page asks to connect a
// provider, it opens that portal's login in a popup window, waits for the
// portal to set its session cookie after the login YOU make (password,
// reCAPTCHA and MFA stay yours), hands that cookie value to the KanbanOps page
// that asked, and, once the page says the board saved it, removes the session
// from this browser and closes the window. Removing it matters: the session
// rotates at every refresh, so if the browser kept using it, it would log the
// board out.
//
// The page can only name a provider of the list below: it cannot ask for any
// other cookie. Only KanbanOps pages run the content script (manifest).

const PROVIDERS = {
  cohesity: {
    label: 'Cohesity',
    loginUrl: 'https://support.cohesity.com/auth/login',
    domain: 'support.cohesity.com',
    cookie: 'refresh_token',
    // Cookies to remove from the browser once the board has the session.
    remove: [
      { url: 'https://support.cohesity.com/auth/refresh', name: 'refresh_token' },
      { url: 'https://support.cohesity.com/', name: 'access_token' },
    ],
  },
}

const WAIT_MS = 5 * 60 * 1000

// One pending connection per port (= per KanbanOps tab that asked).
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'kanbanops-connector') return
  let pending = null

  const cleanup = () => {
    if (!pending) return
    chrome.cookies.onChanged.removeListener(pending.onCookie)
    chrome.windows.onRemoved.removeListener(pending.onWindowClosed)
    clearTimeout(pending.timer)
  }
  const reply = (msg) => { try { port.postMessage(msg) } catch { /* tab gone */ } }

  port.onMessage.addListener(async (msg) => {
    if (msg?.type === 'ping') return

    if (msg?.type === 'connect') {
      const provider = PROVIDERS[msg.provider]
      if (!provider) return reply({ type: 'error', message: `Portale non supportato dall'estensione: ${msg.provider}` })
      if (pending) return reply({ type: 'error', message: 'Un collegamento è già in corso' })

      pending = { provider, windowId: null, gotToken: false }
      pending.onCookie = (change) => {
        const c = change.cookie
        if (change.removed || c.name !== provider.cookie) return
        if (c.domain.replace(/^\./, '') !== provider.domain) return
        if (!c.value) return
        pending.gotToken = true
        chrome.cookies.onChanged.removeListener(pending.onCookie)
        reply({ type: 'token', token: c.value })
      }
      pending.onWindowClosed = (id) => {
        if (id !== pending?.windowId || pending.gotToken) return
        cleanup()
        pending = null
        reply({ type: 'cancelled' })
      }
      pending.timer = setTimeout(() => {
        if (pending?.gotToken) return
        const windowId = pending?.windowId
        cleanup()
        pending = null
        if (windowId != null) chrome.windows.remove(windowId).catch(() => {})
        reply({ type: 'error', message: 'Login non completato entro 5 minuti' })
      }, WAIT_MS)
      chrome.cookies.onChanged.addListener(pending.onCookie)
      chrome.windows.onRemoved.addListener(pending.onWindowClosed)

      try {
        const win = await chrome.windows.create({
          url: provider.loginUrl, type: 'popup', width: 520, height: 760, focused: true,
        })
        if (pending) pending.windowId = win.id
      } catch (err) {
        cleanup()
        pending = null
        reply({ type: 'error', message: `Impossibile aprire la finestra di login: ${err.message}` })
      }
      return
    }

    // The page saved (or failed to save) the session on the board.
    if (msg?.type === 'finish' && pending) {
      const { provider, windowId } = pending
      cleanup()
      pending = null
      if (msg.saved) {
        for (const c of provider.remove) await chrome.cookies.remove(c).catch(() => {})
      }
      if (windowId != null) await chrome.windows.remove(windowId).catch(() => {})
      reply({ type: 'finished' })
    }
  })

  port.onDisconnect.addListener(() => {
    // The KanbanOps tab closed or navigated away mid-connection.
    const windowId = pending?.windowId
    cleanup()
    pending = null
    if (windowId != null) chrome.windows.remove(windowId).catch(() => {})
  })
})
