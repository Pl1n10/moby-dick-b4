# KanbanOps — Project Guide

> Repo / deploy path / Docker image names still use the legacy slug `moby-dick-b4` (renaming would break the GitHub remote and `/opt/moby-dick-b4/` on the prod VM). The product name as shown in the UI and to users is **KanbanOps**.

## What This Is

A task board for tracking backup-related work items across four platforms: **Commvault**, **Cohesity**, **Data Domain - ZFS**, and **NBU - Banche Estere**. Built for the Mauden backup team (Roberto, Amilcare, Alessio, Marco, Andrea — admins; any other @mauden colleague auto-registers as viewer at first login).

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
│   │   ├── Footer.jsx            # Version + easter egg trigger (7-tap on v1.0)
│   │   ├── BitAdder.jsx          # Hidden clicker drawer (Bit Adder game)
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
│       ├── useRecurring.js       # Recurring templates CRUD (processing is server-side)
│       └── useBitAdder.js        # Bit Adder game state + batched server sync
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
│           ├── recurring.js      # Templates CRUD
│           └── bitadder.js       # Easter egg game endpoints (state/click/buy/leaderboard)
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
| GET | `/api/bitadder/me` | Easter egg: current player state (auto-INSERT alla prima chiamata) |
| POST | `/api/bitadder/click` | Easter egg: batch delta sync, server clampa rate |
| POST | `/api/bitadder/buy-bot` | Easter egg: spende bit per +1 bot al prezzo corrente |
| GET | `/api/bitadder/leaderboard` | Easter egg: top 10 + propria riga se fuori top |

### Database Schema (001_init.sql)

**tasks** table:
- `id` UUID PK, `group_name`, `reference`, `description`, `status` (CHECK), `owner`, `waiting`, `deadline` DATE, `recurring_template_id` UUID FK, `updated_at`, `created_at`
- FK: `recurring_template_id → recurring_templates(id) ON DELETE SET NULL`

**recurring_templates** table:
- `id` UUID PK, `group_name`, `reference`, `description`, `owner`, `frequency` (CHECK: daily/weekly/monthly), `scheduled_time`, `last_created_date`, `active`, `created_at`

**bit_adder** table (easter egg):
- `email` TEXT PK FK → `users(email)` ON DELETE CASCADE, `bits` BIGINT CHECK ≥ 0, `bots` INT CHECK ≥ 0, `updated_at`
- Una riga per giocatore. Cancellazione di un user via admin panel ⇒ wipe automatico dello score.

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
  group: string,       // "Commvault" | "Cohesity" | "Data Domain - ZFS" | "NBU - Banche Estere"
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
- `GROUPS`: ['Commvault', 'Cohesity', 'Data Domain - ZFS', 'NBU - Banche Estere']
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
- `window.confirm()` per delete — system dialog, da sostituire (il prompt di reset è stato rimosso dall'UI nel commit `ade7da1`; endpoint `POST /api/tasks/reset` resta vivo per emergenze via curl con JWT admin)
- Sorting sempre per `updatedAt` desc
- Commit messages: `feat:`, `fix:`, `refactor:`, `chore:` prefissi
- **Owners list dinamica**: `display_owner` valorizzati nella tabella `users`. Popolazione self-service via `/api/me` (auto-INSERT al primo login). Frontend via `OwnersProvider` context, no più `OWNERS` hardcoded.
- **Migrations idempotenti**: `runMigrations()` (`backend/src/db.js`) riapplica TUTTI i file `.sql` ad ogni boot. Ogni migration usa `IF NOT EXISTS`, `ON CONFLICT`, guard `DO $$ BEGIN ... EXCEPTION`, ecc.

## Hidden feature — Bit Adder (easter egg)

> Promemoria per chi tocca il codice in futuro: c'è un piccolo gioco nascosto. Non rompetelo per sbaglio.

**Trigger**: 7 tap rapidi (entro 3 secondi) sulla stringa "KanbanOps v1.0" nel `Footer`. Sblocca per la sessione corrente un drawer espanso sotto il footer normale con tre pannelli: clicker, shop bot, leaderboard.

**Stato**: tabella `bit_adder` (FK su `users(email)`, ON DELETE CASCADE). Persistenza cross-device legata alla mail Entra. Top 10 globale + propria riga se fuori dai top 10. Reset dello score di un utente: cancellare la riga in `bit_adder` (la riga `users` non viene toccata).

**Economia**: prezzo del k-esimo bot = `floor(1024 * 1.15^k)` — il primo bot costa 1 Kibit. Ogni bot genera 1 bit/sec. Curva e base centralizzate in `backend/src/routes/bitadder.js` (`nextBotPrice`).

**Anti-cheat**: client batcha i delta ogni 5s; server clampa a `(50 * elapsedSec) + (bots * elapsedSec * 1.5) + 5`. Non rifiuta mai per evitare di rompere il gioco con tab in background — cappa silenziosamente. La sanity è grossolana per design (è un easter egg, non un competitive ranking).

**Hide button**: collassa al footer normale; lo hook `useBitAdder` resta attivo finché la pagina non si refresha, quindi i bot continuano a ticchettare in background. Per nascondersi davvero (es. collega in ufficio) basta cliccare Hide.

**File coinvolti**:
- `backend/migrations/009_bitadder.sql`
- `backend/src/routes/bitadder.js` (mount in `index.js`)
- `src/hooks/useBitAdder.js`
- `src/components/BitAdder.jsx`
- `src/components/Footer.jsx` (trigger + drawer host)

## Operations & deploy strategy

- **Deploy in produzione**: VM `mauden-ubuntu` con `docker-compose` v1.29.2 (con trattino, NON `docker compose`). Procedura standard per applicare modifiche di codice o `.env`:
  ```bash
  cd /opt/moby-dick-b4 && git pull && docker-compose build
  docker ps -aq --filter name=moby-api --filter name=moby-nginx | xargs -r docker rm -f
  docker-compose up -d
  ```
  Mai `docker-compose up -d --build` (bug `KeyError: 'ContainerConfig'` con BuildKit). `moby-db` non viene toccato dal recreate.
- **Tag di produzione**: convention `mauden-prod-YYYY-MM-DD`. Ogni snapshot stabile in produzione riceve un tag annotato. Permette rollback puntuali e — più importante — fa da ancora di sicurezza in vista del fork futuro (vedi `HANDOFF.md`, sezione "Strategia evoluzione"). Tag attivo: `mauden-prod-2026-05-19` → `ade7da1`.
- **Pinning del deploy a un tag**: **non ancora attivo**. La VM continua a fare `git pull` su `main`. Diventerà necessario quando si inizierà il fork generico per "servizi gestiti", per evitare che cambiamenti generici raggiungano la prod Mauden via pull. Lo snippet di deploy da applicare alla VM in quel momento è descritto in `HANDOFF.md`.
- **Fork strategy**: il software è oggi mono-tenant Mauden con pillar/admin/brand hardcoded. Se si concretizza l'espansione interna al settore "servizi gestiti", si forka invece di rifattorizzare a multi-tenant — decisione e razionale in `HANDOFF.md`. Quando arriva il momento, anche nel fork si parte data-driven (tabella `pillars`, env per admin bootstrap e brand) per non ripetere l'errore degli hardcode.

## Upgrade TODO

### Refactor strutturale
- [x] Spezzare App.jsx in componenti separati
- [x] Estrarre logica task in custom hook `useTasks.js` + `useRecurring.js` + `useSubtasks.js`
- [x] Centralizzare stili in `styles.js`
- [ ] Sostituire hover JS (`onMouseEnter`/`onMouseLeave`) con CSS `:hover` (P3)

### Feature UX
- [x] Split tab "NetBackup + Data Domain" → "Data Domain" + "NBU - Banche Estere"
- [x] Rinominato pillar "Data Domain" → "Data Domain - ZFS" (migration 008, riflette la natura ZFS-based dello storage in produzione)
- [x] Link cliccabili nelle description di task e subtask (auto-detect URL `https?://`, target `_blank`, `rel="noopener noreferrer"`) — utile per puntare a documenti SharePoint. Componente `src/components/Linkify.jsx`, integrato in `TaskRow`, `EditableText` (prop `linkify`) e `SubtaskList` (read-only). In edit mode i subtask restano `<input>`: il link è cliccabile solo a editing chiuso.
- [x] Export CSV del gruppo attivo (separator `;` + BOM UTF-8 per Excel italiano)
- [x] ~~Reset con conferma testuale "RESET" (`window.prompt`)~~ — bottone rimosso dall'UI (`ade7da1`). Endpoint `POST /api/tasks/reset` rimane vivo per emergenze via curl admin.
- [x] **Footer professionale** con versione (`KanbanOps v1.0 · © 2026 Mauden`). Include easter egg "Bit Adder" — vedi sezione dedicata sopra.
- [x] **Subtasks checklist** — tendina espandibile sotto la row, badge "N/M", vincolo "padre non chiudibile con subtask aperti" enforced backend
- [x] **Paginetta admin users** — `UsersModal` raggiungibile dal `UserMenu` (admin-only). CRUD su tabella users: inline edit display_owner, role select, hide (set NULL), remove, manual add. Guardrail anti-lockout (admin non può demotare/cancellare se stesso). Colonna **Scope** con 4 checkbox (Cmv/Coh/DD/NBU) per assegnare `operator_groups` ai viewer (capability additiva, ignorata per gli admin).
- [x] **Ruoli operator per-pillar** — colonna `users.operator_groups TEXT[]`. Viewer con scope `['Commvault']` diventa RW sul pillar Commvault (RO altrove). Enforcement granulare su tasks + subtasks lato backend (`canWrite` helper + `loadUserContext` middleware). UI Toolbar/TaskTable disabilitano azioni fuori scope, badge UserMenu mostra gli scope. **Recurring resta admin-only — iterazione 2 nello HANDOFF.**
- [ ] Sostituire `window.confirm()` con modal custom dark theme (P2)
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
- **Auto-register su `/api/me`**: primo login → INSERT in `users` con `display_owner = name dal JWT`, `role = 'viewer'`, `operator_groups = '{}'`. ON CONFLICT DO NOTHING preserva modifiche manuali admin.
- **`role='admin'`** → full access. Crea/modifica/elimina task, subtask e recurring template di qualunque pillar. Reset e gestione utenti restano admin-only sempre.
- **`role='viewer'`** + `operator_groups = '{}'` → solo lettura (default per i nuovi auto-registrati). Frontend mostra badge "Read-only", nasconde Add/Reset/Recurring/Delete.
- **`role='viewer'`** + `operator_groups` non vuoto → operatore di pillar. Read-only ovunque MA può creare/modificare/eliminare task e subtask sui pillar listati. Cumulabile (es. `['Commvault','Cohesity']` = operator su entrambi). Recurring template per ora restano admin-only (vedi iterazione 2 in `HANDOFF.md`). Frontend mostra badge "Operator: Commvault · …".
- **Enforcement backend**: `loadUserContext` middleware (auth.js) carica role + operator_groups in `req.userCtx`. `canWrite(userCtx, group)` decide per ogni mutation. PATCH di un task che cambia gruppo richiede write su **entrambi** vecchio e nuovo (no escalation laterale).
- **`VALID_GROUPS`** in `backend/src/auth.js` è la single source of truth per i nomi dei pillar accettati in `operator_groups`. Da mantenere in sync col CHECK constraint `tasks.group_name` e con `GROUPS` in `src/data.js`.
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
