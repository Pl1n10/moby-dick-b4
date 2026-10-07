import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import apiFetch from '../auth/apiFetch.js'
import { useUserInfo } from '../auth/UserInfoProvider.jsx'
import { clearUndo } from '../undo/undoStore.js'

// Board (tenant) context. The current board lives in the URL — /t/<slug> —
// so it can be bookmarked, opened in two tabs side by side, and linked from
// the assignment emails. No router library: one path segment is all we need.
//
// Exposes the board directory (GET /api/tenants), the current board with its
// sections/labels/features, the caller's role on it, and the API base every
// board-scoped hook must use (`/api/t/<slug>`).

const BoardContext = createContext(null)

const PATH_RE = /^\/t\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/

export function slugFromPath(pathname = window.location.pathname) {
  const m = pathname.match(PATH_RE)
  return m ? m[1] : null
}

export function BoardProvider({ children }) {
  const userInfo = useUserInfo()
  const [boards, setBoards] = useState(null)        // null = loading
  const [error, setError] = useState(null)
  const [slug, setSlug] = useState(() => slugFromPath())

  const refreshBoards = useCallback(() => {
    return apiFetch('/api/tenants')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(data => { setBoards(Array.isArray(data) ? data : []); setError(null) })
      .catch(err => { console.error('Failed to fetch boards:', err); setError(err.message); setBoards(b => b ?? []) })
  }, [])

  useEffect(() => { refreshBoards() }, [refreshBoards])

  // Back/forward buttons move between boards too.
  useEffect(() => {
    const onPop = () => setSlug(slugFromPath())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // `replace` for redirects (root → home board) so Back does not bounce.
  const goToBoard = useCallback((next, { replace = false } = {}) => {
    const path = next ? `/t/${next}` : '/'
    if (window.location.pathname !== path) {
      window.history[replace ? 'replaceState' : 'pushState'](null, '', path)
    }
    // The undo stack holds inverse API calls of the previous board: undoing
    // them from another board would be invisible and confusing.
    clearUndo()
    setSlug(next)
  }, [])

  const board = boards && slug ? boards.find(b => b.slug === slug) || null : null

  // Role on the current board: superadmin (and demo) = admin everywhere;
  // otherwise the membership decides; non-members read only (permissive
  // visibility, decision 2026-10-07).
  const membership = board && Array.isArray(userInfo.memberships)
    ? userInfo.memberships.find(m => m.slug === board.slug) || null
    : null
  const isSuperadmin = userInfo.isSuperadmin === true
  const role = isSuperadmin ? 'admin' : (membership ? membership.role : null)
  const operatorGroups = membership?.operatorGroups || []

  const value = {
    boards, error, slug, board, goToBoard, refreshBoards,
    apiBase: slug ? `/api/t/${slug}` : null,
    isSuperadmin,
    role,
    operatorGroups,
    isMember: membership !== null,
    pillars: board ? board.pillars.map(p => p.name) : [],
  }
  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>
}

export function useBoard() {
  const ctx = useContext(BoardContext)
  if (!ctx) throw new Error('useBoard outside BoardProvider')
  return ctx
}

export function useIsBoardAdmin() {
  return useBoard().role === 'admin'
}

// Returns a predicate (section) => boolean. Board admin everywhere on the
// board, otherwise the section must be in operatorGroups. Mirrors the backend
// canWrite helper — keep them in sync.
export function useCanWrite() {
  const { role, operatorGroups } = useBoard()
  return (group) => {
    if (role === 'admin') return true
    if (!group) return false
    return operatorGroups.includes(group)
  }
}

// Column label for a task field, overridable per board in settings.labels
// (the Service Manager board calls "reference" "Attività").
export function useLabel() {
  const { board } = useBoard()
  return (field, fallback) => board?.settings?.labels?.[field] || fallback
}

// A feature is on only when the board says `true` explicitly.
export function useFeature(name) {
  const { board } = useBoard()
  return board?.settings?.features?.[name] === true
}

// Task code prefix ("MD"); "#" on boards without one. Same rule as the
// backend notify.js.
export function useIdPrefix() {
  const { board } = useBoard()
  return board?.settings?.idPrefix || '#'
}
