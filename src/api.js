/* MyFam API client. Talks to the Cloudflare Worker backend when VITE_API_BASE is set;
 * otherwise the app runs in its original local-demo mode (no server, no login). */
const BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");
export const backendEnabled = () => !!BASE;

let token = null;
try { token = localStorage.getItem("myfam:token"); } catch { /* storage disabled */ }
export const getToken = () => token;
export const setToken = (t) => {
  token = t;
  try { t ? localStorage.setItem("myfam:token", t) : localStorage.removeItem("myfam:token"); } catch { /* ignore */ }
};

async function call(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || `HTTP ${r.status}`), { status: r.status, data });
  return data;
}

export const api = {
  register: (email, password, first, last) => call("/api/auth/register", { method: "POST", body: { email, password, first, last } }),
  login: (email, password) => call("/api/auth/login", { method: "POST", body: { email, password } }),
  logout: () => call("/api/auth/logout", { method: "POST" }),
  me: () => call("/api/auth/me"),
  tree: () => call("/api/tree"),
  mutate: (payload) => call("/api/tree/mutate", { method: "POST", body: payload }),
  patchPerson: (id, fields) => call(`/api/tree/person/${id}`, { method: "PATCH", body: fields }),
  payCreate: () => call("/api/pay/create", { method: "POST" }),
  payStatus: () => call("/api/pay/status"),
  adminUsers: () => call("/api/admin/users"),
  adminUpdateUser: (id, fields) => call(`/api/admin/users/${id}`, { method: "PATCH", body: fields }),
};
