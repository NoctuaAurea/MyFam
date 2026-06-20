import React, { createContext, useContext, useEffect, useState } from "react";
import { api, backendEnabled, setToken } from "./api.js";

const C = { ground: "#0E211C", deep: "#070F0C", surface: "#15241F", up: "#1E2F29", text: "#EAF2ED", soft: "#8AA398", green: "#3FB985", gold: "#E8B24C", border: "rgba(234,242,237,0.12)" };
const serif = "'Fraunces','Iowan Old Style',Georgia,serif";
const sans = "'Inter',system-ui,-apple-system,sans-serif";

const AuthCtx = createContext({ user: null, loading: false, login: null, register: null, logout: null });
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(backendEnabled());

  useEffect(() => {
    if (!backendEnabled()) return; // local demo: no auth
    api.me().then((d) => setUser(d.user)).catch(() => setToken(null)).finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => { const d = await api.login(email, password); setToken(d.token); setUser(d.user); return d.user; };
  const register = async (email, password, first, last) => { const d = await api.register(email, password, first, last); setToken(d.token); setUser(d.user); return d.user; };
  const logout = async () => { try { await api.logout(); } catch { /* ignore */ } setToken(null); setUser(null); };

  return <AuthCtx.Provider value={{ user, setUser, loading, login, register, logout }}>{children}</AuthCtx.Provider>;
}

/* Only gates the app when a backend is configured; in local-demo mode it renders children. */
export function AuthGate({ children }) {
  const { user, loading } = useAuth();
  if (!backendEnabled()) return children;
  if (loading) return <Center>Loading…</Center>;
  if (!user) return <AuthScreen />;
  return children;
}

function Center({ children }) {
  return (
    <div style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", background: C.deep, color: C.soft, fontFamily: sans }}>
      {children}
    </div>
  );
}

function AuthScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState("login");
  const [f, setF] = useState({ email: "", password: "", first: "", last: "" });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try {
      if (mode === "login") await login(f.email, f.password);
      else await register(f.email, f.password, f.first, f.last);
    } catch (ex) {
      const map = { invalid_credentials: "Wrong email or password.", email_taken: "That email already has an account.", invalid_input: "Enter a valid email and a password of at least 8 characters." };
      setErr(map[ex.data?.error] || ex.message || "Something went wrong.");
    } finally { setBusy(false); }
  };

  const input = { width: "100%", boxSizing: "border-box", padding: "11px 13px", marginTop: 8, border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 14, fontFamily: sans, background: C.up, color: C.text, outline: "none" };

  return (
    <div style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", background: `radial-gradient(120% 120% at 50% 35%, ${C.ground}, ${C.deep})`, fontFamily: sans, padding: 20 }}>
      <form onSubmit={submit} style={{ width: 360, maxWidth: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: 26, boxShadow: "0 22px 60px rgba(0,0,0,0.6)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <Logo />
          <span style={{ fontFamily: serif, fontSize: 26, fontWeight: 600, color: C.text }}>MyFam</span>
        </div>
        <div style={{ fontSize: 13.5, color: C.soft, marginBottom: 18 }}>{mode === "login" ? "Sign in to your family tree" : "Create your account"}</div>

        {mode === "register" && (
          <div style={{ display: "flex", gap: 8 }}>
            <input style={input} placeholder="First name" value={f.first} onChange={set("first")} />
            <input style={input} placeholder="Last name" value={f.last} onChange={set("last")} />
          </div>
        )}
        <input style={input} type="email" placeholder="Email" value={f.email} onChange={set("email")} autoComplete="email" />
        <input style={input} type="password" placeholder="Password (min 8 characters)" value={f.password} onChange={set("password")} autoComplete={mode === "login" ? "current-password" : "new-password"} />

        {err && <div style={{ marginTop: 12, fontSize: 13, color: "#E88A8A" }}>{err}</div>}

        <button type="submit" disabled={busy} style={{ width: "100%", marginTop: 18, padding: "11px 14px", border: "none", borderRadius: 999, background: C.green, color: "#06140F", fontSize: 14.5, fontWeight: 600, cursor: "pointer", opacity: busy ? 0.6 : 1, fontFamily: sans }}>
          {busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
        </button>

        <div style={{ marginTop: 14, fontSize: 13, color: C.soft, textAlign: "center" }}>
          {mode === "login" ? "No account yet? " : "Already have an account? "}
          <button type="button" onClick={() => { setErr(null); setMode(mode === "login" ? "register" : "login"); }} style={{ background: "none", border: "none", color: C.gold, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            {mode === "login" ? "Register" : "Sign in"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Logo() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-label="MyFam">
      <rect width="32" height="32" rx="9" fill="#15241F" stroke="rgba(234,242,237,0.12)" />
      <path d="M16 15.5 L16 8 M16 15.5 L8.5 24 M16 15.5 L23.5 24" stroke="#3FB985" strokeWidth="2.1" strokeLinecap="round" />
      <circle cx="16" cy="8" r="3.7" fill="#E8B24C" /><circle cx="8.5" cy="24" r="2.9" fill="#3FB985" /><circle cx="23.5" cy="24" r="2.9" fill="#3FB985" />
    </svg>
  );
}
