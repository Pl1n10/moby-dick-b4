import S from '../styles.js'
import { useTheme, setThemePref } from '../theme/theme.js'

// Three-way switch: light / follow the OS / dark. "Sistema" is the default
// until the user picks one; the pick is remembered (server + localStorage).
const OPTIONS = [
  { value: 'light', label: '☀', title: 'Tema chiaro' },
  { value: null, label: '◐', title: 'Segui il sistema' },
  { value: 'dark', label: '☾', title: 'Tema scuro' },
]

export default function ThemeToggle() {
  const { pref } = useTheme()
  return (
    <div role="radiogroup" aria-label="Tema" style={{
      display: 'inline-flex', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden',
    }}>
      {OPTIONS.map(o => {
        const active = pref === o.value
        return (
          <button key={o.title} role="radio" aria-checked={active} title={o.title}
            onClick={() => setThemePref(o.value)} style={{
              padding: '4px 9px', border: 'none', cursor: 'pointer',
              background: active ? 'var(--accent-bg)' : 'transparent',
              color: active ? 'var(--accent)' : 'var(--muted)',
              fontFamily: S.sans, fontSize: '13px', lineHeight: 1,
            }}>{o.label}</button>
        )
      })}
    </div>
  )
}
