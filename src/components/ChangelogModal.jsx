import { useEffect, useRef } from 'react'
import S from '../styles.js'
import { CHANGELOG } from '../changelog.js'
import Icon from './Icon.jsx'

// "Novità" window, opened from the footer. Data in src/changelog.js.

const TYPES = {
  new: { label: 'Nuovo', color: 'var(--accent)', bg: 'var(--accent-bg)' },
  improved: { label: 'Migliorato', color: 'var(--success-text)', bg: 'var(--success-bg)' },
  fixed: { label: 'Corretto', color: 'var(--amber)', bg: 'var(--amber-bg)' },
}

const formatDay = (iso) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })

export default function ChangelogModal({ onClose }) {
  const closeRef = useRef(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--overlay)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="changelog-title" style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px',
        width: '90%', maxWidth: '620px', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        color: 'var(--text)', fontFamily: S.sans,
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '20px 24px 14px', borderBottom: '1px solid var(--border-subtle)',
        }}>
          <h2 id="changelog-title" style={{ margin: 0, fontFamily: S.mono, fontSize: '16px' }}>Novità di KanbanOps</h2>
          <button ref={closeRef} onClick={onClose} title="Chiudi" aria-label="Chiudi" style={{
            background: 'none', border: 'none', color: 'var(--muted)', fontSize: '18px', cursor: 'pointer',
          }}><Icon name="x-lg" /></button>
        </div>

        <div style={{ overflowY: 'auto', padding: '8px 24px 20px' }}>
          {CHANGELOG.map(entry => (
            <section key={entry.date} style={{ padding: '14px 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <h3 style={{
                margin: '0 0 10px', fontFamily: S.mono, fontSize: '12px', fontWeight: 600, color: 'var(--muted)',
              }}>{formatDay(entry.date)}</h3>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '8px' }}>
                {entry.items.map((item, i) => {
                  const t = TYPES[item.type] || TYPES.new
                  return (
                    <li key={i} style={{ display: 'flex', gap: '10px', alignItems: 'baseline', fontSize: '13px', lineHeight: 1.5 }}>
                      <span style={{
                        flexShrink: 0, width: '78px', textAlign: 'center',
                        fontSize: '11px', fontWeight: 600, padding: '1px 0', borderRadius: '4px',
                        color: t.color, background: t.bg,
                      }}>{t.label}</span>
                      <span>{item.text}</span>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
