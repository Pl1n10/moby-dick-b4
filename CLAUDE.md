# Moby Dick B4 — Project Guide

## What This Is

A task board for tracking backup-related work items across four platforms: **Commvault**, **Cohesity**, **Data Domain**, and **NBU - Banche Estere**. Built for a small team (Bob, Erica, Walker) managing backup incidents and requests.

Data persists in **PostgreSQL** via a REST API. Deployed with **Docker Compose** (PostgreSQL + Express API + Nginx).

## Tech Stack

- **Frontend**: React 18.3 + Vite 6.4 (ES modules, CSS-in-JS)
- **Backend**: Express 4 + pg (Node 20)
- **Database**: PostgreSQL 16
- **Deploy**: Docker Compose (3 services: db, api, nginx)
- **Fonts**: JetBrains Mono (mono), IBM Plex Sans (UI) via Google Fonts
- **Date formatting**: Italian locale (`it-IT`)

## Commands

```bash
# Frontend dev (requires backend running on :3000)
npm run dev          # Dev server at localhost:5173 (proxies /api → :3000)
npm run build        # Production build → ./dist
npm run preview      # Preview production build

# Backend dev
cd backend && npm run dev   # Express on :3000 with --watch

# Docker (production)
docker compose up --build   # Starts db → api → nginx on :80
docker compose down         # Stop all services
```

## Project Structure

```
├── index.html                    # Entry point (Google Fonts + /src/main.jsx)
├── vite.config.js                # Vite config (react plugin, proxy /api → :3000)
├── netlify.toml                  # Legacy SPA redirect (Netlify no longer used)
├── docker-compose.yml            # Orchestration: db + api + nginx
├── .dockerignore
│
├── src/                          # ── Frontend ──────────────────────
│   ├── main.jsx                  # ReactDOM.createRoot, StrictMode
│   ├── App.jsx                   # Root component (~90 lines, orchestrates everything)
│   ├── data.js                   # Constants: GROUPS, STATUSES, OWNERS, FREQUENCIES
│   ├── styles.js                 # Centralized style object S (palette, fonts, inputs)
│   ├── utils.js                  # Shared utilities
│   ├── index.css                 # Minimal global reset
│   ├── components/
│   │   ├── Header.jsx
│   │   ├── TabNav.jsx
│   │   ├── Toolbar.jsx
│   │   ├── TaskTable.jsx
│   │   ├── TaskRow.jsx
│   │   ├── StatusBadge.jsx
│   │   ├── Highlight.jsx
│   │   ├── RecurringModal.jsx
│   │   └── editable/
│   │       ├── EditableText.jsx
│   │       ├── EditableSelect.jsx
│   │       ├── EditableCheckbox.jsx
│   │       └── EditableDate.jsx
│   └── hooks/
│       ├── useTasks.js           # Task CRUD + optimistic updates + polling
│       └── useRecurring.js       # Recurring templates CRUD (processing is server-side)
│
├── backend/                      # ── Backend ───────────────────────
│   ├── package.json
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── migrations/
│   │   └── 001_init.sql          # Schema + seed data (idempotent)
│   └── src/
│       ├── index.js              # Express app, startup, recurring scheduler
│       ├── db.js                 # pg Pool, waitForDb(), runMigrations()
│       ├── recurring-processor.js # Server-side recurring task creation
│       └── routes/
│           ├── tasks.js          # CRUD + reset + waiting↔status sync
│           └── recurring.js      # Templates CRUD
│
└── nginx/                        # ── Reverse Proxy ─────────────────
    ├── Dockerfile                # Multi-stage: builds frontend, serves via nginx
    └── nginx.conf                # SPA fallback + /api/ proxy to api:3000
```

## Architecture

### Docker Compose Services

```
nginx:80  →  /api/*  →  api:3000 (Express)  →  db:5432 (PostgreSQL 16)
          →  /*      →  static files (React build)
```

Startup chain: **db healthy** → **api healthy** → **nginx starts**

### Frontend (src/)

- **App.jsx** — root component, composes Header + TabNav + Toolbar + TaskTable + RecurringModal
- **useTasks hook** — fetches tasks from API on mount, polls every 60s, refetches on window focus, optimistic updates with `lastUpdateRef` debounce
- **useRecurring hook** — CRUD only, processing moved server-side
- **Storico tab** — shows only Closed tasks across all groups

### Backend API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check (used by Docker healthcheck) |
| GET | `/api/tasks` | All tasks, sorted by updated_at DESC |
| POST | `/api/tasks` | Create task |
| POST | `/api/tasks/reset` | Truncate + re-seed |
| PATCH | `/api/tasks/:id` | Update single field (with waiting↔status sync) |
| DELETE | `/api/tasks/:id` | Delete task |
| GET | `/api/recurring` | List recurring templates |
| PUT | `/api/recurring` | Replace all templates |
| DELETE | `/api/recurring` | Clear all templates |

### Database Schema (001_init.sql)

**tasks** table:
- `id` UUID PK, `group_name`, `reference`, `description`, `status` (CHECK), `owner`, `waiting`, `deadline` DATE, `recurring_template_id` UUID FK, `updated_at`, `created_at`
- FK: `recurring_template_id → recurring_templates(id) ON DELETE SET NULL`

**recurring_templates** table:
- `id` UUID PK, `group_name`, `reference`, `description`, `owner`, `frequency` (CHECK: daily/weekly/monthly), `scheduled_time`, `last_created_date`, `active`, `created_at`

### Key Business Logic: Waiting ↔ Status Sync

Implemented symmetrically in both `useTasks.js` (frontend, optimistic) and `routes/tasks.js` (backend, authoritative):

- Setting status → "Waiting" auto-checks `waiting: true`
- Setting status → anything else auto-unchecks `waiting: false`
- Unchecking waiting while status is "Waiting" → status becomes "In Progress"
- Checking waiting manually → status becomes "Waiting"
- **Waiting flag changes do NOT update `updatedAt`** (prevents row jumping in sort)

### Task Data Model (client-side shape)
```js
{
  id: string,          // UUID (generated by DB or crypto.randomUUID())
  group: string,       // "Commvault" | "Cohesity" | "Data Domain" | "NBU - Banche Estere"
  reference: string,   // Incident number or email subject
  description: string, // Multiline problem description
  status: string,      // "New" | "In Progress" | "Waiting" | "Resolved" | "Closed"
  owner: string,       // "Bob" | "Erica" | "Walker"
  waiting: boolean,    // Synced with status (see logic above)
  deadline: string,    // "YYYY-MM-DD" or null
  updatedAt: string,   // ISO 8601 (auto-updated on edit, except waiting)
}
```

### Constants (src/data.js)
- `GROUPS`: ['Commvault', 'Cohesity', 'Data Domain', 'NBU - Banche Estere']
- `STATUSES`: ['New', 'In Progress', 'Waiting', 'Resolved', 'Closed']
- `OWNERS`: ['Bob', 'Erica', 'Walker']
- `FREQUENCIES`: ['daily', 'weekly', 'monthly']

## Design System

- **Dark theme**: bg `#0d1117`, text `#e6edf3`, borders `#21262d` / `#30363d`
- **Accent blue**: `#58a6ff` (links, active tab, focus rings)
- **Status colors**: New (blue), In Progress (orange), Waiting (red), Resolved (green), Closed (gray)
- **Style object `S`**: centralized in `styles.js` with `mono`, `sans`, `statusColors`, `inputBase`

## Auth Placeholder

Header shows "Auth: OFF (Demo)" badge. Future Azure AD integration planned.

## Conventions

- No TypeScript, no tests, no linting configured
- All styling is inline (CSS-in-JS objects) — no external CSS files besides index.css reset
- UUIDs via `crypto.randomUUID()` (frontend) or `gen_random_uuid()` (PostgreSQL)
- `window.confirm()` for delete/reset confirmations
- Sorting always by `updatedAt` descending
- Commit messages: `feat:`, `fix:`, `refactor:`, `chore:` prefixes

## Upgrade TODO

### P1 — Refactor strutturale (DONE)
- [x] Spezzare App.jsx in componenti separati
- [x] Estrarre logica task in custom hook `useTasks.js`
- [x] Centralizzare stili in `styles.js`
- [ ] Sostituire hover JS (`onMouseEnter`/`onMouseLeave`) con CSS `:hover`

### P2 — Feature UX
- [x] **Separazione tab "NetBackup + Data Domain"** (richiesta stakeholder): split in due tab distinte — "Data Domain" e "NBU - Banche Estere". `GROUPS` aggiornato in `src/data.js`, seed dati riassegnati nella migration `001_init.sql` e in `SEED_SQL` di `routes/tasks.js`. Nessuna migrazione runtime necessaria (DB vuoto in produzione).
- [x] Export CSV (task del gruppo attivo, rispetta filtri) — separator `;` + BOM UTF-8 per Excel italiano, filename `moby-dick-<group>-<date>.csv`. Helper in `utils.js`.
- [ ] Sostituire `window.confirm()` con dialog/modal custom (coerente col dark theme) — ⚠️ parzialmente: il Reset è ora conferma testuale "RESET" via `window.prompt`, ma è ancora un dialog di sistema. Il dialog custom resta TODO per delete + reset.
- [ ] Drag & drop per riordinamento manuale task

### P3 — Solidità tecnica
- [ ] Aggiungere ESLint + Prettier
- [ ] Aggiungere Vitest + React Testing Library (testare waiting/status sync, filtri)
- [ ] Migrazione TypeScript (progressiva .jsx → .tsx)

### P4 — Futuro
- [~] **Autenticazione Entra ID** — predisposizione codice in corso (vedi sotto)
- [ ] Task comments / history / audit trail
- [ ] Priority field sui task
- [x] Backend API per sync multi-dispositivo
- [x] Docker Compose deployment

### Entra ID — Stato e TODO

**Decisioni architetturali (concordate):**
- Flow: MSAL.js SPA + JWT validation backend (jwks-rsa)
- Tenant: single-tenant Mauden + utenti guest B2B per esterni (@ricoh, @npo, …)
- Mapping owner + ruoli admin/viewer: tabella DB `users`
- Feature flag `AUTH_ENABLED` (env var, default `false`) per spegnere tutto finché la registrazione Entra non è pronta

**DONE — predisposizione codice:**
- [x] Frontend: `src/auth/` (authConfig, AuthProvider, useAuth, LoginGate, UserMenu, apiFetch)
- [x] Frontend: `main.jsx` wrappa `<App>` con `AuthProvider` + `LoginGate`
- [x] Frontend: `Header.jsx` mostra `UserMenu` (badge demo se flag off, nome+initials+logout se on)
- [x] Frontend: `useTasks` / `useRecurring` usano `apiFetch` (inietta Bearer token)
- [x] Backend: `src/auth.js` middleware `requireAuth` (verifica firma con JWKS Microsoft, valida `aud` e `iss`)
- [x] Backend: `src/routes/me.js` endpoint `GET /api/me`
- [x] Backend: `index.js` applica `requireAuth` a `/api/tasks`, `/api/recurring`, `/api/me` (health resta pubblico)
- [x] `.env.example` frontend + backend con tutte le variabili e commenti
- [x] `docker-compose.yml` propaga `AUTH_ENABLED`, `AZURE_*` al container `api`

**TODO — da fare prima di accendere il flag:**
- [ ] Coordinare con owner Entra Mauden la registrazione app:
  - Tipo: SPA (Single-Page Application)
  - Redirect URI: `http://localhost:5173` (dev) + URL produzione
  - Esporre custom API: Application ID URI = `api://<client-id>`, scope `access_as_user`
  - (Opzionale, per ruoli) definire App Roles: `Admin`, `Viewer`
- [ ] Scrivere `AUTH_SETUP.md` con la checklist passo-passo per l'owner Entra
- [ ] Compilare `.env.local` (frontend) e `.env` (backend) con i valori reali
- [ ] Migrazione DB `002_users.sql`:
  - Tabella `users` (id, email UNIQUE, display_owner ENUM Bob/Erica/Walker, role ENUM admin/viewer, created_at)
  - Seed iniziale: bob@mauden.com → Bob/admin, erica@mauden.com → Erica/admin, walker@mauden.com → Walker/admin
- [ ] Backend: arricchire `/api/me` con `owner` e `role` mappati da DB tramite email del JWT
- [ ] Backend: endpoint `/api/users` (CRUD, solo per role=admin) per gestire mapping a runtime
- [ ] Frontend: usare `owner` di `/api/me` come default in `handleAdd` invece di `OWNERS[0]`
- [ ] Frontend: gating UI per ruolo viewer (nascondere bottoni delete/reset/add)
- [ ] Backend: enforcement ruolo `admin` sugli endpoint mutating
- [ ] Test end-to-end con un guest @ricoh (o tenant di test) prima del rollout
