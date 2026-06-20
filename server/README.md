# MyFam API (Cloudflare Worker)

Secure backend for MyFam: email/password auth, roles (admin/user), server-enforced
tree visibility, and a real **€0,99 Mollie** unlock for the full tree.

> **The Mollie secret is never in this repo.** You set it with `wrangler secret put`.
> The key you shared in chat is exposed — **revoke/rotate it in the Mollie dashboard first.**

## What enforces what

| Who | Sees / edits |
|-----|--------------|
| **admin** | the whole tree + manages users (`/api/admin/users`) |
| **paid user** (after €0,99) | the whole tree |
| **free user** | only their own node + relatives within `FREE_RADIUS` hops (default 1) |

`paid` is flipped **only** by a Mollie webhook that we re-verify server-side — it can't be set from the browser.

## Prerequisites
- A [Cloudflare](https://dash.cloudflare.com) account and `npm i -g wrangler` (or use `npx wrangler`).
- A [Mollie](https://mollie.com) account + a **rotated** API key (`test_…` to start, `live_…` for production).

## Deploy

```bash
cd server
npm install

# 1) Create the D1 database, then paste the printed database_id into wrangler.toml
wrangler d1 create myfam

# 2) Create the tables (remote = the deployed DB)
wrangler d1 execute myfam --remote --file=./schema.sql

# 3) Set secrets (NEVER commit these)
wrangler secret put MOLLIE_API_KEY     # your rotated Mollie key
wrangler secret put ADMIN_PASSWORD     # initial admin password — change after first login

# 4) Edit wrangler.toml [vars]: set FRONTEND_URL, PUBLIC_API_URL, ADMIN_EMAIL
# 5) Ship it
wrangler deploy
```

On first request the Worker bootstraps: it seeds a starter family and creates the admin
account from `ADMIN_EMAIL` + `ADMIN_PASSWORD`.

## Point the frontend at it
In the repo root, set the API base and build the SPA:

```bash
echo 'VITE_API_BASE=https://myfam-api.YOUR-SUBDOMAIN.workers.dev' > .env.local
npm run build
```

Without `VITE_API_BASE`, the frontend runs in its original **local-demo mode** (no login, no payments).

## Test the payment flow
- Use a **Mollie test key** first — Mollie shows a fake checkout where you pick "paid".
- The webhook (`/api/pay/webhook`) must be publicly reachable — it works once deployed
  (it will **not** fire against `localhost`). Confirm by hitting `GET /api/pay/status`
  after returning from checkout, or reload the app.

## Endpoints
```
POST /api/auth/register   { email, password, first?, last? } -> { token, user }
POST /api/auth/login      { email, password }                -> { token, user }
POST /api/auth/logout
GET  /api/auth/me                                            -> { user }
GET  /api/tree                                               -> access-filtered { persons, parentOf, spouse, sibling, meId, access }
POST /api/tree/mutate     { newPersons[], parent[], spouse[], sibling[] }
PATCH/api/tree/person/:id { ...fields }
POST /api/pay/create                                         -> { checkoutUrl }
POST /api/pay/webhook     (Mollie -> us; re-verified)
GET  /api/pay/status                                         -> { paid }
GET  /api/admin/users                 (admin)               -> { users }
PATCH/api/admin/users/:id { role?, paid? }   (admin)
```

## Security notes
- Passwords: PBKDF2-SHA256 (100k iterations, per-user salt), constant-time compare.
- Sessions: opaque random bearer tokens in D1, 30-day expiry, revoked on logout.
- Set `FRONTEND_URL` to your real origin so CORS isn't a wildcard in production.
- Bearer tokens live in `localStorage` on the client (standard SPA trade-off vs. XSS) — keep the app XSS-clean.
