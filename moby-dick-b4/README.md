# 🐋 Moby Dick B4

A lightweight, static task board for tracking backup-related work items across **Commvault**, **Cohesity**, and **NetBackup + Data Domain**.

Built with **React 18 + Vite**. Purely static — no backend, no database. Data lives in `localStorage`.

---

## Features

- **Three tab groups**: Commvault, Cohesity, NetBackup + Data Domain
- **Inline editing**: click any cell to edit (text, textarea, dropdown, checkbox)
- **Add / Delete rows**: green "+ New Task" button, ✕ delete with confirmation
- **Search**: real-time filter by reference or description (case-insensitive) with match highlighting
- **Filters**: dropdown filters for Status and Owner, with "✕ Clear" button and match counter
- **Waiting sync logic**:
  - Status → Waiting auto-checks the ⏳ flag
  - Status → anything else auto-unchecks ⏳
  - Unchecking ⏳ when status is Waiting → changes status to In Progress
  - Checking ⏳ manually → sets status to Waiting
- **localStorage persistence**: data survives page reloads and browser restarts
- **Seed data**: 2 sample tasks per group, loaded only on first visit (empty localStorage)
- **Reset button**: restores seed data with one click
- **Sort**: always sorted by "Last updated" descending

## Task Data Model

```js
{
  id: string,          // UUID
  group: string,       // "Commvault" | "Cohesity" | "NetBackup + Data Domain"
  reference: string,   // Incident number or email subject
  description: string, // Multiline problem description
  status: string,      // "New" | "In Progress" | "Waiting" | "Resolved" | "Closed"
  owner: string,       // "Bob" | "Erica" | "Walker"
  waiting: boolean,    // Waiting flag (synced with status)
  updatedAt: string,   // ISO 8601 timestamp (auto-updated on edit)
}
```

---

## Local Development

```bash
# Install dependencies
npm install

# Start dev server (http://localhost:5173)
npm run dev
```

## Build

```bash
# Production build → ./dist
npm run build

# Preview the production build locally
npm run preview
```

## Deploy to Netlify

### Option A: Git-connected (recommended)

1. Push the repo to GitHub/GitLab
2. In Netlify → "New site from Git"
3. Build command: `npm run build`
4. Publish directory: `dist`
5. Done — auto-deploys on every push

### Option B: Manual drag & drop

1. Run `npm run build`
2. Drag the `dist/` folder into [Netlify Drop](https://app.netlify.com/drop)

The included `netlify.toml` handles SPA routing automatically.

---

## Data Storage

All tasks are stored in the browser's `localStorage` under the key:

```
moby-dick-b4-tasks
```

### Reset data via UI

Click the **↺ Reset** button in the top-right corner of the header.

### Reset data via console

```js
localStorage.removeItem('moby-dick-b4-tasks');
location.reload();
```

### View raw data

```js
JSON.parse(localStorage.getItem('moby-dick-b4-tasks'));
```

---

## Authentication (Placeholder)

Auth is **OFF** in demo mode (shown by the yellow badge in the header).

To add **Microsoft Entra ID** (Azure AD) authentication:

1. Install `@azure/msal-browser` and `@azure/msal-react`
2. Create an Azure App Registration in the Azure Portal
3. Wrap the app with `<MsalProvider>` in `main.jsx`
4. Add a login guard component
5. Remove the "Auth: OFF" badge and show the logged-in user

The app structure is already component-based, making this integration straightforward.

---

## Tech Stack

| Layer     | Tech               |
|-----------|--------------------|
| Framework | React 18           |
| Bundler   | Vite 6             |
| Styling   | CSS-in-JS (inline) |
| Fonts     | JetBrains Mono + IBM Plex Sans (Google Fonts) |
| Storage   | localStorage       |
| Hosting   | Netlify (static)   |

## Project Structure

```
moby-dick-b4/
├── index.html          # Entry point
├── netlify.toml        # Netlify SPA routing
├── package.json
├── vite.config.js
├── src/
│   ├── main.jsx        # React mount
│   ├── App.jsx         # Main app (all components)
│   ├── data.js         # Seed data, constants
│   └── index.css       # Global reset
└── dist/               # Build output (git-ignored)
```
