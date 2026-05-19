import S from '../styles.js'

export default function Footer() {
  return (
    <footer style={{
      marginTop: '40px',
      padding: '16px 32px',
      borderTop: '1px solid #21262d',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      fontSize: '12px',
      color: '#8b949e',
      fontFamily: S.sans,
    }}>
      <span style={{ fontFamily: S.mono }}>KanbanOps v1.0</span>
      <span>© 2026 Mauden</span>
    </footer>
  )
}
