export default function EditableCheckbox({ checked, onChange }) {
  return (
    <span
      onClick={() => onChange(!checked)}
      title={checked ? 'Clear waiting flag' : 'Set waiting flag'}
      style={{
        cursor: 'pointer', fontSize: '16px', userSelect: 'none',
        padding: '2px 6px', borderRadius: '4px', transition: 'background 0.1s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = '#1c2333'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {checked ? '⏳' : '—'}
    </span>
  )
}
