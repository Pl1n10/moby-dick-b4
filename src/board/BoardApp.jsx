import App from '../App.jsx'
import { useBoard } from './BoardProvider.jsx'

// Remounts the whole board UI when the board changes: tasks, templates,
// filters, expanded rows and on-call state all belong to one board, and a
// fresh mount is simpler and safer than resetting each piece by hand.
export default function BoardApp() {
  const { slug } = useBoard()
  return <App key={slug} />
}
