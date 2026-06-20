-- MyFam backend — D1 (SQLite) schema.
-- Apply with:  wrangler d1 execute myfam --file=./schema.sql   (add --remote for prod)

-- ---------- users & auth ----------
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT UNIQUE NOT NULL,
  password   TEXT NOT NULL,                 -- "salt:hash" (PBKDF2-SHA256, hex) — never plaintext
  role       TEXT NOT NULL DEFAULT 'user',  -- 'admin' | 'user'
  paid       INTEGER NOT NULL DEFAULT 0,    -- 0 | 1  (set ONLY by a verified Mollie payment)
  person_id  INTEGER,                       -- this user's own node in the tree
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,             -- opaque random bearer token
  user_id    INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ---------- family tree ----------
CREATE TABLE IF NOT EXISTS persons (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  first TEXT, last TEXT, birth TEXT, city TEXT, birth_city TEXT,
  email TEXT, username TEXT, insta TEXT, fb TEXT, gender TEXT,
  cx REAL DEFAULT 0, cy REAL DEFAULT 0,
  owner_id   INTEGER,                       -- user who created this node (for edit authz)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One row per relationship. kind='parent' uses a=parent, b=child; spouse/sibling are unordered.
CREATE TABLE IF NOT EXISTS edges (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,                       -- 'parent' | 'spouse' | 'sibling'
  a    INTEGER NOT NULL,
  b    INTEGER NOT NULL,
  FOREIGN KEY (a) REFERENCES persons(id) ON DELETE CASCADE,
  FOREIGN KEY (b) REFERENCES persons(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_edges_a ON edges(a);
CREATE INDEX IF NOT EXISTS idx_edges_b ON edges(b);

-- ---------- payments (audit trail; users.paid is the enforced flag) ----------
CREATE TABLE IF NOT EXISTS payments (
  id         TEXT PRIMARY KEY,             -- Mollie payment id (tr_...)
  user_id    INTEGER NOT NULL,
  status     TEXT NOT NULL,
  amount     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
