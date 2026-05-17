# HANDOFF.md — Moby Dick B4

Stato al 2026-05-17.

## Stato git

- Branch: `main` (allineato con `origin/main`)
- Ultimo commit: `553560d` — fix: accept v1 and v2 JWT issuers, cleanup migration for placeholder seed
- Working tree: clean (eccetto `.claude/settings.local.json` modifica residua irrilevante)

## Step completati di recente (in ordine cronologico)

- `c57e96f` — Logo Mauden in header + favicon
- `a7a04c8` — Fix Dockerfile nginx: COPY public/ nel build stage
- `9e7146d` / `6dd0293` — Tuning dimensione logo (24px → 40px → 56px) e padding header
- `3b3d496` — Seed users con solo `roberto.novara@mauden.com` admin (NULL display_owner)
- `20679b5` — Backend: middleware `requireAdmin` su mutating endpoints
- `ba72525` — Frontend: `UserInfoProvider` context + gating UI viewer (readOnly su TaskRow, hide Reset/Add/Recurring, badge "Read-only" su UserMenu)
- `553560d` — Backend: accetta JWT issuer v1 (`sts.windows.net`) e v2 (`login.microsoftonline.com/.../v2.0`) + migration 003 pulizia placeholder

## Deploy in produzione

- Host: `mauden-ubuntu` (VM Mauden, IP LAN `10.1.1.92`)
- Hostname pubblico: **`https://mobydick.mauden.com`** con TLS terminato dal RP Mauden
- Stack: 3 container Docker Compose, tutti `Up (healthy)`
  - `moby-db` — postgres:16-alpine
  - `moby-api` — Express, `AUTH_ENABLED=true`
  - `moby-nginx` — espone :80 dietro il RP

## Auth Entra ID — stato

✅ **Attiva in produzione.**

- App registration "Moby Dick B4" registrata da team IT Mauden
- Single-tenant Mauden, platform SPA, redirect URI `https://mobydick.mauden.com`
- Custom API exposed `api://<client-id>/access_as_user`
- Token v1 ed v2 entrambi accettati lato backend
- `.env` in `/opt/moby-dick-b4/.env` (mai committare):
  - `AUTH_ENABLED=true`
  - `AZURE_TENANT_ID=3c187334-ba7e-4a38-985e-b9bcf958cb27` (⚠️ NON `4301924c-...`, valore inizialmente errato passato dall'IT)
  - `AZURE_CLIENT_ID=7e8814ac-13e9-4133-84dc-4673e4773977`
  - `AZURE_API_AUDIENCE=api://7e8814ac-...`
  - `VITE_*` corrispondenti per build args frontend

### Modello permessi attuale

- Tutti gli utenti `@mauden` (single-tenant) possono fare login
- Tabella `users` (DB) mappa email → `display_owner` + `role` (`admin` | `viewer`)
- **Default per utente non in tabella**: `role=viewer`. Vede solo lettura, niente bottoni mutating
- **Admin in DB**: `roberto.novara@mauden.com`
- **Enforcement autoritativo**: backend `requireAdmin` su tutti POST/PATCH/DELETE
- **Gating UI**: cosmetico, completa UX ma non sostituisce il backend

## Step pending (in ordine di priorità)

### 1. Aggiungere admin reali (Bob/Erica/Walker) [P1, sblocco rollout team]

Senza le loro email reali Mauden non possono operare. Quando arrivano, eseguire:

```bash
docker exec moby-db psql -U moby moby -c \
  "INSERT INTO users (email, display_owner, role) VALUES \
   ('<email-bob>', 'Bob', 'admin'), \
   ('<email-erica>', 'Erica', 'admin'), \
   ('<email-walker>', 'Walker', 'admin') \
   ON CONFLICT (email) DO UPDATE SET role='admin', display_owner=EXCLUDED.display_owner;"
```

### 2. Frontend: default owner da `/api/me` invece di `OWNERS[0]` [P2]

In `handleAdd` di `useTasks`, usare `userInfo.owner` come default owner del nuovo task. Oggi è sempre "Bob". Per Roberto resta NULL (lui non è un task owner), ma per Bob/Erica/Walker l'auto-default sarà quello giusto.

### 3. `/api/users` CRUD per admin [P3]

Permette di gestire users runtime senza SQL diretto. Endpoint admin-only:
- `GET /api/users` — lista
- `POST /api/users` — crea
- `PATCH /api/users/:id` — modifica display_owner + role
- `DELETE /api/users/:id` — rimuovi

Più una UI minimale (sezione "Settings" o modal) accessibile solo a role=admin.

### 4. `AUTH_SETUP.md` [P3, documentazione]

Doc operativa con la checklist a 5 punti per la app registration Entra (SPA platform, expose API, API permissions + admin consent, optional claims email/upn, single-tenant). Utile per ricreare il setup in un altro tenant o ri-onboardare.

### 5. Backup off-host [P1, già pending dal 2026-05-12]

Backup locale attuale (cron daily `/var/backups/moby/`) protegge solo da errori applicativi, non da VM persa. Decisione utente: chiedere al team backup Mauden se la VM è coperta dal job NBU/Cohesity esistente, altrimenti rsync verso altra VM aziendale.

### 6. Test suite minima [P3, debito crescente]

Vitest + RTL: waiting↔status sync (FE+BE), filtri toolbar, recurring scheduler, optimistic update + reconciliation, gating UI per role.

### 7. Dialog custom [P2]

Sostituire `window.confirm()` di delete con modal coerente al dark theme.

### 8. Feature UX residue [P2/P4]

- Drag & drop riordinamento manuale task
- Campo priority
- Comments / history / audit trail
- CSS `:hover` invece di JS `onMouseEnter`/`onMouseLeave`
- Migrazione progressiva TypeScript

## Decisioni di design non ovvie

- **Tenant ID corretto Mauden**: `3c187334-ba7e-4a38-985e-b9bcf958cb27`. Verificabile via `https://login.microsoftonline.com/mauden.com/v2.0/.well-known/openid-configuration`. Il primo valore passato dall'IT (`4301924c-...`) era un altro GUID (Object/Subscription ID).
- **JWT issuer v1+v2 entrambi accettati**: Entra emette token v1 di default. Per emettere v2 serve `accessTokenAcceptedVersion: 2` nel manifest dell'app, che non è il caso. Accettare entrambi rende il backend agnostico.
- **`runMigrations` re-applica tutti i `.sql` ad ogni boot**: niente tabella `schema_migrations`. Ogni migration deve essere idempotente (ON CONFLICT, IF NOT EXISTS, DELETE puntuale).
- **Waiting↔Status sync simmetrico**: la logica vive sia in `useTasks.js` (frontend ottimistico) sia in `routes/tasks.js` (backend autoritativo). Cambiare la regola in un solo posto causa drift silenzioso.
- **Waiting toggle non aggiorna `updatedAt`**: scelta voluta per non far saltare le righe nell'ordinamento.
- **Recurring processing è server-side**. Il client `useRecurring` fa solo CRUD template.
- **Seed re-inseribile via `/api/tasks/reset`**: `SEED_SQL` in `routes/tasks.js` deve restare allineata a `migrations/001_init.sql`.
- **`display_owner` può essere NULL** (per Roberto che è admin ma non task-owner). Lo schema enum è `Bob|Erica|Walker`, nullable.
- **HTTPS**: TLS termination lato RP Mauden, VM HTTP puro internamente.
- **Logo Mauden in card bianca**: scelta cromatica forzata perché il file logo ufficiale è nero su sfondo. La "card bianca dentro UI scura" è coerente col pattern già usato dai status badge (`#e8f4fd` etc.). Versione reverse del logo non disponibile.

## Workflow concordato con l'utente

- Comunicazione sempre in italiano
- Auto-commit a step verde (un commit = codice + handoff allineati)
- Prefissi commit: `feat:`, `fix:`, `refactor:`, `chore:`
- Identità git: `Pl1n10`
- Mai assumere credenziali/secrets, mai committarli
- `.env` vive solo sulla VM (`/opt/moby-dick-b4/.env`), `chmod 600`
- Per asset pubblici: cartella `public/` (Vite copia in `dist/` durante build, nginx li serve). Il Dockerfile nginx **deve** fare `COPY public ./public` nel build stage (errore già fatto una volta, gotcha noto)

## Come verificare lo stato verde

Test suite non ancora esistente. Verifica funzionale manuale:

```bash
# Dev locale
npm run dev   # localhost:5173, proxy /api → :3000
cd backend && npm run dev

# Smoke produzione (sulla VM)
docker compose ps                       # 3 container Up healthy
curl -s http://localhost/api/health     # {"status":"ok",...}
curl -I http://localhost/api/tasks      # 401 (auth attiva)
docker exec moby-db psql -U moby moby -c "SELECT email, role FROM users;"
docker logs moby-api --tail 30          # niente "JWT verification failed"
```

Smoke pubblico (dal browser di un client):
- `https://mobydick.mauden.com/` carica
- Login MSAL funziona
- Admin: vede Add/Reset/Recurring, può modificare task
- Viewer: badge "Read-only", solo lettura, ✕ delete e bottoni mutating nascosti

## File da leggere per riprendere il filo (in ordine)

1. `~/.claude/CLAUDE.md` (global)
2. `./CLAUDE.md` (progetto, sezione "Upgrade TODO" e "Entra ID — Stato e TODO")
3. `./HANDOFF.md` (questo file)
4. `git log --oneline -n 10`
5. `git status`
6. `./backend/src/auth.js` + `./src/auth/` se la sessione tocca auth
7. `./backend/migrations/` se la sessione tocca lo schema DB
