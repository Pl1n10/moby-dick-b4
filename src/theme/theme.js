import { useSyncExternalStore } from 'react'
import apiFetch from '../auth/apiFetch.js'
import { AUTH_ENABLED } from '../auth/authConfig.js'

// Theme preference: 'light' | 'dark' | null (null = follow the OS).
//
// Source of truth is the server (users.theme, so the choice follows the user
// on every PC). localStorage keeps a copy so index.html can paint the right
// theme before React and /api/me load — no flash of the wrong theme. The
// effective theme is written on <html data-theme>, which index.css keys on.

const STORAGE_KEY = 'kanbanops:theme'
const media = window.matchMedia('(prefers-color-scheme: light)')

function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch { return null }
}

function writeStored(pref) {
  try {
    if (pref) localStorage.setItem(STORAGE_KEY, pref)
    else localStorage.removeItem(STORAGE_KEY)
  } catch { /* storage blocked: the server copy still applies */ }
}

let pref = readStored()
const listeners = new Set()
let snapshot = null

function effective() {
  return pref || (media.matches ? 'light' : 'dark')
}

function apply() {
  document.documentElement.dataset.theme = effective()
  snapshot = { pref, theme: effective() }
  listeners.forEach(fn => fn())
}

// Following the OS: react when it switches (e.g. automatic dark at sunset).
media.addEventListener('change', () => { if (!pref) apply() })
apply()

// Server value from /api/me wins over the local copy (another PC may have
// changed it). Never written back: it came from the server.
export function syncThemeFromServer(serverPref) {
  if (serverPref === undefined) return
  const next = serverPref === 'light' || serverPref === 'dark' ? serverPref : null
  if (next === pref) return
  pref = next
  writeStored(pref)
  apply()
}

// User choice from the header toggle: applied at once, saved locally and,
// when logged in, on the server.
export function setThemePref(next) {
  pref = next
  writeStored(pref)
  apply()
  if (AUTH_ENABLED) {
    apiFetch('/api/me/theme', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: pref }),
    }).catch(err => console.error('Failed to save theme:', err))
  }
}

export function useTheme() {
  return useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
    () => snapshot,
  )
}
