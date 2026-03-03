# Moby Dick B4 — Project Guide

## What This Is

A lightweight, static task board for tracking backup-related work items across three platforms: **Commvault**, **Cohesity**, and **NetBackup + Data Domain**. Built for a small team (Bob, Erica, Walker) managing backup incidents and requests.

No backend, no database — all data persists in browser `localStorage` under key `moby-dick-b4-tasks`.

## Tech Stack

- **React 18.3** + **Vite 6.4** (ES modules)
- CSS-in-JS (all inline styles, no CSS framework)
- Fonts: JetBrains Mono (mono), IBM Plex Sans (UI) via Google Fonts
- Deployed on **Netlify** (static SPA)
- Date formatting: Italian locale (`it-IT`)

## Commands

```bash
npm run dev       # Dev server at localhost:5173
npm run build     # Production build → ./dist
npm run preview   # Preview production build
```

## Project Structure

```
├── index.html          # Entry point (loads Google Fonts + /src/main.jsx)
├── vite.config.js      # Vite config (react plugin, outDir: dist)
├── netlify.toml        # SPA redirect /* → /index.html
├── src/
│   ├── main.jsx        # ReactDOM.createRoot, StrictMode
│   ├── App.jsx         # ENTIRE app in one file (~510 lines)
│   ├── data.js         # Constants: GROUPS, STATUSES, OWNERS, SEED_TASKS
│   └── index.css       # Minimal global reset
└── moby-dick-b4/       # Stale duplicate dir (only contains a README copy)
```

## Architecture (src/App.jsx)

Everything lives in `App.jsx` — monolithic by design. Key parts:

### Components (all inline, not separate files)
- `EditableText` — click-to-edit text/textarea with draft state
- `EditableSelect` — click-to-edit dropdown (status, owner)
- `EditableCheckbox` — toggle waiting flag (⏳ / —)
- `StatusBadge` — colored pill per status
- `TaskRow` — table row composing the above
- `App` — header, tab nav, toolbar (search + filters), table

### State (App component)
- `activeGroup` — selected tab (Commvault | Cohesity | NetBackup + Data Domain)
- `tasks` — full task array (all groups combined, persisted to localStorage on every change)
- `search` — free-text filter (matches reference + description, case-insensitive)
- `filterStatus` / `filterOwner` — dropdown filters

### Key Business Logic: Waiting ↔ Status Sync
In `updateTask()` (line ~231):
- Setting status → "Waiting" auto-checks `waiting: true`
- Setting status → anything else auto-unchecks `waiting: false`
- Unchecking waiting while status is "Waiting" → status becomes "In Progress"
- Checking waiting manually → status becomes "Waiting"
- **Waiting flag changes do NOT update `updatedAt`** (prevents row jumping in sort)

### Task Data Model
```js
{
  id: string,          // crypto.randomUUID()
  group: string,       // "Commvault" | "Cohesity" | "NetBackup + Data Domain"
  reference: string,   // Incident number or email subject
  description: string, // Multiline problem description
  status: string,      // "New" | "In Progress" | "Waiting" | "Resolved" | "Closed"
  owner: string,       // "Bob" | "Erica" | "Walker"
  waiting: boolean,    // Synced with status (see logic above)
  updatedAt: string,   // ISO 8601 (auto-updated on edit, except waiting)
}
```

### Constants (src/data.js)
- `GROUPS`: ['Commvault', 'Cohesity', 'NetBackup + Data Domain']
- `STATUSES`: ['New', 'In Progress', 'Waiting', 'Resolved', 'Closed']
- `OWNERS`: ['Bob', 'Erica', 'Walker']
- `SEED_TASKS`: 6 sample tasks (2 per group), loaded on first visit

## Design System

- **Dark theme**: bg `#0d1117`, text `#e6edf3`, borders `#21262d` / `#30363d`
- **Accent blue**: `#58a6ff` (links, active tab, focus rings)
- **Status colors**: New (blue), In Progress (orange), Waiting (red), Resolved (green), Closed (gray)
- **Hover effects**: all via inline `onMouseEnter`/`onMouseLeave` (not CSS `:hover`)
- **Style object `S`**: defined at top of App.jsx with `mono`, `sans`, `statusColors`, `inputBase`

## Auth Placeholder

Header shows "Auth: OFF (Demo)" badge. README describes future Azure AD integration via `@azure/msal-browser` + `@azure/msal-react`.

## Conventions

- No TypeScript, no tests, no linting configured
- All styling is inline (CSS-in-JS objects) — no external CSS files besides index.css reset
- UUIDs via `crypto.randomUUID()`
- `window.confirm()` for delete/reset confirmations
- Sorting always by `updatedAt` descending

## Upgrade TODO

### P1 — Refactor strutturale
- [ ] Spezzare App.jsx in componenti separati (Header, TabNav, Toolbar, TaskTable, TaskRow, EditableText, EditableSelect, EditableCheckbox, StatusBadge)
- [ ] Estrarre logica task in custom hook `useTasks.js` (stato + CRUD + persistence)
- [ ] Centralizzare stili in `styles.js`
- [ ] Sostituire hover JS (`onMouseEnter`/`onMouseLeave`) con CSS `:hover`

### P2 — Feature UX
- [ ] Export CSV (task del gruppo attivo, rispetta filtri)
- [ ] Sostituire `window.confirm()` con dialog/modal custom (coerente col dark theme)
- [ ] Drag & drop per riordinamento manuale task

### P3 — Solidità tecnica
- [ ] Aggiungere ESLint + Prettier
- [ ] Aggiungere Vitest + React Testing Library (testare waiting/status sync, filtri, localStorage)
- [ ] Migrazione TypeScript (progressiva .jsx → .tsx)

### P4 — Futuro (fuori scope per ora)
- [ ] Autenticazione Azure AD
- [ ] Backend API per sync multi-dispositivo
- [ ] Task comments / history / audit trail
- [ ] Priority field sui task
