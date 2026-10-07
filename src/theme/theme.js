import { useSyncExternalStore } from 'react'
import apiFetch from '../auth/apiFetch.js'
import { AUTH_ENABLED } from '../auth/authConfig.js'

// Theme preference: 'light' | 'dark' | null (null = follow the OS).
//
// Source of truth is the server (users.theme, so the choice follows the user
// on every PC). localStorage keeps a copy so index.html can paint the right
// theme before React and /api/me load — no flash of the wrong theme. The
// effective theme is written on <html data-theme>, which index.css keys on.
//
// Stored values: 'light' | 'dark' | 'system'. Nothing stored means this
// browser has not synced with the server yet: it paints dark (the theme
// KanbanOps always had) instead of guessing from the OS, so a user whose
// saved choice is dark never sees a flash of light on a new PC.

const STORAGE_KEY = 'kanbanops:theme'
const media = window.matchMedia('(prefers-color-scheme: light)')

function readStored() {
  try { return localStorage.getItem(STORAGE_KEY) } catch { return null }
}

function writeStored(pref) {
  try { localStorage.setItem(STORAGE_KEY, pref || 'system') } catch { /* storage blocked: the server copy still applies */ }
}

const stored = readStored()
let pref = stored === 'light' || stored === 'dark' ? stored : null
// false until we know the user's choice (stored copy or server answer).
let known = stored === 'light' || stored === 'dark' || stored === 'system'
const listeners = new Set()
let snapshot = null

function effective() {
  if (pref) return pref
  if (!known) return 'dark'
  return media.matches ? 'light' : 'dark'
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
  if (next === pref && known) return
  pref = next
  known = true
  writeStored(pref)
  apply()
}

// User choice from the header toggle: applied at once, saved locally and,
// when logged in, on the server.
export function setThemePref(next) {
  pref = next
  known = true
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
