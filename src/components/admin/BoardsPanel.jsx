import { useState } from 'react'
import S from '../../styles.js'
import { useBoard } from '../../board/BoardProvider.jsx'
import { adminCall } from './adminApi.js'
import { actionButtonStyle, dangerButtonStyle, PrimaryButton, Hint, InlineText } from './ui.jsx'
import Icon from '../Icon.jsx'

// Superadmin: boards, their sections and per-board settings (task id prefix,
// label of the reference column, on-call feature). Changes reach every open
// tab at the next board reload; the current tab refreshes right away.
export default function BoardsPanel({ onError }) {
  const { boards, refreshBoards, slug: currentSlug, goToBoard } = useBoard()

  const run = (promise) => promise.then(() => { refreshBoards(); return true }).catch(e => { onError(e.message); return false })

  return (
    <div>
      <Hint>
        Ogni lavagna ha le sue sezioni, il suo prefisso per gli ID dei task e le sue impostazioni. Rinominare una
        sezione la rinomina anche sui task; una sezione o una lavagna con dei task non si può eliminare.
      </Hint>
      {(boards || []).map(b => (
        <BoardCard key={b.slug} board={b} run={run}
          onSlugChanged={(next) => { if (b.slug === currentSlug) goToBoard(next, { replace: true }) }}
          onDeleted={() => { if (b.slug === currentSlug) goToBoard(null, { replace: true }) }} />
      ))}
      <NewBoardForm run={run} />
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
      <span style={{ color: 'var(--muted)', minWidth: '130px' }}>{label}</span>
      {children}
    </div>
  )
}

function BoardCard({ board, run, onSlugChanged, onDeleted }) {
  const base = `/api/tenants/${board.slug}`
  const settings = board.settings || {}
  const features = settings.features || {}
  const labels = settings.labels || {}
  const [newSection, setNewSection] = useState('')

  // PATCH replaces the whole settings object: always send it complete.
  const patchSettings = (next) => run(adminCall('PATCH', base, { settings: next }))
  const setLabel = (field, v) => {
    const nextLabels = { ...labels }
    if (v) nextLabels[field] = v; else delete nextLabels[field]
    return patchSettings({ ...settings, labels: nextLabels })
  }
  const setPrefix = (v) => {
    const next = { ...settings }
    if (v) next.idPrefix = v.toUpperCase(); else delete next.idPrefix
    return patchSettings(next)
  }

  const renameSlug = (v) => {
    if (!v) return
    if (!window.confirm(`Cambiare l'indirizzo della lavagna in /t/${v}? I link salvati al vecchio indirizzo smettono di funzionare.`)) return
    run(adminCall('PATCH', base, { slug: v })).then(ok => { if (ok) onSlugChanged(v) })
  }

  const removeBoard = () => {
    if (!window.confirm(`Eliminare la lavagna "${board.name}"? Funziona solo se non ha task né ricorrenti.`)) return
    run(adminCall('DELETE', base)).then(ok => { if (ok) onDeleted() })
  }

  const addSection = () => {
    const name = newSection.trim()
    if (!name) return
    run(adminCall('POST', `${base}/pillars`, { name })).then(ok => { if (ok) setNewSection('') })
  }

  return (
    <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '14px', marginBottom: '12px', background: 'var(--bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        <span style={{ fontSize: '15px', fontWeight: 600 }}>
          <InlineText value={board.name} onSave={v => v && run(adminCall('PATCH', base, { name: v }))} />
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={removeBoard} style={dangerButtonStyle}>Elimina lavagna</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <Field label="Indirizzo">
          <span style={{ fontFamily: S.mono, fontSize: '12px', color: 'var(--muted)' }}>/t/</span>
          <InlineText value={board.slug} mono onSave={renameSlug} />
        </Field>
        <Field label="Prefisso ID task">
          <InlineText value={settings.idPrefix} mono emptyLabel="# (nessuno)" placeholder="es. MD" onSave={setPrefix} />
        </Field>
        <Field label='Nome colonna "Reference"'>
          <InlineText value={labels.reference} emptyLabel="Reference (predefinito)" placeholder="es. Attività"
            onSave={v => setLabel('reference', v)} />
        </Field>
        <Field label="Info Reperibile">
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input type="checkbox" checked={features.reperibile === true}
              onChange={e => patchSettings({ ...settings, features: { ...features, reperibile: e.target.checked } })} />
            <span style={{ color: 'var(--text-2)' }}>tab, colonna Rep. e reperibile di turno</span>
          </label>
        </Field>
      </div>

      <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--muted)' }}>Sezioni</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px', alignItems: 'center' }}>
        {board.pillars.map(p => (
          <span key={p.id} style={{
            display: 'inline-flex', alignItems: 'center', gap: '2px',
            border: '1px solid var(--border)', borderRadius: '6px', padding: '2px 4px 2px 2px', fontSize: '12px',
          }}>
            <InlineText value={p.name} maxWidth="180px"
              onSave={v => v && run(adminCall('PATCH', `${base}/pillars/${p.id}`, { name: v }))} />
            <button title="Elimina sezione (solo se non ha task)"
              onClick={() => {
                if (window.confirm(`Eliminare la sezione "${p.name}"?`)) run(adminCall('DELETE', `${base}/pillars/${p.id}`))
              }}
              style={{ background: 'none', border: 'none', color: 'var(--faint)', cursor: 'pointer', fontSize: '12px' }}><Icon name="x-lg" /></button>
          </span>
        ))}
        <input value={newSection} onChange={e => setNewSection(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addSection() }}
          placeholder="+ nuova sezione"
          style={{ ...S.inputBase, width: '160px', padding: '3px 6px', fontSize: '12px', border: '1px solid var(--border)' }} />
        {newSection.trim() && <button onClick={addSection} style={actionButtonStyle}>Aggiungi</button>}
      </div>
    </div>
  )
}

// "Service Manager" → "service-manager"
function toSlug(name) {
  return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function NewBoardForm({ run }) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [prefix, setPrefix] = useState('')
  const [referenceLabel, setReferenceLabel] = useState('')
  const [sections, setSections] = useState('')
  const [reperibile, setReperibile] = useState(false)
  const [busy, setBusy] = useState(false)

  const effectiveSlug = slugTouched ? slug : toSlug(name)

  const submit = () => {
    const settings = { features: { reperibile } }
    if (prefix.trim()) settings.idPrefix = prefix.trim().toUpperCase()
    if (referenceLabel.trim()) settings.labels = { reference: referenceLabel.trim() }
    const pillars = sections.split(',').map(s => s.trim()).filter(Boolean)
    setBusy(true)
    run(adminCall('POST', '/api/tenants', { slug: effectiveSlug, name: name.trim(), settings, pillars }))
      .then(ok => {
        if (!ok) return
        setName(''); setSlug(''); setSlugTouched(false); setPrefix(''); setReferenceLabel(''); setSections(''); setReperibile(false)
      })
      .finally(() => setBusy(false))
  }

  const input = { ...S.inputBase, border: '1px solid var(--border)' }
  return (
    <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
      <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '8px', fontFamily: S.mono }}>Nuova lavagna:</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome (es. Service Manager)" style={input} />
        <input value={effectiveSlug} onChange={e => { setSlug(e.target.value); setSlugTouched(true) }}
          placeholder="indirizzo (es. service-manager)" style={{ ...input, fontFamily: S.mono }} />
        <input value={prefix} onChange={e => setPrefix(e.target.value)} placeholder="Prefisso ID (es. SM)" style={{ ...input, fontFamily: S.mono }} />
        <input value={referenceLabel} onChange={e => setReferenceLabel(e.target.value)} placeholder='Nome colonna "Reference" (opzionale)' style={input} />
        <input value={sections} onChange={e => setSections(e.target.value)} placeholder="Sezioni, separate da virgola"
          style={{ ...input, gridColumn: '1 / -1' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '10px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={reperibile} onChange={e => setReperibile(e.target.checked)} />
          Info Reperibile
        </label>
        <div style={{ flex: 1 }} />
        <PrimaryButton onClick={submit} disabled={busy || !name.trim() || !effectiveSlug}><Icon name="plus-lg" style={{ marginRight: '6px' }} />Crea lavagna</PrimaryButton>
      </div>
    </div>
  )
}
