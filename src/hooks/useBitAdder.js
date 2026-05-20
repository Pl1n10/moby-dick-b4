import { useState, useEffect, useRef, useCallback } from 'react'
import apiFetch from '../auth/apiFetch.js'

const API = '/api/bitadder'
const TICK_MS = 1000        // bot accrual ogni secondo (lato client)
const SYNC_MS = 5000        // batch POST /click ogni 5s
const LEADERBOARD_MS = 15000 // refresh leaderboard ogni 15s quando visibile

// Hook attivato a piacere (active=true) dal Footer dopo lo sblocco easter egg.
// Quando active=true: fetch stato iniziale, tick locale, sync periodica.
// Quando active=false: niente — il gioco è chiuso dalla sessione (refresh pagina).
export default function useBitAdder(active, visible) {
  const [bits, setBits] = useState(0)
  const [bots, setBots] = useState(0)
  const [nextBotPrice, setNextBotPrice] = useState(1024)
  const [leaderboard, setLeaderboard] = useState({ top: [], me: null })

  // Delta accumulato lato client dall'ultima sync server-side: include sia
  // click manuali sia bit guadagnati dai bot (previsti). Il server è autoritativo
  // e clampa: dopo ogni /click ci riallineiamo al valore tornato.
  const pendingDeltaRef = useRef(0)
  const lastSyncAtRef = useRef(Date.now())
  const inFlightRef = useRef(false)

  // ── Fetch stato iniziale all'attivazione ────────────────
  useEffect(() => {
    if (!active) return
    let cancelled = false
    apiFetch(`${API}/me`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        if (typeof data?.bits === 'number') setBits(data.bits)
        if (typeof data?.bots === 'number') setBots(data.bots)
        if (typeof data?.nextBotPrice === 'number') setNextBotPrice(data.nextBotPrice)
      })
      .catch(err => console.error('bitadder /me failed:', err))
    return () => { cancelled = true }
  }, [active])

  // ── Tick locale 1s: bit += bots ─────────────────────────
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => {
      setBits(b => b + bots)
      pendingDeltaRef.current += bots
    }, TICK_MS)
    return () => clearInterval(id)
  }, [active, bots])

  // ── Sync con server ogni 5s (manda delta, ricevi stato autoritativo) ──
  const flushDelta = useCallback(async () => {
    if (inFlightRef.current) return
    const delta = pendingDeltaRef.current
    const elapsedSec = (Date.now() - lastSyncAtRef.current) / 1000
    if (delta <= 0 || elapsedSec <= 0) {
      lastSyncAtRef.current = Date.now()
      return
    }
    inFlightRef.current = true
    pendingDeltaRef.current = 0
    lastSyncAtRef.current = Date.now()
    try {
      const r = await apiFetch(`${API}/click`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta, elapsedSec }),
      })
      const data = await r.json()
      if (typeof data?.bits === 'number') setBits(data.bits)
      if (typeof data?.bots === 'number') setBots(data.bots)
      if (typeof data?.nextBotPrice === 'number') setNextBotPrice(data.nextBotPrice)
    } catch (err) {
      console.error('bitadder /click failed:', err)
    } finally {
      inFlightRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!active) return
    const id = setInterval(flushDelta, SYNC_MS)
    return () => clearInterval(id)
  }, [active, flushDelta])

  // ── Manual click ────────────────────────────────────────
  const manualClick = useCallback(() => {
    setBits(b => b + 1)
    pendingDeltaRef.current += 1
  }, [])

  // ── Buy bot ─────────────────────────────────────────────
  // Prima flusha eventuali delta pendenti (così il server vede i bit reali),
  // poi chiama /buy-bot. Risposta è autoritativa.
  const buyBot = useCallback(async () => {
    await flushDelta()
    try {
      const r = await apiFetch(`${API}/buy-bot`, { method: 'POST' })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        return { ok: false, error: err.error || 'Not enough bits' }
      }
      const data = await r.json()
      if (typeof data?.bits === 'number') setBits(data.bits)
      if (typeof data?.bots === 'number') setBots(data.bots)
      if (typeof data?.nextBotPrice === 'number') setNextBotPrice(data.nextBotPrice)
      return { ok: true }
    } catch (err) {
      console.error('bitadder /buy-bot failed:', err)
      return { ok: false, error: 'Network error' }
    }
  }, [flushDelta])

  // ── Leaderboard: fetch solo quando drawer visibile ──────
  const fetchLeaderboard = useCallback(() => {
    apiFetch(`${API}/leaderboard`)
      .then(r => r.json())
      .then(data => {
        if (data && Array.isArray(data.top)) setLeaderboard(data)
      })
      .catch(err => console.error('bitadder /leaderboard failed:', err))
  }, [])

  useEffect(() => {
    if (!active || !visible) return
    fetchLeaderboard()
    const id = setInterval(fetchLeaderboard, LEADERBOARD_MS)
    return () => clearInterval(id)
  }, [active, visible, fetchLeaderboard])

  return { bits, bots, nextBotPrice, leaderboard, manualClick, buyBot, fetchLeaderboard }
}
