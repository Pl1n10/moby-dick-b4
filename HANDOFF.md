# HANDOFF.md — Moby Dick B4

Stato al 2026-05-12.

## Stato git

- Branch: `main` (allineato con `origin/main`)
- Ultimo commit: `c6ca9db` — feat: Export CSV del gruppo attivo (rispetta filtri visibili)
- Working tree: dirty su `package-lock.json` (modifica residua non rilevante, da valutare se discardare o committare in `chore:`)

## Step completati di recente

- `c6ca9db` — Export CSV gruppo attivo (separator `;`, BOM UTF-8, filename con data)
- `2139906` — Reset richiede conferma testuale "RESET"
- `fe0a3ca` — Seed dati arricchito (3 task/gruppo, copertura stati)
- `f17ec46` — Split tab "NetBackup + Data Domain" → "Data Domain" + "NBU - Banche Estere"
- `4bf7d5e` — Fix build nginx (npm install in build stage)
- `3ec85dc` — Scaffold Entra ID auth (flag `AUTH_ENABLED=false` di default)

## Deploy in produzione (nuovo, 2026-05-12)

Prima istanza reale up su VM Mauden:

- Host: `SentinelTestLinux` (VMware on-prem, NON Azure come inizialmente detto)
- IP LAN: `10.1.1.92`
- Stack: 3 container Docker Compose, tutti `Up (healthy)`
  - `moby-db` — postgres:16-alpine
  - `moby-api` — Express, auth in demo mode
  - `moby-nginx` — espone :80 su `0.0.0.0`
- Restart policy: `unless-stopped` su tutti e 3
- Backup locale: cron daily 03:00 → `~/backups/moby-YYYYMMDD.sql.gz`, retention 14 giorni

⚠️ **In produzione SENZA autenticazione.** Vedi step pending #1.

## Step pending (in ordine di priorità)

### 1. Auth Entra ID (P1, bloccante per "production-ready") [⚠️ richiede review puntigliosa]

Codice già predisposto (frontend MSAL + backend JWKS). Mancano:

- Registrazione app lato Entra Mauden (owner esterno, non posso farlo io)
  - Tipo SPA, redirect URI dev + prod, custom API `api://<client-id>` con scope `access_as_user`
  - Opzionale: App Roles `Admin`/`Viewer`
- Scrivere `AUTH_SETUP.md` con checklist passo-passo per l'owner Entra
- Compilare `.env.local` (frontend) + `.env` (backend) con valori reali
- Migration `002_users.sql`: tabella `users` (id, email UNIQUE, display_owner ENUM Bob/Erica/Walker, role ENUM admin/viewer)
- Seed iniziale: bob@mauden.com → Bob/admin, erica@mauden.com → Erica/admin, walker@mauden.com → Walker/admin
- Backend: `/api/me` arricchito con owner + role da DB
- Backend: `/api/users` CRUD per role=admin
- Frontend: default owner da `/api/me` invece di `OWNERS[0]` in `handleAdd`
- Frontend: gating UI per viewer (nasconde delete/reset/add)
- Backend: enforcement role admin sugli endpoint mutating
- Test E2E con guest @ricoh prima di flip `AUTH_ENABLED=true`

### 2. Backup off-host (P1, bloccante per "data-safe")

Backup locale attuale protegge solo da errori applicativi, non da VM persa. Decidere tra:
- A) Includere `SentinelTestLinux` in job NBU/Cohesity Mauden esistente. Path da raccogliere: `~/backups/` (o spostare in `/var/backups/moby/` se preferito)
- B) rsync giornaliero verso altra VM Mauden / share NFS aziendale
- C) ❌ NO homelab personale (exfiltration aziendale)

Decisione utente: rimandata, da chiedere al team backup Mauden se la VM è già coperta.

### 3. Coordinamento team RP per hostname pubblico

Mauden gestisce certificati e TLS termination lato RP. Info già pronte da girare al team (vedi conversazione 2026-05-12). Aspettiamo che assegnino:
- Hostname (`mobydick.mauden.*`)
- Apertura proxy verso `10.1.1.92:80`

### 4. Test suite minima (P3, debito crescente)

Vitest + React Testing Library per:
- Logica waiting↔status sync (sia FE che BE)
- Filtri toolbar
- Recurring scheduler server-side
- Optimistic update + reconciliation in `useTasks`

### 5. Dialog custom (P2)

Sostituire `window.confirm()` per delete (reset usa già `window.prompt`, ma resta system dialog). Coerenza dark theme.

### 6. ESLint + Prettier (P3)

30 min di setup, evita stile incoerente man mano che si aggiungono feature.

### 7. Feature UX residue (P2/P4, roadmap, non bloccanti)

- Drag & drop riordinamento manuale
- Campo priority
- Comments / history / audit trail
- CSS `:hover` invece di JS `onMouseEnter`/`onMouseLeave`
- Migrazione progressiva TypeScript

## Decisioni di design non ovvie

- **Waiting↔Status sync simmetrico**: la logica vive sia in `useTasks.js` (frontend ottimistico) sia in `routes/tasks.js` (backend autoritativo). Cambiare la regola in un solo posto causa drift silenzioso.
- **Waiting toggle non aggiorna `updatedAt`**: scelta voluta per non far saltare le righe nell'ordinamento quando si flagga un task.
- **Recurring processing è server-side** dopo refactor recente. Il client `useRecurring` fa solo CRUD template.
- **Seed re-inseribile via `/api/tasks/reset`**: la `SEED_SQL` in `routes/tasks.js` deve restare allineata a `migrations/001_init.sql`. Se modifichi il seed in un posto, modificalo nell'altro.
- **Split tab NBU**: `GROUPS` in `src/data.js` ora contiene 4 elementi (Commvault, Cohesity, Data Domain, NBU - Banche Estere). Niente migrazione runtime perché DB prod era vuoto al momento dello split.
- **HTTPS**: TLS termination lato RP Mauden, la VM resta HTTP puro internamente. Niente cert sul container nginx.

## Workflow concordato con l'utente

- Comunicazione sempre in italiano
- Auto-commit a step verde (un commit = codice + handoff allineati)
- Prefissi commit: `feat:`, `fix:`, `refactor:`, `chore:`
- Identità git: `Pl1n10`
- Mai assumere credenziali/secrets, mai committarli
- Diff preview consigliata per cambi sensibili (auth, schema DB, infra)

## Come verificare lo stato verde della suite

Test suite non ancora esistente. Verifica funzionale manuale:

```bash
# Frontend dev
npm run dev   # localhost:5173, proxy /api → :3000

# Backend dev
cd backend && npm run dev

# Smoke produzione (sulla VM)
docker compose ps              # 3 container Up healthy
curl -sI http://localhost/     # 200
curl -s http://localhost/api/health  # {"status":"ok",...}
curl -s http://localhost/api/tasks | head -c 500  # 12 task seed
```

## File da leggere per riprendere il filo (in ordine)

1. `~/.claude/CLAUDE.md` (global)
2. `./CLAUDE.md` (progetto, sezione "Upgrade TODO" e "Entra ID — Stato e TODO")
3. `./HANDOFF.md` (questo file)
4. `git log --oneline -n 8`
5. `git status`
6. `./backend/src/auth.js` + `./src/auth/` se la sessione è sull'auth Entra
