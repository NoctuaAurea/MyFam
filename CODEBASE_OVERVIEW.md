# MyFam — Codebase Overview

> Orientation document + stability roadmap.
> Written 2026-06-20 from a full read of the source. Line references point at `MyFam.jsx` unless noted.
>
> **Update (2026-06-20):** the project is now under git, and the P0 foundations + top runtime fixes from §11/§13 have been applied and committed — see the checklist in §13 for exactly what changed and what's still open. Line numbers below reflect the *original* read and may be off by a few lines after the hardening edits.

---

## 1. TL;DR

**MyFam** is a client-side React single-page app: an interactive, animated **family-tree ("stamboom") visualizer**. You see yourself at the center, add relatives, drag cards together to create relationships, and explore the family in three views — a 2D canvas, a 3D "4D" generation-ring, and a globe that pins relatives to their cities. It is multilingual (7 languages incl. RTL Arabic).

It is currently a **high-fidelity prototype/demo**: everything runs in the browser, there is **no backend and no persistence** (a page refresh resets the tree to the hardcoded seed family), and the "Verify with Facebook" flow is a mock. The code is clean and dense but lives almost entirely in **one 898-line file**.

---

## 2. What it is (product)

- **Core idea:** "discover how you're connected." Each user is the gold node in the middle of their own tree.
- **Add family** by relationship kind (grandparent, parent, uncle/aunt, sibling, partner, cousin, child, grandchild). Missing intermediate links are auto-filled with dashed **"connector"** placeholder nodes.
- **Drag-to-connect:** drag a loose card onto a relative; position decides the relation (above = parent, below = child, beside = partner).
- **Relationship finder:** search a name/username and the app computes the kinship label ("first cousins", "uncle/aunt", …) and highlights the shortest path through the tree.
- **Fuzzy matching** tuned for transliteration (e.g. Arabic→Latin name variants) suggests "does this person already exist?" to merge duplicates.
- **Three views:** `2D` (SVG canvas), `4D` (Three.js 3D), `map` (Three.js globe).
- **Sharing / invites:** share link (`myfam.app/u/<username>`), WhatsApp/Instagram share, email invite toast — all simulated client-side.
- **PWA:** manifest + icons + iOS web-app meta; installable, portrait, standalone.

---

## 3. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| UI | **React 18.3** (`^18.3.1`) | Function components + hooks only |
| Build | **Vite 5.4** + `@vitejs/plugin-react` | `base: "./"` for relative-path hosting |
| 3D | **three** `^0.184.0` | Globe + 3D tree, hand-rolled (no `@react-three/fiber`) |
| Icons | **lucide-react** `0.383.0` | |
| Images | **sharp** `^0.35.2` | ⚠️ Native Node lib — used to generate icons, **wrongly listed as a runtime dependency** |
| Language | **JavaScript (JSX)** | No TypeScript |
| State | React `useState` / `useRef` | No Redux/Zustand/Context |
| Routing | none | Single screen |
| Backend | none | No API, DB, or auth |
| Tests | none | No test runner configured |
| Lint/format | none | No ESLint/Prettier config present |

---

## 4. Repository layout (and a warning about duplication)

The working directory contains **several copies of the same code** plus zipped bundles. This is the biggest "where is the truth?" hazard.

```
MyFam/
├── MyFam.jsx              # top-level copy (898 lines) — the app
├── i18n.js                # top-level copy (285 lines) — translations
├── worldBorders.js        # top-level copy (~97 KB, 1 line) — border polygons
├── myfam-preview.html     # 876 KB self-contained prebuilt preview
├── files/                 # a SECOND copy of all of the above + the zips
│   ├── MyFam.jsx
│   ├── i18n.js
│   ├── worldBorders.js
│   ├── myfam-preview.html
│   ├── myfam-source.zip
│   └── myfam-dist.zip
├── files.zip              # zip of the loose files
├── myfam-source.zip       # ★ THE REAL, BUILDABLE PROJECT (see below)
└── myfam-dist.zip         # prebuilt production output (assets/index-*.js)
```

### ★ The real project is inside `myfam-source.zip`

The loose `.jsx`/`.js` files at the top level are **extracts**; the only complete, runnable project is in `myfam-source.zip`:

```
myfam-source/
├── index.html                 # Vite entry, PWA meta, mounts #root
├── vite.config.js             # react plugin, base: "./"
├── package.json               # deps + dev/build/preview scripts
├── package-lock.json
├── .gitignore                 # node_modules, dist
├── src/
│   ├── main.jsx               # React root (StrictMode) → <MyFam/>
│   ├── MyFam.jsx              # the whole app
│   ├── i18n.js
│   └── worldBorders.js
└── public/
    ├── manifest.webmanifest
    ├── icon-192.png
    ├── icon-512.png
    └── apple-touch-icon.png
```

> **Recommendation up front:** unzip `myfam-source.zip` to be the single source of truth, `git init` it, and delete (or archive) the duplicate loose files. See §11.

---

## 5. How to run / build

From an unzipped `myfam-source/`:

```bash
npm install
npm run dev       # Vite dev server
npm run build     # → dist/
npm run preview   # serve the built dist/
```

`myfam-dist.zip` already contains a built version (`assets/index-*.js`, `index.html`, icons) — open via a static server, not `file://` (ES module + relative paths).
`myfam-preview.html` is a single-file prebuilt preview you can open directly.

---

## 6. Architecture at a glance

```
index.html
  └─ src/main.jsx  (createRoot + StrictMode)
       └─ MyFam()                         ← single stateful container
            ├─ state: persons / parentOf / spouse / sibling
            │         view(pan,zoom) / selectedId / panel / toast / mode / lang …
            ├─ relationship engine        ← pure functions over the edge lists
            ├─ pointer system             ← pan, node-drag, drag-to-connect, click-to-add
            │
            ├─ <header>  mode switch (2d/4d/map), zoom, lang, connect, share
            ├─ view "2d"  → inline SVG (lines) + absolutely-positioned <Node/> cards
            ├─ view "4d"  → <ThreeView/>     (Three.js generation rings)
            ├─ view "map" → <GlobeView/>     (Three.js globe + city flags + arcs)
            │
            └─ overlays: <DetailCard/> <AddPanel/> <FreeAddPanel/>
                         <ConnectPanel/> <SharePanel/> <VerifyModal/>
                         <Toast/> <IntroLoader/>
```

Everything above lives in `MyFam.jsx`. `i18n.js` and `worldBorders.js` are the only other code modules.

---

## 7. File-by-file

### `src/MyFam.jsx` (898 lines) — the entire application
One default-export container `MyFam()` plus ~15 helper components and a pile of module-level helpers. Rough map:

| Lines | Section |
|---|---|
| 19–40 | Design tokens (`T` colors), font stacks, CSS keyframes string |
| 42–62 | Helpers: `normalize`, `lev` (Levenshtein), `nameMatch`, `fullName`, `ageFrom`, `initials`, `colorFor` |
| 64–87 | **Seed data**: `seedPersons`, `seedParent`, `seedSpouse`; `edgePath` (SVG path builder) |
| 89–137 | `MyFam()` state, refs, fonts/intro timing, `screenToWorld`, `centerOn` |
| 139–144 | Zoom/wheel |
| 146–174 | **Relationship engine**: `parentsOf`, `hasEdge`, `ancestors`, `adjacency`, `bfsPath`, `relationship` |
| 176–214 | Add flows: `placeNear`, `newPersonFromForm`, `addMember`, `addFree` |
| 216–262 | **Pointer system**: node-drag, drag-preview, pan, click-to-add |
| 264–272 | `connectTo` (search + relationship + highlight path) |
| 274–378 | Render: header, 2D canvas (SVG + nodes), view switch, overlays |
| 382–504 | `GlobeView` (Three.js globe) + `CITY_DB`/`cityGeo` |
| 506–607 | `ThreeView` (Three.js 3D rings) |
| 609–634 | `IntroLoader` (animated growing-tree splash) |
| 636–897 | Presentational components: `Logo`, `IconBtn`, `Node`, `Field`, `DetailCard`, `PersonFields`, `AddPanel`, `FreeAddPanel`, `ConnectPanel`, `SharePanel`, `VerifyModal`, `Toast`, `Modal`, `Input`, `Tile` + shared style objects |

### `src/i18n.js` (285 lines)
Flat key→string dictionaries for **en, nl, de, fr, es, tr, ar**. Exports `t(key, vars)` (with `{var}` interpolation and English fallback), `setLang`, `getLang`, `detectLang` (from `navigator.language`), `isRTL` (true for `ar`), and `LANGS` (the picker list). Note: language is a **module-level variable**, not React state — `MyFam` mirrors it into `useState` and re-renders manually on change.

### `src/worldBorders.js` (~97 KB)
`export default [[[lng,lat], …], …]` — a flat array of simplified country-border rings. Consumed only by `GlobeView` to draw `THREE.LineLoop` outlines.

### `src/main.jsx`, `index.html`, `public/*`, `vite.config.js`
Standard Vite bootstrap + PWA assets (see §4).

---

## 8. Data model (in-memory only)

State lives in `MyFam` via `useState`. There is **no schema, no validation, no persistence.**

```js
person = {
  id, isYou?, first, last,
  birth,            // "YYYY-MM-DD" string
  city, birthCity,
  email, username, insta, fb, phone?,
  gender,           // "m" | "v"
  cx, cy,           // world-space canvas coordinates (also seed layout)
  connector?,       // true = dashed placeholder node
  fbVerified?       // set true by the mock FB verify
}
```

Relationships are three separate edge lists (graph stored as adjacency-by-arrays):

```js
parentOf = [{ p, c }]   // p is parent of c   (directed)
spouse   = [{ a, b }]   // undirected
sibling  = [{ a, b }]   // undirected
```

- **"You"** is hardcoded as **`id === 1`** throughout (`me = byId(1)` at 114; `youId={1}` props; `p.id !== 1` filters at 266–267). Coupled to the seed.
- **Next id** = `Math.max(0, ...persons.map(p => p.id)) + 1`, computed independently in `addMember` (184) and `addFree` (210).

---

## 9. Core systems

### State & data flow
Single container owns all state; child panels are controlled via callbacks (`onSubmit`, `onConnect`, `onClose`). `viewRef`/`personsRef` mirror state into refs (110–111) so the imperative pointer handlers read fresh values without stale closures.

### 2D canvas (the default `2d` view, 322–359)
A single transformed `<div>` (`translate + scale` from `view`) holds:
- one big `<svg>` (offset by `SVG_OFF = 2600` to allow negative coords) drawing relationship `lines` (parent edges curved, spouse edges dashed), plus an animated "draw-in" on first reveal;
- absolutely-positioned `<Node>` cards.

Pan, node-drag, drag-to-connect, and click-empty-space-to-add are all handled by three pointer callbacks on the container (229–262), distinguishing pan vs. node-drag vs. click by movement threshold.

### Relationship engine (146–174) — the clever core
Pure functions over the edge lists:
- `ancestors(id)` — BFS upward, mapping each ancestor to its distance.
- `adjacency()` + `bfsPath(src,dst)` — undirected shortest path (used to highlight the chain).
- `relationship(a,b)` — finds the **lowest common ancestor** via ancestor-distance intersection, then maps `(distanceA, distanceB)` to a localized label (siblings, uncle/aunt, first cousins, cousins-degree-n, or "no blood relation"). Spouse/sibling are special-cased first.

### Fuzzy name matching (42–57)
`normalize` strips accents and applies transliteration collapses (`ou/oe→u`, `kh/ch→k`, `ph→f`, `y→i`, `w→v`, `q→k`, de-doubling) → `lev` Levenshtein with threshold ≤1 → `nameMatch`. Powers duplicate suggestions in `AddPanel` (742) and search in `connectTo`.

### `4D` view — `ThreeView` (506–607)
Assigns each person a **generation level** relative to "you" via BFS over all edge types, lays each generation out on a ring at a different height, draws spheres + canvas-texture name labels + colored relationship lines, with an orbit camera (drag to rotate, wheel to zoom, click to select, auto-spin after idle).

### `map` view — `GlobeView` (382–504)
Sphere + atmosphere + country `LineLoop`s from `worldBorders`. People are grouped by city; each city gets a pin/flag/dot. `CITY_DB` (383) is a **small hardcoded gazetteer** (~30 cities); unknown cities fall back to a **hash-of-name → lat/lng** (392–396), so they land at arbitrary positions. Relationship lines become great-circle-ish quadratic arcs between cities. HTML labels are overlaid and de-collided each frame.

### i18n
See §7. Device-language detection with English fallback; RTL handled by `dir` on the root (281).

---

## 10. Code-health observations (verified)

These are confirmed against the source, with locations:

1. **No persistence.** No `localStorage`/`fetch`/backend anywhere — refresh = back to seed. (verified: none found)
2. **Three.js scenes rebuild on every edit.** Both `ThreeView` and `GlobeView` effects depend on `[persons, parentOf, spouse, sibling, youId]` (485, 596), so **any** add/drag tears down and recreates the entire scene — and resets the camera orbit.
3. **Three.js GPU resources leak.** Cleanup only calls `renderer.dispose()` (484, 595); the many `Geometry`/`Material`/`Texture` objects — especially per-label `CanvasTexture` sprites and per-border line loops — are never disposed. Combined with #2, **every edit leaks a full scene's worth of GPU memory.** This is the most serious runtime stability bug.
4. **No error boundary.** A throw in any view (e.g. WebGL context loss) blanks the whole app. (verified: none found)
5. **"You" is hardcoded to `id === 1`** (114, 266–267, 366) — fragile coupling to seed data.
6. **`sharp` is a runtime dependency** (`package.json`) though it's a native Node image lib that can't run in the browser — install bloat and a portability/`npm ci` risk.
7. **Dead code:** `ord` helper defined at 155, never used.
8. **`dragging`/`cursor` read a mutated ref during render** (`nodeDrag.current`, 319/341). It happens to work because `setPersons` re-renders during drag, but reading refs in render is not reactive and is fragile.
9. **Accessibility gaps:** interactive elements are `div`s with pointer handlers; no keyboard navigation, no focus trap in modals, no ARIA, and canvas/SVG content is invisible to screen readers.
10. **No input validation.** Form fields flow straight into state and into `href`s (e.g. `instagram.com/${insta}`); fine for a demo, not for untrusted input.
11. **Timer-based intro** (`setTimeout` 2000/3000ms, 123–124) is independent of real load — desyncs on slow devices.
12. **Mobile:** Pointer Events + `touchAction:none` are correct, but there's **no pinch-to-zoom** (only wheel), so zoom is awkward on touch.

---

## 11. Stability improvements — prioritized

Effort: S = hours, M = a day or two, L = multi-day, XL = week+.

### P0 — Foundations (do these regardless of direction)
| # | Improvement | Why | Effort |
|---|---|---|---|
| 1 | **Single source of truth + `git init`.** Unzip `myfam-source.zip`, make it the repo, delete/archive the duplicate loose files & zips. | Eliminates drift; nothing is version-controlled today. | S |
| 2 | **Add a top-level `<ErrorBoundary>`** around the view switch (esp. the Three.js views). | One WebGL/render throw currently blanks the app. | S |
| 3 | **Move `sharp` to `devDependencies`** (or out entirely). | It's a build-time native lib; shouldn't ship as a runtime dep. | S |
| 4 | **Add ESLint + Prettier** (`eslint-plugin-react-hooks` especially). | Would have caught the dead code, ref-in-render, and effect-deps issues. | S |

### P1 — Make it actually usable
| # | Improvement | Why | Effort |
|---|---|---|---|
| 5 | **Persist the tree** (start with `localStorage`, debounced; later a backend). | Refresh currently wipes all work — the #1 functional gap for a family-tree app. | M |
| 6 | **Fix the Three.js rebuild + leak.** Build the scene once; update it incrementally (or memoize and diff); dispose all geometries/materials/textures on unmount. | Stops the GPU memory leak and the camera-reset-on-every-edit. | M |
| 7 | **Decouple "you" from `id === 1`.** Carry a `meId`/`rootId` in state. | Required before persistence or multi-user. | S |
| 8 | **Add pinch-to-zoom** for the 2D canvas. | Core interaction is clumsy on touch despite being a PWA. | M |

### P2 — Maintainability
| # | Improvement | Why | Effort |
|---|---|---|---|
| 9 | **Split the 898-line monolith** into `state/`, `relationships/`, `views/{Canvas2D,ThreeView,GlobeView}`, `components/`, `data/seed`. | Testability + parallel work + smaller diffs. | M |
| 10 | **Adopt TypeScript** (at least typed `Person`/edge models + the relationship engine). | Catches shape bugs the loose model invites. | L |
| 11 | **Unit-test the relationship engine & fuzzy matcher** (`relationship`, `bfsPath`, `ancestors`, `nameMatch`). They're pure → cheap, high-value tests. | Protects the cleverest, most bug-prone logic during refactors. | M |
| 12 | **Consider `@react-three/fiber`** for the 3D/globe views, or at least factor a shared Three lifecycle hook. | Removes hand-rolled imperative lifecycle that causes #6. | L |
| 13 | **Externalize the gazetteer / geocode** instead of hashing unknown cities to random coordinates. | Map currently places unknown cities at meaningless spots. | M |

### P3 — Productization (only if going past demo)
| # | Improvement | Why | Effort |
|---|---|---|---|
| 14 | **Backend + auth + real DB** (people/edges per account; sharing links resolve server-side). | Needed for real multi-device, multi-user, real invites. | XL |
| 15 | **Real OAuth** (the FB verify is a mock modal today). | Trust/verification claims must be real server-side. | L |
| 16 | **Privacy / GDPR.** This stores **family PII** (names, birthdates, emails, cities, social handles) and the audience is clearly EU. Need consent, data-subject rights, retention, and consent from people *added by others* (the invite flow adds non-users). | Legal/operational stability — not optional once real data persists. | L |
| 17 | **Rate-limit / validate** all inputs and share/search endpoints. | Standard once there's a server. | M |

---

## 12. Recommended route

There's a fork in the road, and the right first steps are the same on both paths.

**Step 1 — Stabilize the foundation now (½–1 day): P0 #1–4 + P1 #5–7.**
`git init` on the unzipped source, error boundary, fix the `sharp` dep, add ESLint, add `localStorage` persistence, and fix the Three.js rebuild/leak. This turns a brittle demo into something that survives a refresh and won't leak memory while someone explores — the highest impact-per-hour work available.

**Step 2 — Decide what MyFam is:**

- **Track A — Keep it a polished prototype/showcase.** Stop after Step 1, then do P2 #9 + #11 (split the file, test the relationship engine) so the demo stays easy to evolve. Low cost, keeps it impressive and maintainable. This matches what the code is *today* (mock OAuth, seed data, "demo" labels).

- **Track B — Build it into a real product.** Do P2 in full (TypeScript + module split + tests), then commit to P3. **Be deliberate about #16 (privacy/GDPR) before you persist anyone's real data** — a family-tree app is unusually privacy-sensitive because users add *other people's* PII, including minors (the seed already contains a child born 2020). Treat that as a gating requirement, not a late add-on.

**Recommendation:** Do **Step 1 immediately**. Then, unless there's a committed product plan, take **Track A** — harden and modularize the prototype — and only move to Track B once the concept is validated, entering it through the privacy/auth work rather than more features.

---

## 13. Quick-wins checklist

**Done in the 2026-06-20 hardening commit:**
- [x] Make `myfam-source.zip` the canonical project; `git init` (branch `main`); duplicates moved to `archive/` (preserved, not deleted; gitignored).
- [x] Move `sharp` to `devDependencies`.
- [x] Add `<ErrorBoundary>` (`src/ErrorBoundary.jsx`) — wraps the app root *and* each Three.js view (with a "back to 2D" fallback).
- [x] Add ESLint + Prettier config + `lint`/`format` scripts. *(Run `npm install` to activate.)*
- [x] Delete the unused `ord` helper.
- [x] Persist `persons`/`parentOf`/`spouse`/`sibling`/`meId` to `localStorage` (`src/storage.js`, debounced).
- [x] Dispose Three.js geometries/materials/textures on unmount in both 3D views — stops the GPU leak.
- [x] Replace the `id === 1` coupling with a `meId` in state.

**Still open:**
- [ ] Build each Three.js scene **once** and update it incrementally. The leak is fixed, but the scene still tears down and **resets the camera** on every data change (deps `[persons, parentOf, spouse, sibling, meId]`).
- [ ] Add pinch-to-zoom on the 2D canvas.
- [ ] Extract + unit-test `relationship`, `bfsPath`, `nameMatch` (needs a test runner).
- [ ] **Verify the build:** no Node toolchain was available in the setup environment, so `npm install && npm run build` has **not** been run. Do this before relying on the changes.
```
