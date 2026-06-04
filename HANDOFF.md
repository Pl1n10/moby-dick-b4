# HANDOFF.md — KanbanOps (repo: moby-dick-b4)

Stato al 2026-06-04.

⚠️ **Nome UI ufficiale: KanbanOps**. Repo, path di deploy (`/opt/moby-dick-b4`), container Docker (`moby-db`/`moby-api`/`moby-nginx`) e package npm mantengono lo slug `moby-dick-b4` per non rompere remote/deploy.

## Stato git

- Branch: `main` — allineato a `origin/main`
- Ultimo commit pushato: `e9c80d9` — docs: update HANDOFF (footer · Bit Adder · notifiche di assegnazione pushati il 2026-06-03)
- Working tree: clean
- Tag annotato `mauden-prod-2026-06-03` → `e9c80d9` (stato attualmente in produzione su `mauden-ubuntu`: footer + Bit Adder + notifiche con webhook OFF). Spinto su origin. Tag precedente `mauden-prod-2026-05-19` → `ade7da1` (pre-easter-egg) resta come ancora di rollback. Vedi sezione "Strategia evoluzione" qui sotto per il piano completo.

## Step completati in questa sessione (cronologico)

### Branding
- `c57e96f → a7a04c8 → 9e7146d → 6dd0293` — Logo Mauden (card bianca + asset hi-res) + favicon + fix Dockerfile (`COPY public ./public`) + tuning dimensione logo a 56px.

### Auth Entra ID
- `3ec85dc … 553560d` — scaffold + tenant ID corretto (`3c187334-…`, scoperto via well-known del dominio Mauden) + accettazione issuer v1+v2 + migration 003 (cleanup placeholder).

### Role gating
- `20679b5` — Backend: `requireAdmin` su tutti i mutating endpoint.
- `ba72525` — Frontend: `UserInfoProvider` context con `/api/me`, gating UI (Reset/Add/Recurring/Delete nascosti ai viewer), badge "Read-only" in UserMenu.

### Team reale
- `9913487` / `36f20ff` — Migration 004: `display_owner` enum → TEXT, seed 5 admin reali (Roberto, Amilcare, Alessio, Marco, Andrea), remap task seed da Bob/Erica/Walker → nomi reali.

### Cleanup
- `6efc0d1` — Migration 005: DROP COLUMN `waiting` + DELETE dei 12 task seed esempio. Rimossa sync logic waiting↔status. `EditableCheckbox.jsx` eliminato.
- `20c0bfc` — `.gitignore` *.jpg/*.jpeg + pulizia binari root.

### Subtasks (checklist)
- `dbbb221` — Migration 006: tabella `subtasks` con FK CASCADE. Router REST `/api/tasks/:taskId/subtasks`. `GET /api/tasks` con LEFT JOIN aggregato per contatori. Vincolo: PATCH `status='Closed'` su parent con subtask aperti → 400.
- `40c8cae` — UI: chevron expand/collapse, badge "N/M" verde quando tutti done, `SubtaskList` con add/toggle/edit/delete inline, `useSubtasks` con optimistic updates.

### Self-service owners
- `48c975f` — `/api/me` auto-INSERT al primo login (display_owner=name JWT, role=viewer). Nuovo router `/api/users` con `GET /owners`. `OwnersProvider` context FE con refresh on focus. `OWNERS` hardcoded rimosso da `src/data.js`.

### Admin users management
- `3f3299b` — Backend `/api/users` CRUD admin-only (list/create/patch/delete) con guardrail anti-lockout. Frontend `useUsers` + `UsersModal` (tabella con inline edit display_owner, role select, hide, remove, manual add). Linkato dal UserMenu solo per admin. Refresh `OwnersProvider` dopo ogni modifica.

### Rinomina UI
- `4d7a100` — Header, LoginGate, browser tab title da "🐋 Moby Dick B4" a "KanbanOps". Repo/deploy path/container/package invariati (rinominare li romperebbe).

### Cutover hostname `kanbanops.mauden.com` (2026-05-18)
- `fdf2a9d` — Doc + template: `CLAUDE.md`, `HANDOFF.md`, `.env.example`, permission WebFetch.
- `c5cd0c9` — `.dockerignore`: pattern `.env.*` cattura anche backup file creati con sudo (intossicavano il legacy builder context).
- VM (no commit): sostituito redirect URI in Entra dall'owner Entra, vhost+TLS dal team RP, `VITE_AZURE_REDIRECT_URI` aggiornato in `/opt/moby-dick-b4/.env`, nginx rebuildato. Login SSO confermato funzionante dal nuovo host.

### Persist tab attiva (2026-05-18)
- `4f95b30` — `App.jsx`: `activeGroup` persistito in `localStorage` (`kanbanops:activeGroup`), validato contro `GROUPS` + `__storico__`. Risolve il fastidio del refresh che riportava sempre a Commvault.

### Ruoli operator per-pillar (2026-05-18)
- `1f3f7eb` — Backend: migration 007 aggiunge `users.operator_groups TEXT[]`. `auth.js` espone `loadUserContext` middleware + helper `canWrite` + `requireWriteAccess(getGroups)`. Routes `tasks` e `subtasks` rifattorizzate: POST/PATCH/DELETE controllano il group del task (PATCH con cambio gruppo verifica vecchio E nuovo). `/api/me` ritorna `operatorGroups`; `/api/users` POST/PATCH validano e persistono il campo. Reset e CRUD users restano admin-only. Recurring NON toccato — iterazione 2 in pending.
- `574e4a6` — Frontend: `UserInfoProvider` espone `useCanWrite()` (mirror di `canWrite` backend). `App.jsx` deriva `canAdd` per la tab attiva. `Toolbar`/`TaskTable`/`TaskRow` disabilitano azioni fuori scope; `SubtaskList` eredita il readOnly per riga. `UserMenu` badge diventa "Operator: Cmv · NBU" per viewer con scope. `UsersModal` ha nuova colonna **Scope** con 4 checkbox per riga + checkbox nel form di add.

### Minor: rename pillar + link cliccabili nelle description (2026-05-18)
- Rename pillar `Data Domain` → `Data Domain - ZFS`. Aggiornati `src/data.js` (GROUPS), `backend/src/auth.js` (VALID_GROUPS), `src/components/UsersModal.jsx` (PILLAR_SHORT key). Migration `008_rename_data_domain.sql`: UPDATE idempotente di `tasks.group_name`, `recurring_templates.group_name` e `users.operator_groups` (via `array_replace`). Doc allineati (CLAUDE.md, README.md, package.json).
- Nuovo componente `src/components/Linkify.jsx`: parsa testo, trasforma URL `https?://` in `<a target="_blank" rel="noopener noreferrer">` e strippa punteggiatura finale dall'href. Riusa `Highlight` per la query di ricerca dentro testo e label dell'anchor. `onClick stopPropagation` evita che il click sul link triggeri l'editing nel `<span>` cliccabile di `EditableText`. Wired in: `TaskRow` (read-only description), `EditableText` con nuova prop `linkify` (usata in `TaskRow` writable per la description), `SubtaskList` (read-only). I subtask scrivibili restano `<input>` puro: il link è cliccabile solo quando il subtask non è in editing.

### Rimozione bottone Reset (2026-05-19)
- `ade7da1` — `Header.jsx`: rimosso bottone `↺ Reset` (era admin-only, `window.prompt('RESET')`). Endpoint `POST /api/tasks/reset` rimane vivo nel backend per emergenze via curl admin. In cascata: rimossa `handleReset` da `useTasks`, `clearRecurring` da `useRecurring`, import `useIsAdmin` da `Header.jsx`. Motivazione: in produzione su dati reali un bottone che fa `TRUNCATE + reseed` è troppo rischioso anche se gated; per azzerare il DB il modo giusto è `docker exec moby-db psql ...` con accesso VM.

### Footer professionale (2026-05-19)
- `0d8aa42` — Nuovo `src/components/Footer.jsx`: layout `KanbanOps v1.0 · © 2026 Mauden`, statico a fine pagina (non fixed), border-top `#21262d` come l'header, font version in mono, copyright in sans. Montato in `App.jsx` dopo `</main>`. Posa le fondamenta per l'easter egg Bit Adder (sessione successiva).

### Easter egg "Bit Adder" (2026-05-19) — `9ae47b2`

Clicker game nascosto. Trigger: 7 tap rapidi (entro 3s) su `KanbanOps v1.0`. Drawer espanso sotto il footer normale con clicker / shop / leaderboard. Tasto Hide collassa al footer normale (i bot continuano a ticchettare in background fino al refresh pagina). Tema: "aggiungo un bit", riferimento a un collega.

**Backend**
- `backend/migrations/009_bitadder.sql` — tabella `bit_adder(email PK FK → users(email) ON DELETE CASCADE, bits BIGINT, bots INT, updated_at)`. CHECK ≥ 0 su entrambi.
- `backend/src/routes/bitadder.js` — 4 endpoint:
  - `GET /api/bitadder/me` (auto-INSERT alla prima chiamata)
  - `POST /api/bitadder/click` body `{delta, elapsedSec}`, server clampa silenziosamente a `(50 * elapsedSec) + (bots * elapsedSec * 1.5) + 5`
  - `POST /api/bitadder/buy-bot` prezzo `floor(1024 * 1.15^bots)` (1 Kibit base — l'automazione si paga)
  - `GET /api/bitadder/leaderboard` top 10 + own row se fuori top, display name = `COALESCE(display_owner, split_part(email,'@',1))`
- Mount in `backend/src/index.js` con `requireAuth + loadUserContext` come gli altri.

**Frontend**
- `src/hooks/useBitAdder.js` — hook attivato (`active=true`) dal Footer dopo lo sblocco. Fetch iniziale `/me`, tick locale 1s (`bits += bots`), batch POST `/click` ogni 5s con delta accumulato, riallineamento al valore server. Refresh leaderboard 15s ma solo se `visible=true` (no spam quando hidden). `buyBot()` flusha il delta pendente prima del POST per evitare TOCTOU.
- `src/components/BitAdder.jsx` — UI presentazionale: tre pannelli (Clicker / Shop / Leaderboard), border `#21262d`, palette coerente col tema dark. Hide button in alto a destra. `Intl.NumberFormat('it-IT')` per i grandi numeri.
- `src/components/Footer.jsx` — riscritto: tap counter su versione, `unlocked` stato che persiste solo in memoria (refresh pagina = ricomincia), `visible` toggle. ScrollIntoView smooth al primo unlock per portare il drawer in vista.

**Doc**
- CLAUDE.md: aggiunti Footer.jsx + BitAdder.jsx + useBitAdder.js alla project structure, 4 righe per `/api/bitadder/*` nell'API table, descrizione `bit_adder` table nello schema, nuova sezione "Hidden feature — Bit Adder" tra Conventions e Upgrade TODO con economia/anti-cheat/file map, aggiornato item Reset come done-strikethrough nella feature UX, aggiunto item Footer + easter egg.
- HANDOFF.md: questa sezione.
- README.md: **deliberatamente NON aggiornato** — l'easter egg deve restare nascosto a chi clona il repo casualmente. CLAUDE.md (dev-facing) lo documenta, README (utente-facing) no.

### Notifiche di assegnazione (2026-05-20) — `f5806ab`

Notifica all'owner quando gli viene assegnato un task. Architettura: il backend rileva l'assegnazione → POST webhook → Flow Power Automate → email/Teams. La scelta del canale vive nel Flow, il backend è agnostico.

**Backend**
- `backend/src/notify.js` — nuovo. `notifyAssignment({task, event, assigner})`: risolve owner→email via tabella `users`, salta l'auto-assegnazione, POST fire-and-forget al webhook (timeout 10s), no-op se `NOTIFY_WEBHOOK_URL` non è settata. Non lancia mai, non blocca mai la response.
- `backend/src/routes/tasks.js` — hook su POST (`task.assigned`) e PATCH con `field=owner` cambiato (`task.reassigned`, o `task.assigned` se prima senza owner).
- `docker-compose.yml` — env `NOTIFY_WEBHOOK_URL` + `APP_PUBLIC_URL` sul service `api`.
- `backend/.env.example` — documentate le due env.
- `recurring-processor.js` NON toccato: i task ricorrenti non notificano (scelta esplicita).

**Doc**
- CLAUDE.md: sezione "Notifiche di assegnazione" + `notify.js` nella project structure + item done in Upgrade TODO.

**Lato Power Automate (TODO utente — la feature è spenta finché non è fatto)**
- Creare un Flow "When a HTTP request is received", generare lo schema dal payload di esempio (vedi CLAUDE.md), aggiungere azione "Send an email (V2)" e/o "Post message" Teams.
- Copiare l'URL del trigger in `NOTIFY_WEBHOOK_URL` nel `.env` della VM, poi recreate del solo `moby-api` (vedi procedura deploy).
- Finché `NOTIFY_WEBHOOK_URL` è vuota la feature resta spenta, senza errori.

### Priorità task P0–P5 (2026-06-04) — `__HASH__`

Nuova colonna **Priorità** sui task, a sinistra di Status. Scala P0..P5, dove **P0 = urgentissimo** (convention drop-everything) e P5 = minima. Default P3 sui nuovi task e sulle righe esistenti.

**Backend**
- `backend/migrations/010_priority.sql` — `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority INT NOT NULL DEFAULT 3 CHECK (0..5)`. Idempotente; le righe esistenti in prod ereditano P3 dal default.
- `backend/src/routes/tasks.js` — `priority` nel `mapTaskToClient`, nella whitelist `FIELD_TO_COLUMN`, nell'INSERT (default 3). Helper `isValidPriority` → PATCH/POST con valore fuori range tornano **400** invece di far scattare il CHECK come 500.

**Frontend**
- `src/data.js` — `PRIORITIES = [0..5]`, `DEFAULT_PRIORITY = 3`.
- `src/styles.js` — `priorityColors` (P0 rosso → P5 grigio) + `p0Red` (`#f85149`).
- `src/components/PriorityBadge.jsx` — pill `P0..P5` in stile `StatusBadge`.
- `src/components/editable/EditableSelect.jsx` — ora accetta opzioni `{value,label}` (retrocompatibile con le opzioni primitive di status/owner): il dropdown mostra `P0..P5`, il valore salvato resta numerico.
- `src/components/TaskRow.jsx` — cella Priority tra Description e Status. **Evidenza P0 = bordo rosso sul perimetro della riga, disegnato sui lati delle CELLE** (top/bottom su tutte, left sulla prima, right sull'ultima), niente background-fill.
- `src/components/TaskTable.jsx` — header "Priorità" in entrambe le viste (board + Storico).
- `src/hooks/useTasks.js` — nuovo task nasce P3 (`DEFAULT_PRIORITY`).
- `src/utils.js` — colonna "Priorità" (`P0..P5`) nell'export CSV.

**Decisioni confermate con l'utente**: P0 = solo bordo rosso (no sfondo, per leggibilità) · default P3 · **ordinamento invariato** (`updatedAt desc`, nessun sort per priorità). Filtro priorità in Toolbar NON aggiunto (non richiesto).

**Doc**: CLAUDE.md item "Priority field" spostato da TODO a done; aggiornati Task Data Model shape (`priority`) e Constants (`PRIORITIES` / `DEFAULT_PRIORITY`).

## Deploy in produzione

- Host: `mauden-ubuntu` (VM Mauden, IP LAN `10.1.1.92`)
- Hostname pubblico: **`https://kanbanops.mauden.com`** (TLS terminato da RP Mauden) — *cutover dal precedente `mobydick.mauden.com` effettuato 2026-05-18*
- Stack: 3 container Docker Compose, tutti `Up (healthy)`
  - `moby-db` (postgres:16-alpine, volume `pgdata`)
  - `moby-api` (Express, `AUTH_ENABLED=true`)
  - `moby-nginx` (Vite build dietro RP)

## Modello permessi attuale (riferimento rapido)

| Chi | Cosa fa al primo login | Cosa può fare |
|-----|------------------------|---------------|
| Admin in tabella users | Login SSO → role=admin | Crea/modifica/elimina task + subtask + recurring di QUALUNQUE pillar + reset + gestione utenti |
| Viewer + operator_groups non vuoto (Operator) | n/a (assegnato da admin) | RO globale + RW (task + subtask) sui pillar listati. Recurring: solo admin per ora. |
| Viewer auto-registrato (operator_groups vuoto) | Login SSO → INSERT auto come viewer + display_owner=name JWT | Vede tutto in read-only, **è selezionabile come owner** di task creati da admin |
| Non-Mauden | Bloccato da Entra (single-tenant) | — |

5 admin attualmente in DB: Roberto, Amilcare, Alessio, Marco, Andrea.

## Strategia evoluzione (2026-05-19) — fork per MSP expansion

Il manager dell'utente ha prospettato un'estensione di KanbanOps a tutta l'area "servizi gestiti" Mauden se il rollout interno va bene. Sceneggiatura plausibile: 5+ team interni, eventualmente uso fuori Mauden. Se si concretizza, verranno assegnati dev dedicati al progetto.

**Decisione: fork-driven, non multi-tenant in single repo.**

Razionale:
- È ancora una fase esplorativa: il successo non è scontato, non vale la pena di pagare 1-2 settimane di refactor multi-tenant ora.
- Se davvero si diffonde, arrivano dev veri che possono decidere la giusta architettura (probabilmente proprio multi-tenant). A loro lasciamo una base pulita, non un fork ammuffito.
- Nel frattempo l'utente lavora sul fork senza paura di rompere la prod Mauden.

**Tagging strategy** (per la sicurezza della prod Mauden):

- `mauden-prod-YYYY-MM-DD` è la convention. Ogni snapshot stabile di produzione riceve un tag. La VM Mauden può sempre tornare a un tag noto se qualcosa va storto.
- Tag in essere: `mauden-prod-2026-06-03` → `e9c80d9` (footer + Bit Adder + notifiche, webhook OFF) — attualmente in prod. `mauden-prod-2026-05-19` → `ade7da1` (pre-easter-egg) conservato come ancora di rollback.
- **Pinning attivo del deploy script NON ancora applicato**. La VM continua a fare `git pull` su `main`. Il pinning (sostituire `git pull` con `git fetch && git checkout <tag>` nello script di deploy a `/opt/moby-dick-b4/`) verrà applicato quando l'utente inizierà davvero il fork generico, non prima.

**Plan d'azione quando si parte col fork** (futuro, non oggi):

1. Creare repo `kanbanops-msp` (o nome a piacere) da `mauden-prod-<ultimo-tag>`.
2. Sulla VM Mauden: modificare lo script di deploy per fare `git fetch origin && git checkout <ultimo-tag-mauden>` invece di `git pull`. Da quel momento, `main` può divergere senza toccare prod.
3. Nel fork, **disegnare i nuovi meccanismi multi-gruppo come data-driven fin da subito** anche se è un fork:
   - Tabella `pillars` (id, name, position, active) invece di array hardcoded in `src/data.js` + `auth.js`. Migration idempotente che seeda i pillar correnti per Mauden. CHECK constraint `tasks.group_name` → FK su `pillars.name`.
   - `BOOTSTRAP_ADMIN_EMAILS` da `.env` invece di migration 004 con email Mauden hardcoded.
   - `APP_NAME`, `BRAND_LOGO_URL` da `.env` invece di "KanbanOps" + logo Mauden nel codice.
4. Costo: poco più del fork copia-rinomina, beneficio doppio (ogni nuovo "cliente"/team = variabile d'ambiente, e il futuro dev team eredita una base pulita).

**File toccati per la strategia** (oggi):

- Tag `mauden-prod-2026-05-19` e `mauden-prod-2026-06-03` creati e pushati.
- `HANDOFF.md`: questa sezione.
- `CLAUDE.md`: nota tag convention nella sezione operations.

## Step pending (in ordine di priorità)

> ⚙️ **Azione operativa aperta**: creare il Flow Power Automate e mettere `NOTIFY_WEBHOOK_URL` nel `.env` della VM per accendere le notifiche di assegnazione (vedi sezione "Notifiche di assegnazione" sopra). Il codice è già in prod-ready: finché l'env var è vuota la feature è spenta senza effetti collaterali.

### 0. Recurring operator-aware (iterazione 2) [P2]

Iterazione 1 (`1f3f7eb`/`574e4a6`) ha fermato lo scope a tasks + subtasks. I recurring template restano admin-only perché l'attuale API ha forma "replace all":

- `PUT /api/recurring` riceve l'INTERO array di template, fa `DELETE FROM recurring_templates` + bulk insert in transazione.
- `RecurringModal` (FE) opera col pattern "edita la lista intera, salva tutto in un colpo".

Per dare write granulare ai pillar:
1. Backend: aggiungere `POST /api/recurring`, `PATCH /api/recurring/:id`, `DELETE /api/recurring/:id`. Ognuno con check `canWrite(req.userCtx, template.group)` (PATCH che cambia group → check su vecchio E nuovo, come per task). Il `PUT` esistente può restare admin-only come "bulk replace" per uso amministrativo, oppure essere rimosso del tutto.
2. Frontend: refactor `RecurringModal` da "save all on submit" a "save per riga" o "save delta". `useRecurring` hook adeguato. `Toolbar` espone il bottone Recurring anche agli operator, ma il modal mostra come read-only le righe di pillar fuori scope.
3. Decisione UX: nel modal mostrare anche i template degli altri pillar (greyed) o solo i propri? Confermare con utente.

### 1. Backup off-host [P1, già pending dal 2026-05-12]

Backup locale attuale (`/var/backups/moby/` cron daily) protegge solo da errori applicativi. Decisione utente: chiedere al team backup Mauden se la VM è coperta dal job NBU/Cohesity.

### 2. Test suite minima [P3]

Vitest + RTL + Supertest:
- Role enforcement backend (admin vs viewer su POST/PATCH/DELETE)
- Vincolo close con subtask aperti
- Auto-register su `/api/me` (mock JWT)
- Anti-lockout guardrail (admin che prova a demotare/cancellare se stesso → 400)
- `useSubtasks` optimistic updates + counter sync via `updateSubtaskCounters`
- Filtri toolbar

### 3. Dialog custom [P2]

Sostituire `window.confirm()` di delete + `window.prompt()` di reset + `window.confirm` di remove utente con modal coerente dark theme.

### 4. Drag & drop ordinamento subtasks [P3]

`subtasks.position` esiste già nel schema. Aggiungere drag handle + PATCH del campo. Library candidata: `@dnd-kit/sortable`.

### 5. Feature UX residue [P4]

- Drag & drop riordinamento task (non solo subtasks)
- Comments / history / audit trail
- CSS `:hover` invece di JS `onMouseEnter`/`onMouseLeave`
- ESLint + Prettier
- Migrazione progressiva TypeScript

## Decisioni di design non ovvie

- **Tenant ID corretto Mauden**: `3c187334-ba7e-4a38-985e-b9bcf958cb27`. Verificabile via `https://login.microsoftonline.com/mauden.com/v2.0/.well-known/openid-configuration`. Il primo GUID passato dall'IT (`4301924c-…`) era un altro identificativo del portal — pattern utile in futuro: verificare sempre tenant ID via well-known prima di scrivere `.env`.
- **JWT issuer v1+v2 entrambi accettati**: Entra emette v1 di default. v2 richiede `accessTokenAcceptedVersion: 2` nel manifest, non sempre fatto. Accettare entrambi rende il backend agnostico al setting.
- **`runMigrations` re-applica tutti i `.sql` ad ogni boot**: niente `schema_migrations` table. Ogni file deve essere idempotente. 002/004 hanno un piccolo flip-flop sull'enum (002 ricrea, 004 droppa) ma lo stato finale è coerente.
- **`display_owner` da enum a TEXT** (migration 004): più flessibile per onboarding di nuovi owner senza ALTER TYPE.
- **Self-service auto-register**: chiunque `@mauden` che fa login viene aggiunto automaticamente a `users` con `display_owner=name JWT, role=viewer`. ON CONFLICT DO NOTHING preserva modifiche manuali. Set `display_owner=NULL` per nascondere senza rimuovere.
- **`OWNERS` non più hardcoded**: lista dinamica via `/api/users/owners` + `OwnersProvider` context (refresh on window focus).
- **Subtasks ≠ task gerarchici completi**: progettato come checklist inline (testo + done flag), niente owner/group/scadenza proprio. Modello semplificato.
- **Counter subtask aggregato in GET /api/tasks**: LEFT JOIN aggregato. Update locale ottimistico via `updateSubtaskCounters` evita refetch.
- **Padre non chiudibile se subtask aperti**: vincolo rigido backend (400). Frontend non blocca a priori, l'errore arriva dal server.
- **Waiting status ≠ waiting boolean**: lo stato `Waiting` (uno dei 5 STATUSES) rimane. Il booleano parallelo `waiting` è stato rimosso (era ridondante).
- **HTTPS lato RP Mauden**: VM HTTP puro internamente, TLS termination esterna.
- **Logo Mauden in card bianca**: il file ufficiale è nero su sfondo. La card chiara dentro UI scura è coerente col pattern già usato dai status badge.
- **Bit Adder server-authoritative**: il client tiene un contatore display ottimistico e batcha i delta ogni 5s. Il server clampa silenziosamente (mai 4xx) per non rompere il gioco con tab in background o throttling browser. Dopo ogni `/click` il client si riallinea al valore server tornato — quindi un client che bara vede comunque un numero "vero" che eventualmente lo smentisce.
- **Bit Adder prezzo base 1024**: nasce dalla richiesta "almeno 1kb" — 1 Kibit (1024 bit) è la base più tematica. La curva `1.15^k` è il classico Cookie Clicker: il primo bot richiede ~3 min di click manuale spammando, dopodiché lo snowball prende il sopravvento.
- **Bit Adder bot in background quando hidden**: scelta esplicita per non punire chi nasconde per panic (collega in ufficio). Lo hook `useBitAdder` resta attivo finché la pagina è aperta. Refresh = stop totale + risync allo stato server.
- **Bit Adder NON documentato in README**: README è user-facing, l'easter egg deve restare scopribile solo dal trigger. CLAUDE.md (dev/AI-facing) documenta tutto perché chi tocca il codice deve sapere cosa non rompere.
- **P0 evidenziato con bordo sulle celle, non sul `<tr>`**: la tabella usa `border-collapse: collapse`, dove `box-shadow`/`outline` sul `<tr>` non si renderizzano in modo affidabile. Disegnando il bordo rosso sui lati delle celle (top/bottom ovunque, left sulla prima cella, right sull'ultima) si ottiene un rettangolo netto: nelle regole di collapse il bordo della cella vince per colore su quello grigio della riga. Scelta voluta del bordo invece del fill di sfondo per non compromettere la leggibilità del testo. Prima/ultima cella dipendono dal layout (Gruppo solo in Storico, colonna azioni solo fuori Storico) — i due flag sono mutuamente esclusivi, quindi left/right cadono sempre su una cella sola.
- **Priorità numerica in DB, label `Px` in UI**: la colonna è `INT 0..5` (ordinabile/filtrabile in SQL se servirà), ma badge e dropdown mostrano `P0..P5`. `EditableSelect` esteso a opzioni `{value,label}` per non duplicare il componente.
- **Notifiche via Power Automate, non SMTP/Graph**: il backend rileva l'assegnazione (logica che deve esistere comunque) e delega la consegna a un Flow Power Automate via webhook HTTP. Niente relay SMTP da scovare, niente permission `Mail.Send` da far consentire a IT, niente client secret nel backend: l'unico segreto è l'URL del webhook. Il Flow (no-code) decide email vs Teams ed è modificabile senza rideploy del backend.

## Workflow concordato con l'utente

- Comunicazione in italiano
- Auto-commit a step verde (un commit = codice + handoff allineati quando chiude uno step di scope)
- Prefissi commit: `feat:` `fix:` `refactor:` `chore:`
- Identità git: `Pl1n10`
- Mai assumere credenziali/secrets, mai committarli
- `.env` vive solo sulla VM (`/opt/moby-dick-b4/.env`), `chmod 600`
- **Gotcha Dockerfile nginx**: `COPY public ./public` nel build stage obbligatorio
- **Gotcha docker-compose v1.29.2**: bug `KeyError: 'ContainerConfig'` su QUALUNQUE recreate dopo rebuild image (non solo `--force-recreate`). NON usare `docker-compose up -d --build`. **Procedura standard** per applicare modifiche che richiedono rebuild (codice FE, `.env` con VITE_*, Dockerfile):
  ```bash
  docker-compose build                                                               # solo build, no recreate
  docker ps -aq --filter name=moby-api --filter name=moby-nginx | xargs -r docker rm -f   # wipe container che cambiano image (db NO)
  docker-compose up -d                                                               # recreate clean
  ```
  Lasciare `moby-db` intatto: pgdata sopravvive comunque (volume nominato), ma evita restart inutili.
- **Gotcha sudo nei file di repo**: file creati con `sudo` (es. `sudo cp .env .env.bak-...`) finiscono owned by root, illeggibili dal docker daemon che gira come utente non-root → il legacy builder fallisce con "no permission to read from ...". Mitigato dal pattern `.env.*` in `.dockerignore`, ma vale come regola: backup/temp file di root → fuori dalla repo dir (`/opt/.env.bak-*` o `/root/`).
- **Gotcha terminal paste**: terminale dell'utente prepende 2 spazi alle righe pastate. Heredoc `<<'EOF'` fallisce. Usare `nano` per file multi-line, `psql -c` per SQL una riga.

## Come verificare lo stato verde

```bash
# Dev locale
npm run dev   # localhost:5173, proxy /api → :3000
cd backend && npm run dev

# Smoke produzione (sulla VM)
docker compose ps                          # 3 container Up healthy
curl -s http://localhost/api/health        # {"status":"ok",...}
curl -I http://localhost/api/tasks         # 401 (auth attiva)
docker exec moby-db psql -U moby moby -c "SELECT email, display_owner, role FROM users ORDER BY display_owner;"
docker exec moby-db psql -U moby moby -c "\d tasks"      # niente colonna waiting
docker exec moby-db psql -U moby moby -c "\d subtasks"   # tabella esiste
docker logs moby-api --tail 30             # niente "JWT verification failed"
```

Smoke pubblico (browser):
- `https://kanbanops.mauden.com/` → login MSAL → SSO Mauden
- Admin: bottoni Add/Reset/Recurring/Delete visibili. Espansione checklist + vincolo "Cannot close task"
- Viewer auto-registrato: badge "Read-only", solo lettura, ma è già selezionabile come owner di task creati dagli admin

## File da leggere per riprendere il filo (in ordine)

1. `~/.claude/CLAUDE.md` (global)
2. `./CLAUDE.md` (progetto)
3. `./HANDOFF.md` (questo file)
4. `git log --oneline -n 15`
5. `git status`
6. `./backend/src/auth.js` + `./src/auth/` per sessioni auth
7. `./backend/src/routes/subtasks.js` + `./src/components/SubtaskList.jsx` per sessioni checklist
8. `./backend/src/routes/users.js` + `./src/auth/OwnersProvider.jsx` per sessioni self-service owners
9. `./backend/migrations/` per lo storico schema
