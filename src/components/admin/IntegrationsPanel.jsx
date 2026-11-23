import { useCallback, useEffect, useState } from 'react'
import S from '../../styles.js'
import { useBoard } from '../../board/BoardProvider.jsx'
import { adminCall } from './adminApi.js'
import { actionButtonStyle, dangerButtonStyle, smallSelect, PrimaryButton, Hint } from './ui.jsx'
import Icon from '../Icon.jsx'
import { connectorProviders, connectProvider } from '../../connector.js'

// Board admin: the vendor support portals connected to THIS board. Each
// integration is one portal account, mirrored into one section. Sessions are
// write-only: the server says whether there is one, never what it is.
export default function IntegrationsPanel({ onError }) {
  const { apiBase, pillars } = useBoard()
  const base = `${apiBase}/integrations`
  const [list, setList] = useState(null)
  const [providers, setProviders] = useState([])

  const load = useCallback(() => adminCall('GET', base).then(setList).catch(e => onError(e.message)), [base, onError])
  useEffect(() => {
    load()
    adminCall('GET', `${base}/providers`).then(setProviders).catch(e => onError(e.message))
  }, [base, load, onError])

  const replace = (row) => setList(prev => prev.map(x => (x.id === row.id ? row : x)))

  if (!list) return <Hint>Caricamento…</Hint>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '12px' }}>
      <Hint>
        I case aperti sui portali di supporto collegati qui diventano task di questa lavagna, nella sezione scelta, con
        una linguetta che porta al case. Lo stato del task segue quello del case; riferimento, descrizione, owner e
        checklist restano vostri. Ogni integrazione è un account del portale: se ne collegate più d'uno (per esempio
        clienti diversi), ognuno ha la sua sessione. La sincronizzazione gira ogni 15 minuti.
      </Hint>

      {list.length === 0 && <div style={{ color: 'var(--muted)' }}>Nessuna integrazione su questa lavagna.</div>}

      {list.map(integ => (
        <IntegrationCard key={integ.id} integ={integ} base={base} pillars={pillars}
          provider={providers.find(p => p.id === integ.provider)}
          onChange={replace} onDeleted={() => setList(prev => prev.filter(x => x.id !== integ.id))} onError={onError} />
      ))}

      <NewIntegration base={base} pillars={pillars} providers={providers}
        onCreated={row => setList(prev => [...prev, row])} onError={onError} />
    </div>
  )
}

function IntegrationCard({ integ, base, pillars, provider, onChange, onDeleted, onError }) {
  const url = `${base}/${integ.id}`
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async (fn) => {
    setBusy(true)
    try { return await fn() } catch (e) { onError(e.message); return null } finally { setBusy(false) }
  }
  const patch = (body) => run(async () => { const row = await adminCall('PATCH', url, body); onChange(row); return row })
  const syncNow = () => run(async () => onChange((await adminCall('POST', `${url}/sync`)).integration))

  const healthy = integ.lastOkAt && !integ.lastError

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Icon name="folder2-open" />
        <InlineName value={integ.name} disabled={busy} onSave={name => patch({ name })} />
        <span style={{ color: 'var(--muted)' }}>{integ.providerLabel}</span>
        <span style={{ flex: 1 }} />
        <button style={dangerButtonStyle} disabled={busy} onClick={() => {
          if (!window.confirm(`Eliminare l'integrazione "${integ.name}"? I task restano sulla lavagna, senza linguetta.`)) return
          run(async () => { await adminCall('DELETE', url); onDeleted() })
        }}><Icon name="trash" /> Elimina</button>
      </div>

      <Row label="Attiva">
        <input type="checkbox" checked={integ.enabled} disabled={busy} onChange={e => patch({ enabled: e.target.checked })} />
      </Row>
      <Row label="Sezione dei task">
        <select value={integ.group || ''} disabled={busy} style={smallSelect} onChange={e => patch({ group: e.target.value || null })}>
          <option value="">—</option>
          {pillars.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </Row>
      <Row label="Stato">
        <span style={{ color: healthy ? 'var(--success)' : integ.lastError ? 'var(--danger)' : 'var(--muted)' }}>
          {integ.lastError
            ? integ.lastError
            : integ.lastOkAt
              ? `OK, ultima sincronizzazione ${when(integ.lastOkAt)} · ${integ.openCases} case aperti`
              : 'Mai sincronizzata'}
        </span>
      </Row>
      <Row label="Sessione portale">
        <span style={{ color: 'var(--muted)' }}>
          {integ.hasSession
            ? `impostata ${when(integ.sessionSetAt)}${integ.sessionSetBy ? ` da ${integ.sessionSetBy}` : ''}`
            : 'nessuna'}
        </span>
      </Row>

      <ConnectRow integ={integ} busy={busy} onToken={async (token) => {
        const row = await patch({ credential: token })
        if (row) syncNow()
        return Boolean(row)
      }} onError={onError} />

      <details>
        <summary style={{ cursor: 'pointer', color: 'var(--muted)' }}>Oppure incolla la sessione a mano</summary>
        {provider && (
          <ol style={{ margin: '8px 0 10px 18px', padding: 0, color: 'var(--muted)', lineHeight: 1.6 }}>
            {provider.credential.help.map((h, i) => <li key={i}>{h}</li>)}
          </ol>
        )}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input type="password" value={token} onChange={e => setToken(e.target.value)}
            placeholder={provider?.credential.label || 'sessione'} autoComplete="off" spellCheck={false}
            style={{ ...S.inputBase, flex: 1, fontFamily: S.mono, fontSize: '12px' }} />
          <PrimaryButton disabled={busy || !token.trim()} onClick={async () => {
            if (await patch({ credential: token.trim() })) { setToken(''); syncNow() }
          }}>Salva e sincronizza</PrimaryButton>
        </div>
        <div style={{ color: 'var(--muted)', marginTop: '6px' }}>
          Resta solo nel database della board e non viene mai mostrata. Chi la ha può leggere i case di quell'account
          finché la sessione dura.
        </div>
      </details>

      <div>
        <button style={actionButtonStyle} disabled={busy || !integ.hasSession || !integ.group} onClick={syncNow}>
          <Icon name="arrow-repeat" /> {busy ? 'In corso…' : 'Sincronizza ora'}
        </button>
      </div>
    </div>
  )
}

// "Connetti": the extension opens the portal login in a popup; after the
// login the user makes there, the session comes back here and is saved.
function ConnectRow({ integ, busy, onToken, onError }) {
  const [state, setState] = useState('idle')   // idle | waiting | saving
  const supported = connectorProviders()
  const available = supported?.includes(integ.provider)

  const connect = async () => {
    setState('waiting')
    let link = null
    try {
      link = await connectProvider(integ.provider)
      setState('saving')
      const saved = await onToken(link.token)
      link.finish(saved)
    } catch (e) {
      if (!e.cancelled) onError(e.message)
      link?.finish(false)
    } finally {
      setState('idle')
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
      <PrimaryButton disabled={busy || !available || state !== 'idle'} onClick={connect}>
        <Icon name="box-arrow-in-right" style={{ marginRight: '6px' }} />
        {state === 'waiting' ? 'Fai il login nella finestra…' : state === 'saving' ? 'Salvataggio…' : integ.hasSession ? 'Riconnetti' : 'Connetti'}
      </PrimaryButton>
      <span style={{ color: 'var(--muted)' }}>
        {!supported
          ? 'Per il pulsante serve l\'estensione KanbanOps Connector (cartella extension/ del repo). Senza, incolla la sessione a mano qui sotto.'
          : !available
            ? `L'estensione installata non conosce ${integ.providerLabel}: aggiornala.`
            : `Si apre il login di ${integ.providerLabel}: entra col tuo account, al resto pensa KanbanOps.`}
      </span>
    </div>
  )
}

function NewIntegration({ base, pillars, providers, onCreated, onError }) {
  const [provider, setProvider] = useState('')
  const [name, setName] = useState('')
  const [group, setGroup] = useState('')
  const [busy, setBusy] = useState(false)
  const chosen = provider || providers[0]?.id || ''

  const create = async () => {
    setBusy(true)
    try {
      onCreated(await adminCall('POST', base, { provider: chosen, name: name.trim(), group: group || null }))
      setName('')
      setGroup('')
    } catch (e) { onError(e.message) } finally { setBusy(false) }
  }

  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
      <span style={{ fontWeight: 600 }}>Nuova integrazione</span>
      <select value={chosen} onChange={e => setProvider(e.target.value)} style={smallSelect}>
        {providers.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="nome, es. Cohesity · Cliente A"
        style={{ ...S.inputBase, width: '240px', fontSize: '12px' }} />
      <select value={group} onChange={e => setGroup(e.target.value)} style={smallSelect}>
        <option value="">sezione…</option>
        {pillars.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
      <PrimaryButton disabled={busy || !name.trim() || !chosen} onClick={create}>Aggiungi</PrimaryButton>
    </div>
  )
}

function InlineName({ value, disabled, onSave }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = () => { if (draft.trim() && draft.trim() !== value) onSave(draft.trim()); else setDraft(value) }
  return (
    <input value={draft} disabled={disabled} onChange={e => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setDraft(value) }}
      style={{ ...S.inputBase, width: '260px', fontWeight: 600, fontSize: '13px' }} />
  )
}

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span style={{ color: 'var(--muted)', minWidth: '130px' }}>{label}</span>
      {children}
    </div>
  )
}

function when(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })
}
