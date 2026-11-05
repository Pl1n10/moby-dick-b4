import { useSyncExternalStore } from 'react'

// Session of the local login (AUTH_MODE=local): the backend's token plus the
// identity it carries, in localStorage so it survives a reload and is shared
// by the tabs of the same browser. Logging out in one tab logs out the others
// (storage event).

const KEY = 'kanbanops:session'
const LAST_EMAIL_KEY = 'kanbanops:lastEmail'

function decodePayload(token) {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(decodeURIComponent(escape(atob(part))))
  } catch {
    return null
  }
}

// Used only when localStorage throws (blocked site data): the session then
// lasts until the page is reloaded.
let memToken = null

function storedToken() {
  try { return localStorage.getItem(KEY) } catch { return memToken }
}

function read() {
  try {
    const raw = storedToken()
    if (!raw) return null
    const payload = decodePayload(raw)
    if (!payload?.preferred_username || typeof payload.exp !== 'number') return null
    // Expired: treat as logged out; the backend would answer 401 anyway.
    if (payload.exp * 1000 <= Date.now()) return null
    return { token: raw, email: payload.preferred_username, name: payload.name || null }
  } catch {
    return null
  }
}

let current = read()
const listeners = new Set()

function emit() {
  current = read()
  listeners.forEach(l => l())
}

function subscribe(listener) {
  listeners.add(listener)
  const onStorage = (e) => { if (e.key === KEY) emit() }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function getSession() {
  // Re-check expiry on every read: a tab left open past it must not keep
  // sending a dead token.
  if (current && !read()) current = null
  return current
}

export function setSession(token) {
  memToken = token
  try {
    localStorage.setItem(KEY, token)
    const email = decodePayload(token)?.preferred_username
    if (email) localStorage.setItem(LAST_EMAIL_KEY, email)
  } catch { /* storage blocked: memToken keeps the session until reload */ }
  emit()
}

export function clearSession() {
  memToken = null
  try { localStorage.removeItem(KEY) } catch { /* nothing to clear */ }
  emit()
}

export function lastEmail() {
  try { return localStorage.getItem(LAST_EMAIL_KEY) || '' } catch { return '' }
}

export function useLocalSession() {
  return useSyncExternalStore(subscribe, getSession)
}
