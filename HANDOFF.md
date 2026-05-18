# HANDOFF.md — KanbanOps (repo: moby-dick-b4)

Stato al 2026-05-18.

⚠️ **Nome UI ufficiale: KanbanOps**. Repo, path di deploy (`/opt/moby-dick-b4`), container Docker (`moby-db`/`moby-api`/`moby-nginx`) e package npm mantengono lo slug `moby-dick-b4` per non rompere remote/deploy.

## Stato git

- Branch: `main` (allineato con `origin/main`)
- Ultimo commit: `4f95b30` — feat: persist active tab across page reloads
- Working tree: clean (più update di questo HANDOFF in commit successivo)

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
| Admin in tabella users | Login SSO → role=admin | Crea/modifica/elimina task + gestisce checklist + reset + recurring |
| Viewer auto-registrato | Login SSO → INSERT auto come viewer + display_owner=name JWT | Vede tutto in read-only, **è selezionabile come owner** di task creati da admin |
| Non-Mauden | Bloccato da Entra (single-tenant) | — |

5 admin attualmente in DB: Roberto, Amilcare, Alessio, Marco, Andrea.

## Step pending (in ordine di priorità)

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
- Campo priority
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
