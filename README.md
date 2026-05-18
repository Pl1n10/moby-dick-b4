# KanbanOps

Task board for the Mauden backup team. Tracks work items across **Commvault**, **Cohesity**, **Data Domain** and **NBU - Banche Estere**.

> Repo / deploy path / Docker image names still use the legacy slug `moby-dick-b4` (renaming would break the GitHub remote and `/opt/moby-dick-b4/` on the prod VM). The product name as shown to users is **KanbanOps**.

Live at **https://kanbanops.mauden.com** (Mauden tenant SSO required).

## Stack

| Layer     | Tech |
|-----------|------|
| Frontend  | React 18.3 + Vite 6.4 (CSS-in-JS, no external CSS framework) |
| Backend   | Express 4 + pg (Node 20) |
| Database  | PostgreSQL 16 |
| Auth      | Microsoft Entra ID (MSAL.js + JWKS validation) |
| Deploy    | Docker Compose: `db` → `api` → `nginx` |
| Fonts     | JetBrains Mono + IBM Plex Sans (Google Fonts) |
| Locale    | Italian (`it-IT`) for date formatting |

## Local development

Backend (Express on `:3000`) + frontend (Vite dev server on `:5173`, proxies `/api/*` to the backend). PostgreSQL is required — either via Docker Compose or a local instance.

```bash
# 1. Database
docker compose up -d db

# 2. Backend
cd backend && npm install && npm run dev

# 3. Frontend (in another shell, from repo root)
npm install && npm run dev
```

By default the app runs in **demo mode** (`AUTH_ENABLED=false` in `backend/.env`, `VITE_AUTH_ENABLED=false` in `.env.local`): everyone is admin, no login required. See `backend/.env.example` and `.env.example` for the Entra variables when testing auth locally.

## Production deploy

3 Docker Compose services behind the Mauden reverse proxy:

```
nginx:80  →  /api/*  →  api:3000 (Express)  →  db:5432 (PostgreSQL 16)
          →  /*      →  static React build
```

Apply changes on the VM (`/opt/moby-dick-b4/`):

```bash
git pull
docker-compose build
docker ps -aq --filter name=moby-api --filter name=moby-nginx | xargs -r docker rm -f
docker-compose up -d
```

⚠️ Do **not** use `docker-compose up -d --build` on the VM. The pinned `docker-compose v1.29.2` crashes with `KeyError: 'ContainerConfig'` on any recreate after rebuild. The `build → rm → up` sequence above is the documented workaround. Details in `HANDOFF.md`.

DB migrations are idempotent and re-applied at every boot of `moby-api`. Adding a migration = drop a new `.sql` in `backend/migrations/`.

## Permission model

Single-tenant Entra (`@mauden` only). Anyone who logs in is auto-registered as a `viewer` with empty operator scope. Admins promote / assign scope via the in-app users panel.

| Role | Write access |
|------|--------------|
| `admin` | Everywhere — tasks, subtasks, recurring, reset, user management |
| `viewer` + `operator_groups=['Commvault', …]` | Tasks + subtasks in the listed pillars only (read-only elsewhere). Recurring stays admin-only for now. |
| `viewer` + `operator_groups=[]` | Read-only globally |

Enforcement is server-side (`backend/src/auth.js`: `loadUserContext` + `canWrite` + `requireWriteAccess`); the UI mirrors it via `useCanWrite()` in `src/auth/UserInfoProvider.jsx`.

## Project structure

See `CLAUDE.md` for the annotated tree. High-level:

```
├── src/                # React frontend (App.jsx, components/, hooks/, auth/)
├── backend/            # Express API (routes/, migrations/, auth.js, recurring-processor.js)
├── nginx/              # Multi-stage Dockerfile + nginx.conf (SPA fallback + /api proxy)
└── docker-compose.yml  # db + api + nginx orchestration
```

## Conventions

- No TypeScript, no tests, no linting (known tech debt — tracked in `CLAUDE.md`)
- All styling is inline (CSS-in-JS objects in `src/styles.js`)
- Sorting is always `updatedAt` desc
- Commit prefixes: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`
- Italian for user-facing UI strings; English for code, commits and docs
- `VALID_GROUPS` in `backend/src/auth.js` is the single source of truth for pillar names — keep it in sync with the `tasks.group_name` CHECK constraint and the `GROUPS` array in `src/data.js`

## Further reading

- `CLAUDE.md` — full project guide (architecture, API surface, design system, roadmap)
- `HANDOFF.md` — session-by-session change log, pending steps, gotchas (docker-compose v1, etc.)
