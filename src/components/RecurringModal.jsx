import { useState } from 'react'
import S from '../styles.js'
import { FREQUENCIES } from '../data.js'
import { useBoard, useLabel } from '../board/BoardProvider.jsx'
import { useOwners } from '../auth/OwnersProvider.jsx'
import { formatDeadline } from '../utils.js'

export default function RecurringModal({ templates, onSave, onClose }) {
  const [drafts, setDrafts] = useState(templates)
  const owners = useOwners()
  const { pillars } = useBoard()
  const label = useLabel()

  const addTemplate = () => {
    setDrafts(prev => [...prev, {
      id: crypto.randomUUID(),
      group: pillars[0] || '',
      reference: '',
      description: '',
      owner: owners[0] || '',
      frequency: 'daily',
      scheduledTime: '08:00',
      lastCreatedDate: null,
      active: true,
    }])
  }

  const updateDraft = (id, field, value) => {
    setDrafts(prev => prev.map(d => d.id === id ? { ...d, [field]: value } : d))
  }

  const removeDraft = (id) => {
    setDrafts(prev => prev.filter(d => d.id !== id))
  }

  const handleSave = () => { onSave(drafts); onClose() }

  const freqLabels = { daily: 'Giornaliero', weekly: 'Settimanale', monthly: 'Mensile' }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--overlay)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px',
        padding: '24px', width: '90%', maxWidth: '800px', maxHeight: '80vh', overflowY: 'auto',
        color: 'var(--text)', fontFamily: S.sans,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontFamily: S.mono, fontSize: '16px' }}>Recurring Tasks</h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--muted)', fontSize: '18px', cursor: 'pointer',
          }}>✕</button>
        </div>

        {drafts.length === 0 && (
          <p style={{ color: 'var(--faint)', textAlign: 'center', padding: '20px' }}>
            No recurring templates. Click "+ Add Template" to create one.
          </p>
        )}

        {drafts.map(tmpl => (
          <div key={tmpl.id} style={{
            border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '14px',
            marginBottom: '12px', background: 'var(--bg)',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <label style={{ fontSize: '12px', color: 'var(--muted)' }}>
                Group
                <select value={tmpl.group} onChange={e => updateDraft(tmpl.id, 'group', e.target.value)}
                  style={{ ...S.inputBase, display: 'block', marginTop: '4px' }}>
                  {pillars.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </label>
              <label style={{ fontSize: '12px', color: 'var(--muted)' }}>
                Owner
                <select value={tmpl.owner} onChange={e => updateDraft(tmpl.id, 'owner', e.target.value)}
                  style={{ ...S.inputBase, display: 'block', marginTop: '4px' }}>
                  {owners.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>

              <label style={{ fontSize: '12px', color: 'var(--muted)', gridColumn: '1 / -1' }}>
                {label('reference', 'Reference')}
                <input value={tmpl.reference} onChange={e => updateDraft(tmpl.id, 'reference', e.target.value)}
                  placeholder="e.g. Daily Backup Check"
                  style={{ ...S.inputBase, display: 'block', marginTop: '4px' }} />
              </label>

              <label style={{ fontSize: '12px', color: 'var(--muted)', gridColumn: '1 / -1' }}>
                Description
                <textarea value={tmpl.description} onChange={e => updateDraft(tmpl.id, 'description', e.target.value)}
                  placeholder="Task description..."
                  rows={2}
                  style={{ ...S.inputBase, display: 'block', marginTop: '4px', resize: 'vertical' }} />
              </label>

              <label style={{ fontSize: '12px', color: 'var(--muted)' }}>
                Frequency
                <select value={tmpl.frequency} onChange={e => updateDraft(tmpl.id, 'frequency', e.target.value)}
                  style={{ ...S.inputBase, display: 'block', marginTop: '4px' }}>
                  {FREQUENCIES.map(f => <option key={f} value={f}>{freqLabels[f]}</option>)}
                </select>
              </label>
              <label style={{ fontSize: '12px', color: 'var(--muted)' }}>
                Scheduled Time
                <input type="time" value={tmpl.scheduledTime}
                  onChange={e => updateDraft(tmpl.id, 'scheduledTime', e.target.value)}
                  style={{ ...S.inputBase, display: 'block', marginTop: '4px', colorScheme: 'var(--color-scheme)' }} />
              </label>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={tmpl.active}
                    onChange={e => updateDraft(tmpl.id, 'active', e.target.checked)} />
                  Active
                </label>
                {tmpl.lastCreatedDate && (
                  <span style={{ fontSize: '11px', fontFamily: S.mono, color: 'var(--faint)' }}>
                    Last: {formatDeadline(tmpl.lastCreatedDate)}
                  </span>
                )}
                <div style={{ flex: 1 }} />
                <button onClick={() => removeDraft(tmpl.id)} style={{
                  background: 'none', border: '1px solid var(--border)', borderRadius: '4px',
                  color: 'var(--danger)', fontSize: '11px', fontFamily: S.mono, padding: '4px 10px', cursor: 'pointer',
                }}>Remove</button>
              </div>
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
          <button onClick={addTemplate} style={{
            padding: '7px 16px', background: 'none', border: '1px solid var(--border)',
            borderRadius: '6px', color: 'var(--text)', fontSize: '13px', fontFamily: S.sans, cursor: 'pointer',
          }}>+ Add Template</button>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{
            padding: '7px 16px', background: 'none', border: '1px solid var(--border)',
            borderRadius: '6px', color: 'var(--muted)', fontSize: '13px', fontFamily: S.sans, cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={handleSave} style={{
            padding: '7px 16px', background: 'var(--success-strong)', border: '1px solid var(--success)',
            borderRadius: '6px', color: '#fff', fontSize: '13px', fontFamily: S.sans, fontWeight: 600, cursor: 'pointer',
          }}>Save</button>
        </div>
      </div>
    </div>
  )
}
