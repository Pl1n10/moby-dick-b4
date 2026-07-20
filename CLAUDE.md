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
│   │   ├── OnCallBar.jsx         # Info Reperibile: chi è di turno (admin edita)
│   │   └── editable/
│   │       ├── EditableText.jsx
│   │       ├── EditableSelect.jsx
│   │       ├── EditableCheckbox.jsx
│   │       └── EditableDate.jsx
│   ├── hooks/
│   │   ├── useTasks.js           # Task CRUD + optimistic updates + polling + undo recording
│   │   ├── useSubtasks.js        # Checklist CRUD per task + undo recording
│   │   ├── useRecurring.js       # Recurring templates CRUD (processing is server-side)
│   │   ├── useOnCall.js          # Setting app_settings.on_call (read all, write admin)
│   │   └── useBitAdder.js        # Bit Adder game state + batched server sync
│   └── undo/
│       └── undoStore.js          # Stack undo per-utente (vedi sezione "Undo per-utente")
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
│       ├── notify.js              # Fire-and-forget assignment notifications (webhook)
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
- `id` UUID PK, `group_name`, `reference`, `description`, `status` (CHECK), `owner`, `priority`, `reperibile`, `waiting`, `deadline` DATE, `recurring_template_id` UUID FK, `updated_at`, `created_at`
- FK: `recurring_template_id → recurring_templates(id) ON DELETE SET NULL`

**recurring_templates** table:
- `id` UUID PK, `group_name`, `reference`, `description`, `owner`, `frequency` (CHECK: daily/weekly/monthly), `scheduled_time`, `last_created_date`, `active`, `created_at`

**app_settings** table:
- `key` TEXT PK, `value` TEXT, `updated_at`, `updated_by`. Setting singleton app-wide. Chiave attiva: `on_call`.

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
  priority: number,    // 0–5 integer. 0 = most urgent (P0), 5 = lowest. Default 3
  reperibile: boolean, // Mostra il task nella tab "Info Reperibile" (flag, non copia)
  waiting: boolean,    // Synced with status (see logic above)
  deadline: string,    // "YYYY-MM-DD" or null
  updatedAt: string,   // ISO 8601 (auto-updated on edit, except waiting)
}
```

### Constants (src/data.js)
- `GROUPS`: ['Commvault', 'Cohesity', 'Data Domain - ZFS', 'NBU - Banche Estere']
- `STATUSES`: ['New', 'In Progress', 'Waiting', 'Resolved', 'Closed']
- `OWNERS`: ['Bob', 'Erica', 'Walker']
- `PRIORITIES`: [0, 1, 2, 3, 4, 5] — P0 (most urgent) → P5 (lowest); `DEFAULT_PRIORITY` = 3
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

## Undo per-utente

Annulla **l'ultima azione fatta dall'utente in questa tab**, non un rollback globale della board. Trigger: bottone "↶ Annulla" in Toolbar (tooltip = descrizione dell'azione, nascosto ai viewer puri) oppure Ctrl+Z / Cmd+Z (ignorato mentre si scrive in un campo di testo — lì resta l'undo nativo; checkbox/radio/button NON contano come campi di testo, così la spunta sbagliata si annulla anche col focus ancora sulla checkbox).

**Design** (`src/undo/undoStore.js`):
- Stack in memoria di modulo, max 30 entry, per-tab: refresh pagina = cronologia persa (scelta deliberata — è una rete di sicurezza, non un audit trail).
- Ogni mutazione (edit campo task, create/delete task, add/toggle/edit/delete subtask) pusha **sincronicamente** un'entry `{label, run}`; `run()` esegue l'inversa via API. Push sincrono ⇒ un Ctrl+Z rapidissimo colpisce l'azione appena fatta, non la precedente; `run()` attende la richiesta originale prima di invertire, quindi l'inversa non può superarla sul filo.
- **Guardrail anti-conflitto**: prima di invertire, `run()` verifica che il valore corrente sia ancora quello prodotto dall'azione (task: stato client via `registerTasksAccessor`; subtask: GET fresco). Se un collega ha modificato nel frattempo → skip con toast "Undo saltato", mai sovrascrittura cieca.
- Entry consumata anche su skip (un conflitto non si risolve ritentando); se la richiesta *originale* fallisce, il sito chiamante chiama la `discard()` ritornata da `pushUndo` e l'entry muore con il rollback ottimistico.
- **Restore di un task cancellato**: la checklist viene snapshottata SEMPRE prima del DELETE (GET in background, la riga sparisce subito); il restore ri-POSTa il task con lo stesso UUID + `recurringTemplateId` (retry senza se il template è sparito — FK) e ricrea gli item in ordine, ripristinando i flag done.
- Dopo ogni undo riuscito: `refetchTasks(true)` + `emitSubtasksRefresh(taskId)` per riallineare board e checklist montate.
- `skipNotify: true` nel body di POST (restore) e PATCH owner (undo di riassegnazione) evita di rimandare la mail di assegnazione. È un flag client-side su endpoint condivisi: tradeoff accettato per tool interno con utenti fidati — l'alternativa (endpoint di restore server-side) è over-engineering allo stato attuale.

## Info Reperibile

Tab cross-pillar con i task rilevanti per chi è di turno, più l'indicazione di **chi è il reperibile corrente**.

**Il flag NON è una copia.** `tasks.reperibile BOOLEAN` — la tab è una vista filtrata (`WHERE reperibile AND status <> 'Closed'`) sugli stessi task. Modificarli o chiuderli dalla tab modifica/chiude il task originale del pillar: una sola verità, nessun drift, nessuna domanda su "cosa succede se l'originale viene cancellato". Scelta deliberata su alternativa "clone indipendente" (2026-07-20).

- **Checkbox "Rep."**: prima colonna di ogni riga, in tutte le tab (Storico inclusa, lì in sola lettura). Abilitata per chi ha write sul pillar del task — stesso `canWrite` di ogni altra mutazione, nessun permesso nuovo.
- **`updated_at` NON viene bumpato** quando si spunta il flag. Il sorting è per `updatedAt desc` ovunque: bumparlo farebbe saltare la riga in cima ad ogni spunta. Stessa ratio del vecchio flag `waiting`. Enforced in due punti da tenere in sync: `NO_TOUCH_FIELDS` in `backend/src/routes/tasks.js` e in `src/hooks/useTasks.js` (se solo il client bumpa, la riga salta e poi torna giù al refetch).
- **Evidenza visiva**: un task flaggato mostra una **fascia ambra** sul bordo sinistro della riga + un badge **📟** accanto al reference. La fascia è un `box-shadow: inset`, NON un border: così occupa un canale visivo diverso dal contorno rosso P0 e su una riga che è P0 *e* reperibile l'ambra sta appena dentro il rosso invece di litigare per lo stesso bordo. Ambra e non rosso perché segnala rilevanza di turno, non urgenza.
- **Marker soppressi dentro la tab Info Reperibile** (`highlightReperibile={!isReperibile}`): lì ogni riga è flaggata, evidenziarle tutte non evidenzia niente. Il contorno P0 invece resta anche lì — l'urgenza continua a contare.
- **Task chiusi**: escono dalla tab e finiscono in Storico come qualsiasi altro task. Il flag resta sul record.
- **Undo**: coperto dal meccanismo generico di `updateTask` (Ctrl+Z su una spunta sbagliata funziona anche col focus ancora sulla checkbox — vedi "Undo per-utente").
- **Reperibile corrente**: valore singolo in `app_settings` (key `on_call`), non una turnazione con date. Modificabile **solo dagli admin** dal select in cima alla tab; tutti gli altri lo leggono. Il valore deve essere un `display_owner` esistente — il backend rifiuta con 400 il testo libero, altrimenti un typo romperebbe silenziosamente l'abitudine "assegna al reperibile".
- **`app_settings`** è volutamente generico (key/value): il prossimo setting singleton non ha bisogno di una tabella nuova. `ALLOWED_KEYS` in `backend/src/routes/settings.js` è la whitelist — senza, l'endpoint diventerebbe un key/value store arbitrario per il client.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/settings/:key` | Legge un setting (auth qualsiasi). Solo chiavi in `ALLOWED_KEYS` |
| PUT | `/api/settings/:key` | Scrive un setting — **admin-only**. Valida `on_call` contro `users.display_owner` |

**File**: `backend/migrations/011_reperibile.sql`, `backend/src/routes/settings.js`, `src/hooks/useOnCall.js`, `src/components/OnCallBar.jsx`, più il flag in `TaskRow`/`TaskTable`/`TabNav`/`App.jsx`.

## Notifiche di assegnazione

Quando un task viene assegnato a un owner — alla creazione o al cambio del campo `owner` — il backend notifica l'owner tramite un **webhook Power Automate** (il Flow consegna poi via email e/o Teams).

**Flusso**: `routes/tasks.js` (POST, e PATCH con `field=owner`) → `notify.js` `notifyAssignment()` → POST JSON al webhook → Flow Power Automate → email / Teams.

- **Trigger**: `POST /api/tasks` con owner valorizzato (`event: "task.assigned"`); `PATCH /api/tasks/:id` con `owner` cambiato verso un valore nuovo e non vuoto (`"task.reassigned"`, oppure `"task.assigned"` se il task era senza owner).
- **owner → email**: risolto via tabella `users` (`display_owner` → `email`). `display_owner` non è unique: in caso di omonimi si prende il primo con un warning. Nessuna corrispondenza → log + skip silenzioso.
- **Skip auto-assegnazione**: assegnare un task a se stessi non genera notifica.
- **Recurring esclusi**: i task creati da `recurring-processor.js` NON notificano (scelta esplicita, evita ping ciclici quotidiani).
- **Fire-and-forget**: `notifyAssignment()` non viene mai `await`-ato dai route handler, cattura ogni errore e non trasforma mai un fallimento di notifica in un 500. Timeout 10s sul `fetch`.
- **`skipNotify`**: POST e PATCH-owner accettano `skipNotify: true` nel body per sopprimere la notifica. Usato SOLO dall'undo client-side (restore di task cancellato, annullamento di un cambio owner) — l'owner era già stato notificato. Flag fidato lato server (tool interno).
- **On/off**: feature spenta se `NOTIFY_WEBHOOK_URL` è vuota (dev/demo silenzioso; in prod si accende solo settando l'env var, nessun deploy di logica). `APP_PUBLIC_URL` è il link alla board incluso nel payload. **Stato attuale: ATTIVA in prod** dal 2026-06-04 (`NOTIFY_WEBHOOK_URL` settata sulla VM, Flow Power Automate live).
- **Sicurezza**: l'URL del webhook È la credenziale — vive solo nel `.env` della VM, mai committato.

Payload inviato al webhook:

```json
{
  "event": "task.assigned | task.reassigned",
  "task": { "id", "group", "reference", "description", "status", "deadline" },
  "owner": { "name", "email" },
  "assignedBy": { "name", "email" },
  "appUrl": "https://kanbanops.mauden.com",
  "timestamp": "ISO-8601"
}
```

`assignedBy` è `null` in demo mode (nessun JWT). **File**: `backend/src/notify.js`, hook in `backend/src/routes/tasks.js`. Env: `NOTIFY_WEBHOOK_URL`, `APP_PUBLIC_URL` — vedi `backend/.env.example`.

## Operations & deploy strategy

- **Deploy in produzione**: VM `mauden-ubuntu` con `docker-compose` v1.29.2 (con trattino, NON `docker compose`). `docker compose up -d --build` sulla VM fallisce con `unknown shorthand flag: 'd' in -d` perché il plugin Compose v2 non è installato. Procedura standard per applicare modifiche di codice o `.env`:
  ```bash
  cd /opt/moby-dick-b4
  git pull origin main
  docker-compose build
  docker ps -aq --filter name=moby-api --filter name=moby-nginx | xargs -r docker rm -f
  docker-compose up -d
  ```
  Mai `docker-compose up -d --build` (bug `KeyError: 'ContainerConfig'` con docker-compose v1.29.2 su recreate dopo rebuild). Se il bug è già scattato su nginx: `docker-compose rm -f nginx && docker-compose up -d nginx`. `moby-db` non viene toccato dal recreate.
- **Tag di produzione**: convention `mauden-prod-YYYY-MM-DD`. Ogni snapshot stabile in produzione riceve un tag annotato. Permette rollback puntuali e — più importante — fa da ancora di sicurezza in vista del fork futuro (vedi `HANDOFF.md`, sezione "Strategia evoluzione"). Tag attivo: `mauden-prod-2026-06-04` → `81c68c3` (priorità task P0–P5 + notifiche di assegnazione ATTIVE).
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
- [x] Link cliccabili nelle description di task e subtask (auto-detect URL `https?://`, target `_blank`, `rel="noopener noreferrer"`) — utile per puntare a documenti SharePoint. Componente `src/components/Linkify.jsx`, integrato in `TaskRow`, `EditableText` (prop `linkify`) e `SubtaskList` (sia read-only che scrivibile: dal 2026-07-16 i subtask scrivibili sono click-to-edit, quindi link e highlight funzionano anche lì).
- [x] **Evidenziazione match di ricerca nei subtask** (2026-07-16) — la ricerca già matchava il testo delle checklist (riga auto-espansa); ora il match è anche evidenziato con `<mark>` per tutti gli utenti. I subtask scrivibili sono passati da `<input>` sempre montato a click-to-edit (`EditableSubtaskDescription`: span con `Linkify`+`Highlight`, input on click, commit su blur/Enter, Escape annulla — variante deliberata del pattern `EditableText`, non consolidata per via di saving-state async e stili done/strikethrough propri).
- [x] **Undo per-utente** (2026-07-16) — bottone "↶ Annulla" in Toolbar + Ctrl+Z. Vedi sezione "Undo per-utente".
- [x] Export CSV del gruppo attivo (separator `;` + BOM UTF-8 per Excel italiano)
- [x] ~~Reset con conferma testuale "RESET" (`window.prompt`)~~ — bottone rimosso dall'UI (`ade7da1`). Endpoint `POST /api/tasks/reset` rimane vivo per emergenze via curl admin.
- [x] **Footer professionale** con versione (`KanbanOps v1.0 · © 2026 Mauden`). Include easter egg "Bit Adder" — vedi sezione dedicata sopra.
- [x] **Subtasks checklist** — tendina espandibile sotto la row, badge "N/M", vincolo "padre non chiudibile con subtask aperti" enforced backend. Fix 2026-07-07 by GPT-5/Codex: editing descrizione con draft locale e salvataggio su blur/Enter per evitare PATCH concorrenti per-keystroke; `useSubtasks` ora gestisce HTTP non-ok, rollback optimistic su PATCH/DELETE fallite e sincronizza `subtasksText` nel parent per la ricerca.
- [x] **Paginetta admin users** — `UsersModal` raggiungibile dal `UserMenu` (admin-only). CRUD su tabella users: inline edit display_owner, role select, hide (set NULL), remove, manual add. Guardrail anti-lockout (admin non può demotare/cancellare se stesso). Colonna **Scope** con 4 checkbox (Cmv/Coh/DD/NBU) per assegnare `operator_groups` ai viewer (capability additiva, ignorata per gli admin).
- [x] **Ruoli operator per-pillar** — colonna `users.operator_groups TEXT[]`. Viewer con scope `['Commvault']` diventa RW sul pillar Commvault (RO altrove). Enforcement granulare su tasks + subtasks lato backend (`canWrite` helper + `loadUserContext` middleware). UI Toolbar/TaskTable disabilitano azioni fuori scope, badge UserMenu mostra gli scope. **Recurring resta admin-only — iterazione 2 nello HANDOFF.**
- [x] **Notifiche di assegnazione** — webhook Power Automate quando un task viene assegnato/riassegnato a un owner. Backend `notify.js` (fire-and-forget), consegna email/Teams gestita dal Flow. Vedi sezione "Notifiche di assegnazione".
- [ ] **Notifiche — anti task-vuoto** (P3): la mail parte all'impostazione del campo `owner` col contenuto del task *in quel momento*, quindi assegnare prima di compilare manda una mail con reference/description vuoti. Da valutare: (a) guardrail in `notify.js` che salta la notifica se `reference` e `description` sono entrambi vuoti; (b) hint UI vicino al campo owner ("compila reference e descrizione prima di assegnare"). Per ora gestito come raccomandazione di workflow ("owner per ultimo"), nessun codice.
- [x] **Info Reperibile** (2026-07-20) — tab cross-pillar + flag `reperibile` sui task + reperibile corrente impostabile dagli admin. Vedi sezione "Info Reperibile".
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
- [x] Priority field sui task — colonna `priority` INT 0–5 (P0=urgentissimo … P5=minima), default P3. Badge `P0..P5`, P0 evidenziato con bordo rosso sul perimetro riga. Migration 010. Sorting invariato (`updatedAt desc`)
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
