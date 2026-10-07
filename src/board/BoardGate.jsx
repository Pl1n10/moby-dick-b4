import { useEffect, useState } from 'react'
import S from '../styles.js'
import apiFetch from '../auth/apiFetch.js'
import { useUserInfo } from '../auth/UserInfoProvider.jsx'
import { apiErrorReason } from '../utils.js'
import { useBoard } from './BoardProvider.jsx'
import Icon from '../components/Icon.jsx'

// Decides what the user sees before a board renders:
//   /t/<slug> of an existing board  → the board (children)
//   /  with a home board            → redirect to it
//   /  without one (first login)    → the board chooser
//   /t/<unknown>                    → the chooser, with a notice
// Demo mode has no home board: it lands on the first board.
export default function BoardGate({ children }) {
  const userInfo = useUserInfo()
  const { boards, error, slug, board, goToBoard } = useBoard()

  const loading = boards === null || userInfo.loading
  const target = !slug && !loading
    ? (userInfo.homeBoard || (userInfo.demo ? boards[0]?.slug : null))
    : null

  useEffect(() => {
    if (target) goToBoard(target, { replace: true })
  }, [target, goToBoard])

  if (loading || target) return <Centered>Caricamento…</Centered>
  if (board) return children

  return (
    <BoardChooser
      notice={slug ? `La lavagna "${slug}" non esiste.` : error ? `Impossibile caricare le lavagne: ${error}` : null}
      firstLogin={!userInfo.homeBoard && !userInfo.demo}
    />
  )
}

function Centered({ children }) {
  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)', color: 'var(--muted)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: S.sans, fontSize: '13px',
    }}>{children}</div>
  )
}

// First login: the user says which board they belong to. That becomes their
// home board and they join it as viewer (PUT /api/me/home); they can still
// look at the others from the switcher. Also reachable on an unknown slug,
// where picking a board just opens it.
export function BoardChooser({ notice, firstLogin }) {
  const { boards, goToBoard } = useBoard()
  const userInfo = useUserInfo()
  const [busy, setBusy] = useState(null)
  const [err, setErr] = useState(null)

  const pick = async (slug) => {
    setErr(null)
    if (!firstLogin) { goToBoard(slug); return }
    setBusy(slug)
    try {
      const r = await apiFetch('/api/me/home', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      })
      if (!r.ok) { setErr(await apiErrorReason(r)); return }
      await userInfo.refresh()
      goToBoard(slug)
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
    }}>
      <div style={{
        width: '100%', maxWidth: '440px', padding: '32px',
        border: '1px solid var(--border-subtle)', borderRadius: '8px', fontFamily: S.sans,
      }}>
        <h1 style={{ margin: '0 0 8px', fontFamily: S.mono, fontSize: '22px' }}>KanbanOps</h1>
        {notice && (
          <p style={{ margin: '0 0 12px', fontSize: '13px', color: 'var(--amber)' }}>{notice}</p>
        )}
        <p style={{ margin: '0 0 20px', fontSize: '13px', color: 'var(--muted)', lineHeight: 1.5 }}>
          {firstLogin
            ? 'Benvenuto! Scegli la lavagna del tuo team: sarà quella che vedi all\'accesso e comparirai fra gli owner assegnabili. Potrai comunque consultare le altre lavagne.'
            : 'Scegli la lavagna da aprire.'}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {(boards || []).map(b => (
            <button key={b.slug} onClick={() => pick(b.slug)} disabled={busy !== null} style={{
              padding: '12px 14px', textAlign: 'left',
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px',
              color: 'var(--text)', fontFamily: S.sans, fontSize: '14px', fontWeight: 600,
              cursor: busy ? 'wait' : 'pointer',
            }}>
              {b.name}
              <span style={{ display: 'block', marginTop: '2px', fontSize: '12px', fontWeight: 400, color: 'var(--muted)' }}>
                {busy === b.slug ? 'Un momento…' : b.pillars.map(p => p.name).join(' · ')}
              </span>
            </button>
          ))}
          {boards && boards.length === 0 && (
            <p style={{ fontSize: '13px', color: 'var(--faint)' }}>Nessuna lavagna configurata.</p>
          )}
        </div>
        {err && <p style={{ marginTop: '12px', fontSize: '12px', color: 'var(--danger)' }}><Icon name="exclamation-triangle-fill" style={{ marginRight: '6px' }} />{err}</p>}
      </div>
    </div>
  )
}
