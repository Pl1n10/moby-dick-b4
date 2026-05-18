# KanbanOps — Project Guide

> Repo / deploy path / Docker image names still use the legacy slug `moby-dick-b4` (renaming would break the GitHub remote and `/opt/moby-dick-b4/` on the prod VM). The product name as shown in the UI and to users is **KanbanOps**.

## What This Is

A task board for tracking backup-related work items across four platforms: **Commvault**, **Cohesity**, **Data Domain**, and **NBU - Banche Estere**. Built for the Mauden backup team (Roberto, Amilcare, Alessio, Marco, Andrea — admins; any other @mauden colleague auto-registers as viewer at first login).

Data persists in **PostgreSQL** via a REST API. Deployed with **Docker Compose** (PostgreSQL + Express API + Nginx) behind the Mauden reverse proxy at `https://kanbanops.mauden.com`.

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

- No TypeScript, no tests, no linting configured (debito tecnico noto)
- All styling is inline (CSS-in-JS objects) — no external CSS files besides index.css reset
- UUIDs via `crypto.randomUUID()` (frontend) or `gen_random_uuid()` (PostgreSQL)
- `window.confirm()` per delete, `window.prompt('RESET')` per reset — system dialog, da sostituire
- Sorting sempre per `updatedAt` desc
- Commit messages: `feat:`, `fix:`, `refactor:`, `chore:` prefissi
- **Owners list dinamica**: `display_owner` valorizzati nella tabella `users`. Popolazione self-service via `/api/me` (auto-INSERT al primo login). Frontend via `OwnersProvider` context, no più `OWNERS` hardcoded.
- **Migrations idempotenti**: `runMigrations()` (`backend/src/db.js`) riapplica TUTTI i file `.sql` ad ogni boot. Ogni migration usa `IF NOT EXISTS`, `ON CONFLICT`, guard `DO $$ BEGIN ... EXCEPTION`, ecc.

## Upgrade TODO

### Refactor strutturale
- [x] Spezzare App.jsx in componenti separati
- [x] Estrarre logica task in custom hook `useTasks.js` + `useRecurring.js` + `useSubtasks.js`
- [x] Centralizzare stili in `styles.js`
- [ ] Sostituire hover JS (`onMouseEnter`/`onMouseLeave`) con CSS `:hover` (P3)

### Feature UX
- [x] Split tab "NetBackup + Data Domain" → "Data Domain" + "NBU - Banche Estere"
- [x] Export CSV del gruppo attivo (separator `;` + BOM UTF-8 per Excel italiano)
- [x] Reset con conferma testuale "RESET" (`window.prompt`)
- [x] **Subtasks checklist** — tendina espandibile sotto la row, badge "N/M", vincolo "padre non chiudibile con subtask aperti" enforced backend
- [x] **Paginetta admin users** — `UsersModal` raggiungibile dal `UserMenu` (admin-only). CRUD su tabella users: inline edit display_owner, role select, hide (set NULL), remove, manual add. Guardrail anti-lockout (admin non può demotare/cancellare se stesso).
- [ ] Sostituire `window.confirm()` / `window.prompt()` con modal custom dark theme (P2)
- [ ] Drag & drop ordinamento subtasks (P3) — campo `position` già nel schema, manca solo l'UI handle (`@dnd-kit/sortable`)
- [ ] Drag & drop riordinamento task (P4)

### Solidità tecnica
- [ ] ESLint + Prettier (P3)
- [ ] Vitest + React Testing Library + Supertest (P3): role enforcement BE, vincolo close con subtask aperti, optimistic updates useSubtasks, filtri toolbar
- [ ] Migrazione TypeScript progressiva (P4)
- [ ] **Backup off-host** (P1, decisione utente pending dal 2026-05-12) — chiedere al team backup Mauden se la VM `mauden-ubuntu` è coperta dai job NBU/Cohesity esistenti

### Futuro
- [ ] Task comments / history / audit trail (P4)
- [ ] Priority field sui task (P4)
- [x] Backend API per sync multi-dispositivo (Express + Postgres)
- [x] Docker Compose deployment (3 servizi: db + api + nginx)
- [x] Auth Entra ID (vedi sotto)

### Rebranding KanbanOps — cosa è ancora "Moby Dick"

Il prodotto si chiama **KanbanOps** ma diverse cose tecniche mantengono lo slug `moby-dick-b4`. Lista in ordine di costo/rischio crescente. Ogni voce è opzionale.

- [ ] **Display name app Entra** (oggi: "Moby Dick B4") — Portal Entra → App registrations → Branding & properties → cambia in "KanbanOps". **Zero rischio**, zero downtime, niente da toccare in codice. Lo cambierei senza pensarci.
- [x] **Hostname produzione** — cutover a `kanbanops.mauden.com` completato 2026-05-18 (cutover secco, nessun utente in prod). Vhost + TLS sull'RP Mauden, redirect URI nell'app Entra sostituito, `VITE_AZURE_REDIRECT_URI` aggiornato sulla VM, nginx rebuildato. Login SSO funzionante dal nuovo host.
- [ ] **Repo GitHub** (oggi: `Pl1n10/moby-dick-b4`) — Rinomina il repo. GitHub mantiene un redirect dal vecchio URL, ma il `git remote` sulla VM va aggiornato. `/opt/moby-dick-b4` può rimanere come path locale o si sposta in `/opt/kanbanops` con un `mv`. Medio rischio se gestito con cura.
- [ ] **Container Docker** (`moby-db`, `moby-api`, `moby-nginx`) — Modificare `container_name` in `docker-compose.yml`. Healthchecks e logs interni hanno alcuni riferimenti hardcoded — grep prima di committare. Disservizio durante il recreate (qualche minuto).
- [ ] **Application ID URI** (oggi: `api://7e8814ac-…`) — **Sconsigliato**. È solo nei JWT, nessuno lo legge mai. Cambiarlo significa update `AZURE_API_AUDIENCE` + `VITE_AZURE_API_SCOPE` nel `.env` + rebuild + tutti gli utenti ri-loggano (token in cache hanno l'audience vecchia). Costo > beneficio.
- ❌ **Client ID** (`7e8814ac-…`) — **Non si tocca**. È l'identità immutabile dell'app. Per averne uno nuovo serve creare una nuova app registration da zero e abbandonare la vecchia. Mai farlo se non per emergenza (token leak).

## Entra ID — Stato

✅ **Live in produzione** dal 2026-05-17.

- Tenant Mauden: `3c187334-ba7e-4a38-985e-b9bcf958cb27`
- Client ID: `7e8814ac-13e9-4133-84dc-4673e4773977`
- App registration: SPA + custom API (`api://<client-id>/access_as_user`) + optional claims email/upn + single-tenant
- Flow: MSAL.js (frontend) + JWKS-rsa (backend), accetta sia issuer v1 (`sts.windows.net`) che v2 (`login.microsoftonline.com/.../v2.0`)
- `.env` su `/opt/moby-dick-b4/.env` sulla VM (mai committato)

### Modello permessi

- Chiunque `@mauden` può loggarsi (single-tenant Entra)
- **Auto-register su `/api/me`**: primo login → INSERT in `users` con `display_owner = name dal JWT`, `role = 'viewer'`. ON CONFLICT DO NOTHING preserva modifiche manuali admin.
- `role='admin'` → enforce backend su tutti i mutating endpoint (POST/PATCH/DELETE tasks + recurring + subtasks + tasks/reset)
- `role='viewer'` (default) → solo lettura. Frontend nasconde Add/Reset/Recurring/Delete + badge "Read-only"
- **Lista owner dinamica**: `GET /api/users/owners` ritorna gli `display_owner` non-NULL → frontend `OwnersProvider` popola le select. Set `display_owner=NULL` per nascondere un user dal picker senza cancellarlo.

### Admin attualmente registrati (in `migration 004_team_real.sql`)
- `roberto.novara@mauden.com` → "Roberto Novara"
- `amilcare.iacono@mauden.com` → "Amilcare Iacono"
- `alessio.coletta@mauden.com` → "Alessio Coletta"
- `marco.fauci@mauden.com` → "Marco Fauci"
- `andrea.craparo@mauden.com` → "Andrea Craparo"

### TODO Auth residui

- [ ] Test E2E con guest @ricoh / B2B (verifica funzionamento con tenant esterno)
- [ ] `AUTH_SETUP.md` con checklist passo-passo (per ri-onboarding o tenant diverso)
