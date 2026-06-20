# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

MyFam is a client-side React SPA: an interactive, animated family-tree ("stamboom") visualizer. You sit at the center; you add relatives, drag cards together to form relationships, and explore the family across three views — a 2D SVG canvas, a 3D "4D" generation-ring view (Three.js), and a globe pinning relatives to cities (Three.js). Multilingual (en, nl, de, fr, es, tr, ar — Arabic is RTL).

The app runs in two modes:
- **Local-demo mode** (default): no backend, persistence via `localStorage`, mock "Verify with Facebook". Refresh keeps the tree (was previously stateless — now persisted).
- **Backend mode**: enabled only when `VITE_API_BASE` is set (`.env.local`). Adds login, server-enforced tree visibility, and a €0,99 Mollie unlock.

## Commands

```bash
npm install
npm run dev        # Vite dev server (localhost:5173)
npm run build      # production build → dist/
npm run preview    # serve the built dist/
npm run lint       # eslint . --ext js,jsx
npm run format     # prettier --write .
npm test           # vitest run (run a single test: npx vitest run src/relationships.test.js)
```

Backend (Cloudflare Worker, optional — see `server/README.md`):
```bash
cd server && npm install
wrangler d1 create myfam                                  # paste database_id into wrangler.toml
wrangler d1 execute myfam --remote --file=./schema.sql
wrangler secret put MOLLIE_API_KEY                        # rotated key — never commit
wrangler secret put ADMIN_PASSWORD
wrangler deploy

# Point the frontend at the deployed worker
echo 'VITE_API_BASE=https://myfam-api.YOUR-SUBDOMAIN.workers.dev' > ../.env.local
```

## Architecture

The entire frontend app is one stateful container, `MyFam()` in `src/MyFam.jsx` (~900 lines), plus a handful of extracted modules. There is no router, no global state library — a single component owns all state via `useState`/`useRef` and passes callbacks to controlled child panels.

Key extracted modules:
- `src/relationships.js` — the **pure relationship engine** (kinship labels, `ancestors`, `bfsPath`, `adjacency`, fuzzy `nameMatch`). This is the cleverest, most bug-prone logic; it has unit tests in `src/relationships.test.js`. Touch it with tests.
- `src/i18n.js` — flat key→string dictionaries + `t(key, vars)`, `setLang`, `detectLang`, `isRTL`. **Language is a module-level variable, not React state** — `MyFam` mirrors it into `useState` and re-renders manually.
- `src/worldBorders.js` — ~97 KB country-border polygons, consumed only by the globe view.
- `src/storage.js` — debounced `localStorage` persistence of `persons`/`parentOf`/`spouse`/`sibling`/`meId`.
- `src/ErrorBoundary.jsx` — wraps the app root and each Three.js view (with a "back to 2D" fallback).
- `src/api.js` + `src/auth.jsx` — backend client and auth context/gate, used only in backend mode.

### Data model (in-memory)

```js
person  = { id, isYou?, first, last, birth /*YYYY-MM-DD*/, city, birthCity,
            email, username, insta, fb, phone?, gender /*"m"|"v"*/,
            cx, cy /*world-space coords*/, connector? /*dashed placeholder*/, fbVerified? }
parentOf = [{ p, c }]   // directed: p is parent of c
spouse   = [{ a, b }]   // undirected
sibling  = [{ a, b }]   // undirected
```

"You" is identified by `meId` in state (do **not** reintroduce the old hardcoded `id === 1` coupling). Missing intermediate links are auto-filled with dashed "connector" placeholder nodes.

### The three views (all inside MyFam.jsx)

- **2D** (default): one transformed `<div>` holds a big offset `<svg>` (relationship lines) + absolutely-positioned `<Node>` cards. Pan, node-drag, drag-to-connect, and click-empty-to-add are handled by pointer callbacks distinguishing intent by movement threshold; two-finger pinch-to-zoom is supported. `viewRef`/`personsRef` mirror state into refs so imperative pointer handlers avoid stale closures.
- **4D** (`ThreeView`): BFS assigns each person a generation level vs. "you"; generations are laid out on rings at different heights with orbit camera.
- **map** (`GlobeView`): sphere + country line loops + per-city pins; `CITY_DB` is a small hardcoded gazetteer, unknown cities fall back to hash-of-name → lat/lng (so they land at arbitrary spots).

**Three.js lifecycle note:** scenes are built **once**; only the content group rebuilds on data change so the camera isn't reset. Dispose all geometries/materials/textures on unmount — the old code leaked GPU memory by recreating the whole scene on every edit. Preserve this pattern when editing the 3D views.

### Backend mode (server/)

Cloudflare Worker (`server/src/index.js`) + D1/SQLite (`server/schema.sql`). Roles are **server-enforced**: `admin` (bootstrapped from `ADMIN_EMAIL`/`ADMIN_PASSWORD`) sees the whole tree + user management; `paid` sees the whole tree; `free` sees only their node + relatives within `FREE_RADIUS` hops (default 1) — locked relatives are filtered server-side and never sent to the browser. `paid` flips **only** via a re-verified Mollie webhook, never from the client. Passwords are PBKDF2-SHA256; sessions are opaque bearer tokens in D1 (stored in `localStorage` client-side). The Mollie key is set via `wrangler secret put` and is never in the repo or client bundle.

## Conventions & gotchas

- JavaScript + JSX only (no TypeScript). Function components + hooks.
- `base: "./"` in `vite.config.js` for relative-path hosting — the built app must be served over HTTP, not `file://`.
- `archive/` holds historical duplicate copies of the source and zips; it is gitignored. The canonical source is `src/`. Don't edit or rely on `archive/`.
- `CODEBASE_OVERVIEW.md` is a deeper orientation + roadmap doc (code-health observations, prioritized improvements). Consult it for context on known issues and open follow-ups (TypeScript adoption, react-three-fiber migration, bundle code-splitting, GDPR/privacy before persisting real PII).
- This stores family PII including minors. The audience is EU. Be deliberate about privacy before persisting real data in backend mode.
