# HANDOFF.md — Moby Dick B4

Stato al 2026-05-17 (sera).

## Stato git

- Branch: `main` (allineato con `origin/main`)
- Ultimo commit: `40c8cae` — feat: expandable checklist UI for subtasks
- Working tree: clean (eccetto `.claude/settings.local.json` modifica residua irrilevante)

## Step completati in questa sessione (cronologico)

### Branding
- `c57e96f → 6dd0293` — Logo Mauden in header (card bianca + logo nero) + favicon. Asset in `public/`.
- `a7a04c8` — Dockerfile nginx: aggiunto `COPY public ./public` nel build stage (gotcha: senza, gli asset non finiscono in `dist/`).

### Auth Entra ID
- `3ec85dc … 553560d` — scaffold + tenant ID corretto (`3c187334-…`) + accettazione issuer v1+v2 + migration 003 (cleanup placeholder).
- ✅ **Auth attiva in produzione**. Login MSAL → SSO Mauden → /api/me → ruolo lookup DB.

### Role gating
- `20679b5` — Backend: middleware `requireAdmin` su tutti i mutating endpoint (POST/PATCH/DELETE tasks + recurring + tasks/reset).
- `ba72525` — Frontend: `UserInfoProvider` context con `/api/me`, gating UI (Reset/Add/Recurring/Delete nascosti ai viewer), badge "Read-only" in `UserMenu`.

### Team reale
- `9913487` — Migration 004: `display_owner` enum → TEXT (più flessibile), seed con 4 admin reali, remap task seed da Bob/Erica/Walker → Roberto/Amilcare/Alessio.
- `src/data.js` OWNERS aggiornato a `['Roberto Novara', 'Amilcare Iacono', 'Alessio Coletta', 'Marco Fauci']`.

### Cleanup `waiting` + seed esempi
- `6efc0d1` — Migration 005: DROP COLUMN `waiting` + DELETE dei 12 task seed (UUID fissi `a1b2c3d4-0001…0012`). Rimossa la sync logic FE+BE waiting↔status. `/api/tasks/reset` non re-seeda più (svuota e basta). `EditableCheckbox.jsx` rimosso.
- `20c0bfc` — Pulizia binari stray in root + `.gitignore` *.jpg/*.jpeg.

### Subtasks (checklist)
- `dbbb221` — Migration 006: tabella `subtasks` (id, task_id FK CASCADE, description, done, position, created_at) + index. Router REST sotto `/api/tasks/:taskId/subtasks` (GET aperto agli authenticated, POST/PATCH/DELETE admin). `GET /api/tasks` ora include `subtasksTotal`/`subtasksOpen` via LEFT JOIN aggregato. Vincolo: PATCH `status='Closed'` su task con subtask aperti rifiutato 400.
- `40c8cae` — UI: chevron expand/collapse + badge "open/total" (verde quando tutti done). `SubtaskList` con add inline, toggle, edit, delete. `useSubtasks` con optimistic updates; counter parent aggiornato senza refetch via `updateSubtaskCounters`.

## Deploy in produzione

- Host: `mauden-ubuntu` (VM Mauden, IP LAN `10.1.1.92`)
- Hostname pubblico: **`https://mobydick.mauden.com`** (TLS terminato da RP Mauden)
- Stack: 3 container Docker Compose, tutti `Up (healthy)`
  - `moby-db` (postgres:16-alpine, volume `pgdata`)
  - `moby-api` (Express, `AUTH_ENABLED=true`)
  - `moby-nginx` (Vite build dietro RP)

## Auth — stato

✅ Live. Tenant `3c187334-ba7e-4a38-985e-b9bcf958cb27`, client `7e8814ac-13e9-4133-84dc-4673e4773977`. App registration tipo SPA, custom API exposed, optional claims email/upn, single-tenant Mauden. Token v1 e v2 entrambi accettati lato backend.

### Modello permessi attuale

- Single-tenant Mauden → chiunque `@mauden` può fare login.
- Tabella `users` (DB): email → `display_owner` (TEXT nullable) + `role` (`admin` | `viewer`).
- Default per email non in tabella: `role='viewer'`.
- Backend enforce admin su tutti i mutating endpoint (`requireAdmin`).
- Frontend nasconde UI mutating ai viewer + badge "Read-only".

### Admin attualmente registrati

- `roberto.novara@mauden.com` → "Roberto Novara"
- `amilcare.iacono@mauden.com` → "Amilcare Iacono"
- `alessio.coletta@mauden.com` → "Alessio Coletta"
- `marco.fauci@mauden.com` → "Marco Fauci"

Per aggiungere/promuovere altri user oggi servono SQL diretti sul container `moby-db`. La paginetta admin (vedi pending #1) renderà superfluo questo passaggio.

## Step pending (in ordine di priorità)

### 1. Paginetta admin per gestione users [P1, prossimo step]

Backend `/api/users` CRUD (admin-only):
- `GET /api/users` — lista tutti
- `POST /api/users` — crea (email + display_owner + role)
- `PATCH /api/users/:id` — modifica display_owner / role
- `DELETE /api/users/:id` — rimuovi

`GET /api/users/owners` (open agli authenticated) — solo users con `display_owner` non null → il frontend usa questa lista invece di `OWNERS` hardcoded in `src/data.js`. Aggiungere/togliere owner via UI senza deploy.

UI:
- Pagina o modal "Admin → Utenti" raggiungibile da `UserMenu` solo per admin
- Tabella users con inline edit di display_owner e role, bottoni promote/demote, delete con conferma
- Form "Aggiungi user" (email + display_owner opzionale + role)

Auto-register su login (opzionale ma complementare):
- Quando `/api/me` viene chiamato e l'email non è in users, INSERT auto con role=viewer, display_owner=NULL
- L'admin vede subito i nuovi loggati nella paginetta e può promuoverli
- Decisione: farlo solo dopo aver visto se serve davvero (potrebbe creare rumore con utenti curiosi)

### 2. Default owner da `/api/me` invece di `OWNERS[0]` [P2]

In `handleAdd` di `useTasks`, usare `userInfo.owner` come default invece di "Roberto Novara". Coerente con la paginetta admin sopra.

### 3. Backup off-host [P1, già pending dal 2026-05-12]

Backup locale attuale protegge solo da errori applicativi. Decisione: chiedere al team backup Mauden se la VM è coperta dal job NBU/Cohesity esistente.

### 4. Test suite minima [P3]

Vitest + RTL + Supertest:
- waiting (eliminato) → niente più sync test, ma:
- Role enforcement backend (admin vs viewer su POST/PATCH/DELETE)
- Vincolo close con subtask aperti
- useSubtasks optimistic updates + counter sync
- Filtri toolbar

### 5. Dialog custom [P2]

Sostituire `window.confirm()` di delete + `window.prompt()` di reset con modal coerente dark theme.

### 6. Drag & drop ordinamento subtasks [P3]

`subtasks.position` esiste già nel schema. Manca solo l'UI handle + PATCH del campo. Library candidata: `@dnd-kit/sortable`.

### 7. Feature UX residue [P4]

- Drag & drop riordinamento task (non solo subtasks)
- Campo priority
- Comments / history / audit trail
- CSS `:hover` invece di JS `onMouseEnter`/`onMouseLeave`
- Migrazione progressiva TypeScript

## Decisioni di design non ovvie

- **Tenant ID corretto Mauden**: `3c187334-ba7e-4a38-985e-b9bcf958cb27`. Verificabile via `https://login.microsoftonline.com/mauden.com/v2.0/.well-known/openid-configuration`. Il primo GUID passato dall'IT (`4301924c-…`) era un altro identificativo del portal.
- **JWT issuer v1+v2 entrambi accettati**: Entra emette v1 di default. v2 richiede `accessTokenAcceptedVersion: 2` nel manifest, non sempre fatto. Accettare entrambi rende il backend agnostico al setting.
- **`runMigrations` re-applica tutti i `.sql` ad ogni boot**: niente schema_migrations table. Ogni file deve essere idempotente (ON CONFLICT, IF NOT EXISTS, DROP/CREATE IF EXISTS). Le migration 002/004 hanno un piccolo flip-flop sull'enum (002 ricrea, 004 droppa) ma lo stato finale è coerente.
- **`display_owner` da enum a TEXT** (migration 004): più flessibile per onboarding di nuovi owner senza ALTER TYPE.
- **Waiting status ≠ waiting boolean**: lo stato `Waiting` (uno dei 5 STATUSES) rimane. Il booleano parallelo `waiting` è stato rimosso (era ridondante, già implicato dallo stato).
- **Subtask checklist semplice ≠ task gerarchico completo**: progettato come TODO list inline (testo + done flag), non come sub-task con owner/group/scadenza/status proprio. Modello più semplice di ServiceNow.
- **Counter subtask aggregato in GET /api/tasks**: LEFT JOIN con aggregato evita N+1 fetch dal client. Update locale ottimistico via `updateSubtaskCounters` evita refetch del task dopo ogni mutation di subtask.
- **Padre non chiudibile se subtask aperti**: vincolo rigido backend (PATCH ritorna 400 con messaggio). Frontend non bloccato a priori, l'errore arriva dal server.
- **HTTPS lato RP Mauden**: VM HTTP puro internamente, TLS termination esterna.
- **Logo Mauden in card bianca**: il file ufficiale è nero su sfondo. La card chiara dentro UI scura è coerente col pattern già usato dai status badge.

## Workflow concordato con l'utente

- Comunicazione in italiano
- Auto-commit a step verde (un commit = codice + handoff allineati quando il commit chiude uno step di scope)
- Prefissi commit: `feat:` `fix:` `refactor:` `chore:`
- Identità git: `Pl1n10`
- Mai assumere credenziali/secrets, mai committarli
- `.env` vive solo sulla VM (`/opt/moby-dick-b4/.env`), `chmod 600`
- **Gotcha Dockerfile nginx**: `COPY public ./public` nel build stage è obbligatorio (già sbattuto la testa una volta)
- **Gotcha docker-compose v1.29.2 + Docker recente**: bug `KeyError: 'ContainerConfig'` su `up --force-recreate`. Workaround: `docker ps -aq --filter name=moby | xargs -r docker rm -f && docker-compose up -d`.
- **Gotcha terminal paste**: il terminale dell'utente prepende 2 spazi alle righe pastate. Heredoc `<<'EOF'` fallisce (EOF non riconosciuto come terminatore). Usare `nano` per file multi-line, `psql -c` per SQL una riga.

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
docker exec moby-db psql -U moby moby -c "\d tasks"     # niente colonna waiting
docker exec moby-db psql -U moby moby -c "\d subtasks"  # tabella esiste
docker logs moby-api --tail 30             # niente "JWT verification failed"
```

Smoke pubblico (browser di un client):
- `https://mobydick.mauden.com/` carica
- Login MSAL → SSO Mauden funziona
- Admin: bottoni Add/Reset/Recurring/Delete visibili. Click `▶` su task → checklist espansa, aggiungo item, spunto, riprovo a chiudere il task → errore "Cannot close task: N subtask still open".
- Viewer: badge "Read-only", solo lettura, niente bottoni mutating, checklist visibile ma non modificabile.

## File da leggere per riprendere il filo (in ordine)

1. `~/.claude/CLAUDE.md` (global)
2. `./CLAUDE.md` (progetto)
3. `./HANDOFF.md` (questo file)
4. `git log --oneline -n 15`
5. `git status`
6. `./backend/src/auth.js` + `./src/auth/` per sessioni auth
7. `./backend/src/routes/subtasks.js` + `./src/components/SubtaskList.jsx` per sessioni checklist
8. `./backend/migrations/` per lo storico schema
