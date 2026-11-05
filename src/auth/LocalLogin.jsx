import { useEffect, useState } from 'react'
import S from '../styles.js'
import { setSession, lastEmail } from './localSession.js'

// Login screen of the local mode (AUTH_MODE=local): email + password, plus
// "first access" while the self-activation window is open. The backend's
// error codes pick what to show; its messages are already in Italian.

async function post(path, body) {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await r.json().catch(() => null)
  if (!r.ok) {
    const err = new Error(data?.error || `Errore del server (HTTP ${r.status})`)
    err.code = data?.code
    throw err
  }
  return data
}

function formatUntil(iso) {
  return new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
}

const label = { display: 'block', fontSize: '12px', color: 'var(--muted)', margin: '12px 0 4px', fontFamily: S.sans }
const input = { ...S.inputBase, width: '100%', boxSizing: 'border-box' }

export default function LocalLogin() {
  const [config, setConfig] = useState(null)
  const [mode, setMode] = useState('login') // 'login' | 'claim'
  const [email, setEmail] = useState(lastEmail)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/auth/config')
      .then(r => r.ok ? r.json() : null)
      .then(setConfig)
      .catch(() => setConfig(null))
  }, [])

  const claimOpen = Boolean(config?.claimOpen)
  const min = config?.passwordMin || 10

  const switchTo = (next) => { setMode(next); setError(null); setPassword(''); setConfirm('') }

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    if (mode === 'claim') {
      if (password.length < min) return setError(`La password deve avere almeno ${min} caratteri.`)
      if (password !== confirm) return setError('Le due password non coincidono.')
    }
    setBusy(true)
    try {
      const data = await post(mode === 'claim' ? '/api/auth/claim' : '/api/auth/login', { email: email.trim(), password })
      setSession(data.token)
    } catch (err) {
      // Tried to log in on an account that has no password yet: offer the
      // first access straight away, email kept.
      if (err.code === 'not_activated' && claimOpen) { setMode('claim'); setPassword(''); setConfirm('') }
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
    }}>
      <form onSubmit={submit} style={{
        width: '100%', maxWidth: '380px', padding: '32px', boxSizing: 'border-box',
        border: '1px solid var(--border-subtle)', borderRadius: '8px', background: 'var(--bg)',
      }}>
        <h1 style={{ margin: '0 0 8px', fontFamily: S.mono, fontSize: '22px', textAlign: 'center' }}>KanbanOps</h1>
        <p style={{ margin: '0 0 8px', fontFamily: S.sans, fontSize: '13px', color: 'var(--muted)', textAlign: 'center', lineHeight: 1.5 }}>
          {mode === 'claim'
            ? 'Primo accesso: scegli la tua password.'
            : 'Accedi con la tua email aziendale e la tua password.'}
        </p>

        <label style={label} htmlFor="login-email">Email</label>
        <input id="login-email" type="email" autoComplete="username" required autoFocus={!email}
          value={email} onChange={e => setEmail(e.target.value)} placeholder="nome.cognome@mauden.com" style={input} />

        <label style={label} htmlFor="login-password">{mode === 'claim' ? 'Nuova password' : 'Password'}</label>
        <input id="login-password" type="password" required autoFocus={Boolean(email)}
          autoComplete={mode === 'claim' ? 'new-password' : 'current-password'}
          value={password} onChange={e => setPassword(e.target.value)} style={input} />

        {mode === 'claim' && (
          <>
            <label style={label} htmlFor="login-confirm">Ripeti la password</label>
            <input id="login-confirm" type="password" required autoComplete="new-password"
              value={confirm} onChange={e => setConfirm(e.target.value)} style={input} />
            <p style={{ fontSize: '12px', color: 'var(--muted)', fontFamily: S.sans, lineHeight: 1.5, margin: '10px 0 0' }}>
              Almeno {min} caratteri, senza il tuo nome, «mauden» o il nome di un mese: una frase di tre o quattro parole va benissimo. Una volta scelta non potrai cambiarla da solo: se la dimentichi, chiedi a un amministratore.
            </p>
          </>
        )}

        {error && (
          <div role="alert" style={{
            marginTop: '14px', padding: '8px 10px', borderRadius: '4px', fontSize: '12px', fontFamily: S.sans,
            color: 'var(--danger)', border: '1px solid var(--danger-border)', lineHeight: 1.5,
          }}>{error}</div>
        )}

        <button type="submit" disabled={busy} style={{
          marginTop: '18px', padding: '10px 18px', background: '#2563eb', border: '1px solid var(--accent)',
          borderRadius: '4px', color: '#fff', fontFamily: S.mono, fontSize: '13px',
          fontWeight: 600, cursor: busy ? 'wait' : 'pointer', width: '100%', opacity: busy ? 0.7 : 1,
        }}>
          {mode === 'claim' ? 'Attiva e accedi' : 'Accedi'}
        </button>

        <div style={{ marginTop: '16px', fontSize: '12px', fontFamily: S.sans, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.6 }}>
          {mode === 'login' && claimOpen && (
            <>
              Primo accesso?{' '}
              <button type="button" onClick={() => switchTo('claim')} style={linkButton}>Scegli la tua password</button>
              <div style={{ color: 'var(--faint)', marginBottom: '8px' }}>possibile fino al {formatUntil(config.claimUntil)}</div>
            </>
          )}
          {mode === 'login' && 'Password dimenticata? Chiedi a un amministratore di KanbanOps.'}
          {mode === 'claim' && (
            <button type="button" onClick={() => switchTo('login')} style={linkButton}>Ho già una password</button>
          )}
        </div>
      </form>
    </div>
  )
}

const linkButton = {
  background: 'none', border: 'none', padding: 0, color: 'var(--accent)',
  cursor: 'pointer', fontFamily: S.sans, fontSize: '12px', textDecoration: 'underline',
}
