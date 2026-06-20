/* MyFam API — Cloudflare Worker.
 *
 * Secure, server-enforced auth + roles + a €0,99 Mollie unlock for the full tree.
 * The Mollie secret is read from env.MOLLIE_API_KEY (set via `wrangler secret put`) —
 * it is NEVER in this file or the client bundle.
 *
 * Access model (FREE_RADIUS / paid / admin are config, see wrangler.toml):
 *   admin      → sees & edits the whole tree, manages users
 *   paid user  → sees & edits the whole tree
 *   free user  → only their own node + relatives within FREE_RADIUS hops
 */

let bootstrapped = false;

export default {
  async fetch(req, env, ctx) {
    try {
      if (!bootstrapped) { await bootstrap(env); bootstrapped = true; }
      const url = new URL(req.url);
      if (req.method === "OPTIONS") return cors(env, new Response(null, { status: 204 }));
      const res = await route(req, env, url);
      return cors(env, res);
    } catch (err) {
      return cors(env, json({ error: "server_error", detail: String(err) }, 500));
    }
  },
};

/* ============================ routing ============================ */
async function route(req, env, url) {
  const p = url.pathname.replace(/\/+$/, "");
  const m = req.method;

  if (p === "/api/health") return json({ ok: true });

  if (p === "/api/auth/register" && m === "POST") return register(req, env);
  if (p === "/api/auth/login" && m === "POST") return login(req, env);
  if (p === "/api/auth/logout" && m === "POST") return logout(req, env);
  if (p === "/api/auth/me" && m === "GET") return me(req, env);

  if (p === "/api/tree" && m === "GET") return getTree(req, env);
  if (p === "/api/tree/mutate" && m === "POST") return mutateTree(req, env);
  const personMatch = p.match(/^\/api\/tree\/person\/(\d+)$/);
  if (personMatch && m === "PATCH") return patchPerson(req, env, Number(personMatch[1]));

  if (p === "/api/pay/create" && m === "POST") return payCreate(req, env);
  if (p === "/api/pay/webhook" && m === "POST") return payWebhook(req, env);
  if (p === "/api/pay/status" && m === "GET") return payStatus(req, env);

  if (p === "/api/admin/users" && m === "GET") return adminUsers(req, env);
  const adminUserMatch = p.match(/^\/api\/admin\/users\/(\d+)$/);
  if (adminUserMatch && m === "PATCH") return adminUpdateUser(req, env, Number(adminUserMatch[1]));

  return json({ error: "not_found" }, 404);
}

/* ============================ auth ============================ */
async function register(req, env) {
  const body = await req.json().catch(() => ({}));
  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";
  if (!email || !email.includes("@") || password.length < 8)
    return json({ error: "invalid_input", detail: "email + password (min 8 chars) required" }, 400);
  const exists = await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first();
  if (exists) return json({ error: "email_taken" }, 409);

  // every user gets their own node in the tree
  const person = await env.DB.prepare(
    "INSERT INTO persons (first,last,username,cx,cy) VALUES (?,?,?,0,0) RETURNING id"
  ).bind(body.first || "", body.last || "", slug(email)).first();
  const pw = await hashPassword(password);
  const user = await env.DB.prepare(
    "INSERT INTO users (email,password,role,paid,person_id) VALUES (?,?, 'user', 0, ?) RETURNING id,email,role,paid,person_id"
  ).bind(email, pw, person.id).first();
  // tie the person back to its owner
  await env.DB.prepare("UPDATE persons SET owner_id=? WHERE id=?").bind(user.id, person.id).run();

  const token = await newSession(env, user.id);
  return json({ token, user: publicUser(user) });
}

async function login(req, env) {
  const body = await req.json().catch(() => ({}));
  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";
  const user = await env.DB.prepare("SELECT * FROM users WHERE email=?").bind(email).first();
  if (!user || !(await verifyPassword(password, user.password)))
    return json({ error: "invalid_credentials" }, 401);
  const token = await newSession(env, user.id);
  return json({ token, user: publicUser(user) });
}

async function logout(req, env) {
  const token = bearer(req);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token=?").bind(token).run();
  return json({ ok: true });
}

async function me(req, env) {
  const user = await auth(req, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  return json({ user: publicUser(user) });
}

/* ============================ tree ============================ */
async function getTree(req, env) {
  const user = await auth(req, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  return json(await visibleTree(env, user));
}

// Accepts the output of the client's add flow and persists it, authorizing each
// reference. New nodes use temp ids ("t1", "t2"); existing ids are real numbers.
async function mutateTree(req, env, user) {
  user = user || (await auth(req, env));
  if (!user) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => ({}));
  const newPersons = Array.isArray(body.newPersons) ? body.newPersons : [];
  const parent = body.parent || [], spouse = body.spouse || [], sibling = body.sibling || [];

  const vis = await visibleIdSet(env, user); // null = unrestricted (admin/paid)
  const canTouch = (id) => vis === null || vis.has(id);

  // every existing id referenced by an edge must be visible to the user
  const tmpIds = new Set(newPersons.map((p) => String(p.tmp)));
  const refs = [...parent, ...spouse, ...sibling].flatMap((e) => [e.p, e.c, e.a, e.b]).filter((x) => x != null);
  for (const r of refs) {
    if (tmpIds.has(String(r))) continue; // new node in this batch
    if (!canTouch(Number(r))) return json({ error: "forbidden", detail: `node ${r} not editable` }, 403);
  }

  // insert new persons, map temp -> real id
  const map = {};
  for (const np of newPersons) {
    const row = await env.DB.prepare(
      "INSERT INTO persons (first,last,birth,city,birth_city,email,username,insta,fb,gender,cx,cy,owner_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id"
    ).bind(np.first || "", np.last || "", np.birth || "", np.city || "", np.birthCity || "",
      np.email || "", np.username || "", np.insta || "", np.fb || "", np.gender || "",
      np.cx || 0, np.cy || 0, user.id).first();
    map[String(np.tmp)] = row.id;
  }
  const real = (id) => (tmpIds.has(String(id)) ? map[String(id)] : Number(id));

  const stmts = [];
  for (const e of parent) stmts.push(env.DB.prepare("INSERT INTO edges (kind,a,b) VALUES ('parent',?,?)").bind(real(e.p), real(e.c)));
  for (const e of spouse) stmts.push(env.DB.prepare("INSERT INTO edges (kind,a,b) VALUES ('spouse',?,?)").bind(real(e.a), real(e.b)));
  for (const e of sibling) stmts.push(env.DB.prepare("INSERT INTO edges (kind,a,b) VALUES ('sibling',?,?)").bind(real(e.a), real(e.b)));
  if (stmts.length) await env.DB.batch(stmts);

  return json(await visibleTree(env, user));
}

async function patchPerson(req, env, id) {
  const user = await auth(req, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  const vis = await visibleIdSet(env, user);
  const allowed = vis === null || (vis.has(id) && (user.paid || user.role === "admin" || (await ownsPerson(env, user.id, id))));
  if (!allowed) return json({ error: "forbidden" }, 403);
  const body = await req.json().catch(() => ({}));
  const cols = ["first", "last", "birth", "city", "birth_city", "email", "insta", "fb", "gender", "cx", "cy"];
  const set = [], vals = [];
  for (const c of cols) {
    const key = c === "birth_city" ? "birthCity" : c;
    if (key in body) { set.push(`${c}=?`); vals.push(body[key]); }
  }
  if (!set.length) return json({ ok: true });
  vals.push(id);
  await env.DB.prepare(`UPDATE persons SET ${set.join(",")} WHERE id=?`).bind(...vals).run();
  return json(await visibleTree(env, user));
}

/* ============================ payments (Mollie) ============================ */
async function payCreate(req, env) {
  const user = await auth(req, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  if (user.paid) return json({ error: "already_paid" }, 400);
  if (!env.MOLLIE_API_KEY) return json({ error: "payments_unconfigured" }, 503);

  const payment = await molliePost(env, "/payments", {
    amount: { currency: "EUR", value: env.UNLOCK_PRICE || "0.99" },
    description: "MyFam — unlock the full family tree",
    redirectUrl: `${env.FRONTEND_URL}/?paid=1`,
    webhookUrl: `${env.PUBLIC_API_URL}/api/pay/webhook`,
    metadata: { user_id: String(user.id) },
  });
  if (!payment || !payment.id) return json({ error: "mollie_error", detail: payment }, 502);
  await env.DB.prepare("INSERT INTO payments (id,user_id,status,amount) VALUES (?,?,?,?)")
    .bind(payment.id, user.id, payment.status || "open", env.UNLOCK_PRICE || "0.99").run();
  return json({ checkoutUrl: payment._links?.checkout?.href || null, paymentId: payment.id });
}

// Mollie calls this server-to-server with `id=tr_...`. We re-fetch the payment
// (never trust the webhook body) and flip users.paid only when Mollie says 'paid'.
async function payWebhook(req, env) {
  const form = await req.formData().catch(() => null);
  const id = form && form.get("id");
  if (!id) return new Response("ignored", { status: 200 });
  const payment = await mollieGet(env, `/payments/${id}`);
  if (payment && payment.id) {
    await env.DB.prepare("UPDATE payments SET status=? WHERE id=?").bind(payment.status, payment.id).run();
    if (payment.status === "paid") {
      const uid = payment.metadata && payment.metadata.user_id;
      if (uid) await env.DB.prepare("UPDATE users SET paid=1 WHERE id=?").bind(Number(uid)).run();
    }
  }
  return new Response("ok", { status: 200 });
}

async function payStatus(req, env) {
  const user = await auth(req, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  return json({ paid: !!user.paid });
}

/* ============================ admin ============================ */
async function adminUsers(req, env) {
  const user = await auth(req, env);
  if (!user || user.role !== "admin") return json({ error: "forbidden" }, 403);
  const { results } = await env.DB.prepare(
    "SELECT id,email,role,paid,person_id,created_at FROM users ORDER BY id"
  ).all();
  return json({ users: results });
}

async function adminUpdateUser(req, env, id) {
  const user = await auth(req, env);
  if (!user || user.role !== "admin") return json({ error: "forbidden" }, 403);
  const body = await req.json().catch(() => ({}));
  const set = [], vals = [];
  if (body.role === "admin" || body.role === "user") { set.push("role=?"); vals.push(body.role); }
  if (body.paid === 0 || body.paid === 1) { set.push("paid=?"); vals.push(body.paid); }
  if (!set.length) return json({ error: "nothing_to_update" }, 400);
  vals.push(id);
  await env.DB.prepare(`UPDATE users SET ${set.join(",")} WHERE id=?`).bind(...vals).run();
  return json({ ok: true });
}

/* ============================ visibility ============================ */
async function loadGraph(env) {
  const persons = (await env.DB.prepare("SELECT * FROM persons").all()).results;
  const edges = (await env.DB.prepare("SELECT kind,a,b FROM edges").all()).results;
  return { persons, edges };
}

async function visibleIdSet(env, user) {
  if (user.role === "admin" || user.paid) return null; // unrestricted
  const { edges } = await loadGraph(env);
  const start = user.person_id;
  if (!start) return new Set();
  const radius = Number(env.FREE_RADIUS || "1");
  const adj = {};
  for (const e of edges) { (adj[e.a] = adj[e.a] || []).push(e.b); (adj[e.b] = adj[e.b] || []).push(e.a); }
  const seen = new Map([[start, 0]]); const q = [start];
  while (q.length) {
    const c = q.shift(); const d = seen.get(c);
    if (d >= radius) continue;
    for (const n of adj[c] || []) if (!seen.has(n)) { seen.set(n, d + 1); q.push(n); }
  }
  return new Set(seen.keys());
}

async function visibleTree(env, user) {
  const { persons, edges } = await loadGraph(env);
  const vis = await visibleIdSet(env, user);
  const show = (id) => vis === null || vis.has(id);
  const persons2 = persons.filter((p) => show(p.id)).map((p) => shapePerson(p, user));
  const visEdges = edges.filter((e) => show(e.a) && show(e.b));
  const total = persons.length;
  return {
    persons: persons2,
    parentOf: visEdges.filter((e) => e.kind === "parent").map((e) => ({ p: e.a, c: e.b })),
    spouse: visEdges.filter((e) => e.kind === "spouse").map((e) => ({ a: e.a, b: e.b })),
    sibling: visEdges.filter((e) => e.kind === "sibling").map((e) => ({ a: e.a, b: e.b })),
    meId: user.person_id,
    access: { role: user.role, paid: !!user.paid, visible: persons2.length, total, locked: total - persons2.length },
  };
}

function shapePerson(p, user) {
  return {
    id: p.id, first: p.first, last: p.last, birth: p.birth, city: p.city, birthCity: p.birth_city,
    email: p.email, username: p.username, insta: p.insta, fb: p.fb, gender: p.gender,
    cx: p.cx, cy: p.cy, isYou: p.id === user.person_id,
  };
}

async function ownsPerson(env, userId, personId) {
  const row = await env.DB.prepare("SELECT owner_id FROM persons WHERE id=?").bind(personId).first();
  return row && row.owner_id === userId;
}

/* ============================ bootstrap (admin + seed) ============================ */
async function bootstrap(env) {
  // Seed a starter family the first time so admins/paid users have a tree to see.
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM persons").first();
  if (count && count.n === 0) await seedFamily(env);
  // Create the admin account from env on first run.
  if (env.ADMIN_EMAIL && env.ADMIN_PASSWORD) {
    const existing = await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(env.ADMIN_EMAIL.toLowerCase()).first();
    if (!existing) {
      const person = await env.DB.prepare("INSERT INTO persons (first,last,username) VALUES ('Admin','','admin') RETURNING id").first();
      const pw = await hashPassword(env.ADMIN_PASSWORD);
      await env.DB.prepare("INSERT INTO users (email,password,role,paid,person_id) VALUES (?,?, 'admin', 1, ?)")
        .bind(env.ADMIN_EMAIL.toLowerCase(), pw, person.id).run();
    }
  }
}

async function seedFamily(env) {
  const persons = [
    [1, "Yara", "Hussein", "1994-03-12", "Amsterdam", "Caïro"], [2, "Ahmed", "Hussein", "1965-07-02", "Caïro", "Alexandrië"],
    [3, "Layla", "Mansour", "1968-11-21", "Caïro", ""], [4, "Omar", "Hussein", "1991-01-30", "Rotterdam", "Caïro"],
    [5, "Kamal", "Hussein", "1938-05-09", "Alexandrië", ""], [6, "Fatima", "Saleh", "1942-09-14", "Alexandrië", ""],
    [7, "Tarek", "Hussein", "1962-02-18", "Caïro", ""], [8, "Mohammed", "Hussein", "1990-06-25", "Dubai", "Caïro"],
    [9, "Youssef", "Adel", "1992-08-08", "Amsterdam", ""], [10, "Sara", "Adel", "2020-04-17", "Amsterdam", "Amsterdam"],
  ];
  const coords = { 1: [0, 0], 2: [-210, -210], 3: [210, -210], 4: [-300, 20], 5: [-360, -420], 6: [-150, -420], 7: [-620, -210], 8: [-680, 20], 9: [200, 20], 10: [60, 240] };
  const stmts = persons.map(([id, f, l, b, c, bc]) =>
    env.DB.prepare("INSERT INTO persons (id,first,last,birth,city,birth_city,cx,cy) VALUES (?,?,?,?,?,?,?,?)")
      .bind(id, f, l, b, c, bc, coords[id][0], coords[id][1]));
  const parents = [[2, 1], [3, 1], [2, 4], [3, 4], [5, 2], [6, 2], [5, 7], [6, 7], [7, 8], [1, 10], [9, 10]];
  const spouses = [[2, 3], [5, 6], [1, 9]];
  for (const [a, b] of parents) stmts.push(env.DB.prepare("INSERT INTO edges (kind,a,b) VALUES ('parent',?,?)").bind(a, b));
  for (const [a, b] of spouses) stmts.push(env.DB.prepare("INSERT INTO edges (kind,a,b) VALUES ('spouse',?,?)").bind(a, b));
  await env.DB.batch(stmts);
}

/* ============================ helpers ============================ */
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
function cors(env, res) {
  const h = new Headers(res.headers);
  h.set("Access-Control-Allow-Origin", env.FRONTEND_URL || "*");
  h.set("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type,Authorization");
  h.set("Vary", "Origin");
  return new Response(res.body, { status: res.status, headers: h });
}
function bearer(req) {
  const a = req.headers.get("Authorization") || "";
  return a.startsWith("Bearer ") ? a.slice(7) : null;
}
async function auth(req, env) {
  const token = bearer(req);
  if (!token) return null;
  return env.DB.prepare(
    "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at > datetime('now')"
  ).bind(token).first();
}
async function newSession(env, userId) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const expires = new Date(Date.now() + 30 * 864e5).toISOString().replace("T", " ").slice(0, 19);
  await env.DB.prepare("INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)").bind(token, userId, expires).run();
  return token;
}
function publicUser(u) {
  return { id: u.id, email: u.email, role: u.role, paid: !!u.paid, personId: u.person_id };
}
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24);

// --- password hashing: PBKDF2-SHA256 via Web Crypto ---
async function hashPassword(password, saltHex) {
  const salt = saltHex ? unhex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256);
  return hex(salt) + ":" + hex(new Uint8Array(bits));
}
async function verifyPassword(password, stored) {
  const [saltHex, hashHex] = String(stored).split(":");
  if (!saltHex || !hashHex) return false;
  const recomputed = (await hashPassword(password, saltHex)).split(":")[1];
  return timingSafeEqual(recomputed, hashHex);
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
function hex(buf) { return [...buf].map((b) => b.toString(16).padStart(2, "0")).join(""); }
function unhex(s) { const a = new Uint8Array(s.length / 2); for (let i = 0; i < a.length; i++) a[i] = parseInt(s.substr(i * 2, 2), 16); return a; }

// --- Mollie ---
async function molliePost(env, path, body) {
  const r = await fetch("https://api.mollie.com/v2" + path, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.MOLLIE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}
async function mollieGet(env, path) {
  const r = await fetch("https://api.mollie.com/v2" + path, { headers: { Authorization: `Bearer ${env.MOLLIE_API_KEY}` } });
  return r.json();
}
