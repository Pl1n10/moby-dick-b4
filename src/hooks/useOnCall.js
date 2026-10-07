import { useState, useEffect, useCallback } from 'react'
import apiFetch from '../auth/apiFetch.js'
import { apiErrorReason } from '../utils.js'
import { useBoard } from '../board/BoardProvider.jsx'

// Who is currently on call (a display_owner string, or null when unset).
// Stored server-side in app_settings so it's the same for everybody and
// survives a refresh; polled on focus like the owners list, since an admin
// may switch the on-call person from another device mid-shift.
// `enabled` = the board has the reperibile feature; otherwise the setting
// does not exist (404) and nothing is fetched.
export default function useOnCall(enabled = true) {
  const API = useBoard().apiBase
  const [onCall, setOnCall] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(() => {
    if (!enabled) { setLoading(false); return }
    apiFetch(`${API}/settings/on_call`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (data) setOnCall(data.value ?? null) })
      .catch(err => console.error('Failed to fetch on-call setting:', err))
      .finally(() => setLoading(false))
  }, [API, enabled])

  useEffect(() => {
    refresh()
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  // Admin-only server-side; resolves to an error string on failure so the
  // caller can surface it and roll the select back.
  const setOnCallPerson = useCallback(async (value) => {
    const previous = onCall
    setOnCall(value || null)          // optimistic
    try {
      const r = await apiFetch(`${API}/settings/on_call`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: value || null }),
      })
      if (!r.ok) {
        setOnCall(previous)
        return await apiErrorReason(r)
      }
      return null
    } catch (err) {
      setOnCall(previous)
      return err.message
    }
  }, [onCall, API])

  return { onCall, loading, setOnCallPerson, refreshOnCall: refresh }
}
