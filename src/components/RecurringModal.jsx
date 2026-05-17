import { useState } from 'react'
import S from '../styles.js'
import { GROUPS, FREQUENCIES } from '../data.js'
import { useOwners } from '../auth/OwnersProvider.jsx'
import { formatDeadline } from '../utils.js'

export default function RecurringModal({ templates, onSave, onClose }) {
  const [drafts, setDrafts] = useState(templates)
  const owners = useOwners()

  const addTemplate = () => {
    setDrafts(prev => [...prev, {
      id: crypto.randomUUID(),
      group: GROUPS[0],
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
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: '#161b22', border: '1px solid #30363d', borderRadius: '12px',
        padding: '24px', width: '90%', maxWidth: '800px', maxHeight: '80vh', overflowY: 'auto',
        color: '#e6edf3', fontFamily: S.sans,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontFamily: S.mono, fontSize: '16px' }}>Recurring Tasks</h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#8b949e', fontSize: '18px', cursor: 'pointer',
          }}>✕</button>
        </div>

        {drafts.length === 0 && (
          <p style={{ color: '#484f58', textAlign: 'center', padding: '20px' }}>
            No recurring templates. Click "+ Add Template" to create one.
          </p>
        )}

        {drafts.map(tmpl => (
          <div key={tmpl.id} style={{
            border: '1px solid #21262d', borderRadius: '8px', padding: '14px',
            marginBottom: '12px', background: '#0d1117',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <label style={{ fontSize: '12px', color: '#8b949e' }}>
                Group
                <select value={tmpl.group} onChange={e => updateDraft(tmpl.id, 'group', e.target.value)}
                  style={{ ...S.inputBase, display: 'block', marginTop: '4px' }}>
                  {GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </label>
              <label style={{ fontSize: '12px', color: '#8b949e' }}>
                Owner
                <select value={tmpl.owner} onChange={e => updateDraft(tmpl.id, 'owner', e.target.value)}
                  style={{ ...S.inputBase, display: 'block', marginTop: '4px' }}>
                  {owners.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>

              <label style={{ fontSize: '12px', color: '#8b949e', gridColumn: '1 / -1' }}>
                Reference
                <input value={tmpl.reference} onChange={e => updateDraft(tmpl.id, 'reference', e.target.value)}
                  placeholder="e.g. Daily Backup Check"
                  style={{ ...S.inputBase, display: 'block', marginTop: '4px' }} />
              </label>

              <label style={{ fontSize: '12px', color: '#8b949e', gridColumn: '1 / -1' }}>
                Description
                <textarea value={tmpl.description} onChange={e => updateDraft(tmpl.id, 'description', e.target.value)}
                  placeholder="Task description..."
                  rows={2}
                  style={{ ...S.inputBase, display: 'block', marginTop: '4px', resize: 'vertical' }} />
              </label>

              <label style={{ fontSize: '12px', color: '#8b949e' }}>
                Frequency
                <select value={tmpl.frequency} onChange={e => updateDraft(tmpl.id, 'frequency', e.target.value)}
                  style={{ ...S.inputBase, display: 'block', marginTop: '4px' }}>
                  {FREQUENCIES.map(f => <option key={f} value={f}>{freqLabels[f]}</option>)}
                </select>
              </label>
              <label style={{ fontSize: '12px', color: '#8b949e' }}>
                Scheduled Time
                <input type="time" value={tmpl.scheduledTime}
                  onChange={e => updateDraft(tmpl.id, 'scheduledTime', e.target.value)}
                  style={{ ...S.inputBase, display: 'block', marginTop: '4px', colorScheme: 'dark' }} />
              </label>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '12px', color: '#8b949e', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={tmpl.active}
                    onChange={e => updateDraft(tmpl.id, 'active', e.target.checked)} />
                  Active
                </label>
                {tmpl.lastCreatedDate && (
                  <span style={{ fontSize: '11px', fontFamily: S.mono, color: '#484f58' }}>
                    Last: {formatDeadline(tmpl.lastCreatedDate)}
                  </span>
                )}
                <div style={{ flex: 1 }} />
                <button onClick={() => removeDraft(tmpl.id)} style={{
                  background: 'none', border: '1px solid #30363d', borderRadius: '4px',
                  color: '#f85149', fontSize: '11px', fontFamily: S.mono, padding: '4px 10px', cursor: 'pointer',
                }}>Remove</button>
              </div>
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
          <button onClick={addTemplate} style={{
            padding: '7px 16px', background: 'none', border: '1px solid #30363d',
            borderRadius: '6px', color: '#e6edf3', fontSize: '13px', fontFamily: S.sans, cursor: 'pointer',
          }}>+ Add Template</button>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{
            padding: '7px 16px', background: 'none', border: '1px solid #30363d',
            borderRadius: '6px', color: '#8b949e', fontSize: '13px', fontFamily: S.sans, cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={handleSave} style={{
            padding: '7px 16px', background: '#238636', border: '1px solid #2ea043',
            borderRadius: '6px', color: '#fff', fontSize: '13px', fontFamily: S.sans, fontWeight: 600, cursor: 'pointer',
          }}>Save</button>
        </div>
      </div>
    </div>
  )
}
