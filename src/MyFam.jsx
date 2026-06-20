import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Plus, X, Search, Share2, QrCode, MapPin, Calendar, Mail, Phone,
  Instagram, MessageCircle, Crosshair, ZoomIn, ZoomOut, UserPlus,
  Sparkles, Link2, Users, Check, Smartphone, Baby, Facebook, Move, Globe,
} from "lucide-react";
import * as THREE from "three";
import WORLD_BORDERS from "./worldBorders.js";
import { t, setLang, getLang, isRTL, LANGS } from "./i18n.js";
import { loadState, saveState } from "./storage.js";
import ErrorBoundary from "./ErrorBoundary.jsx";
import * as rel from "./relationships.js";
import { useAuth } from "./auth.jsx";
import { api, backendEnabled } from "./api.js";

/* ============================================================ *
 *  MyFam — donkere, dynamische stamboom
 *  · twisting groei-animatie bij het laden
 *  · kaartjes verslepen (drag)
 *  · klik op het lege veld om iemand toe te voegen
 *  · tijdens slepen verbinden lijnen zich automatisch op positie
 * ============================================================ */

const T = {
  ground: "#0E211C", groundDeep: "#070F0C",
  surface: "#15241F", surfaceUp: "#1E2F29",
  text: "#EAF2ED", textSoft: "#8AA398",
  green: "#3FB985", greenDeep: "#2C9268",
  gold: "#E8B24C", goldDeep: "#C9912F",
  line: "rgba(120,170,150,0.30)", border: "rgba(234,242,237,0.12)",
};
const serif = "'Fraunces','Iowan Old Style',Georgia,serif";
const sans = "'Inter',system-ui,-apple-system,sans-serif";
const mono = "ui-monospace,'SF Mono',Menlo,monospace";
const NODE_W = 158, SVG_OFF = 2600;

const CSS = `
@keyframes vw-draw { to { stroke-dashoffset: 0; } }
@keyframes vw-pop { 0%{opacity:0; transform:translate(-50%,-50%) scale(.4) rotate(-6deg);} 100%{opacity:1; transform:translate(-50%,-50%) scale(1) rotate(0);} }
@keyframes vw-twist { 0%{opacity:0; transform:rotate(-14deg) scale(.55);} 55%{opacity:1;} 100%{opacity:1; transform:rotate(0) scale(1);} }
@keyframes vw-float { 0%,100%{transform:translateY(0);} 50%{transform:translateY(-7px);} }
@keyframes vw-fade { from{opacity:0;} to{opacity:1;} }
@keyframes vw-leaf { 0%{opacity:0; transform:scale(0);} 100%{opacity:1; transform:scale(1);} }
@keyframes vw-pulse { 0%,100%{transform:scale(1); opacity:.9;} 50%{transform:scale(1.18); opacity:1;} }
`;

/* Fuzzy name matching + the relationship/kinship engine now live in ./relationships.js
   (imported as `rel`), extracted so the app's trickiest logic can be unit-tested. */

const fullName = (p) => `${p.first} ${p.last}`.trim();
const ageFrom = (b) => { if (!b) return null; const y = parseInt(b.slice(0, 4), 10); return y ? new Date().getFullYear() - y : null; };
const initials = (p) => (p.first[0] || "") + (p.last[0] || "");
const colorFor = (p) => p.isYou ? T.gold : ["#4FA3C7", "#C79A4F", "#C77FA8", "#6FB85C", "#9B7FD1", "#C77F5C"][p.id % 6];

/* ---------- seed-familie ---------- */
const seedPersons = [
  { id: 1, isYou: true, first: "Yara", last: "Hussein", birth: "1994-03-12", city: "Amsterdam", birthCity: "Caïro", email: "yara@myfam.app", username: "yara", insta: "yara.h", fb: "yara.hussein", gender: "v", cx: 0, cy: 0 },
  { id: 2, first: "Ahmed", last: "Hussein", birth: "1965-07-02", city: "Caïro", birthCity: "Alexandrië", email: "ahmed@mail.com", username: "ahmed", gender: "m", cx: -210, cy: -210 },
  { id: 3, first: "Layla", last: "Mansour", birth: "1968-11-21", city: "Caïro", username: "layla", gender: "v", cx: 210, cy: -210 },
  { id: 4, first: "Omar", last: "Hussein", birth: "1991-01-30", city: "Rotterdam", birthCity: "Caïro", username: "omar", gender: "m", cx: -300, cy: 20 },
  { id: 5, first: "Kamal", last: "Hussein", birth: "1938-05-09", city: "Alexandrië", username: "kamal", gender: "m", cx: -360, cy: -420 },
  { id: 6, first: "Fatima", last: "Saleh", birth: "1942-09-14", city: "Alexandrië", username: "fatima", gender: "v", cx: -150, cy: -420 },
  { id: 7, first: "Tarek", last: "Hussein", birth: "1962-02-18", city: "Caïro", username: "tarek", gender: "m", cx: -620, cy: -210 },
  { id: 8, first: "Mohammed", last: "Hussein", birth: "1990-06-25", city: "Dubai", birthCity: "Caïro", username: "mohammed", insta: "mo.hussein", fb: "mohammed.hussein.92", gender: "m", cx: -680, cy: 20 },
  { id: 9, first: "Youssef", last: "Adel", birth: "1992-08-08", city: "Amsterdam", username: "youssef", gender: "m", cx: 200, cy: 20 },
  { id: 10, first: "Sara", last: "Adel", birth: "2020-04-17", city: "Amsterdam", birthCity: "Amsterdam", username: "sara", gender: "v", cx: 60, cy: 240 },
];
const seedParent = [
  { p: 2, c: 1 }, { p: 3, c: 1 }, { p: 2, c: 4 }, { p: 3, c: 4 },
  { p: 5, c: 2 }, { p: 6, c: 2 }, { p: 5, c: 7 }, { p: 6, c: 7 },
  { p: 7, c: 8 }, { p: 1, c: 10 }, { p: 9, c: 10 },
];
const seedSpouse = [{ a: 2, b: 3 }, { a: 5, b: 6 }, { a: 1, b: 9 }];

const edgePath = (a, b, curve) => {
  if (curve) { const my = (a.cy + b.cy) / 2; return `M${a.cx},${a.cy} C${a.cx},${my} ${b.cx},${my} ${b.cx},${b.cy}`; }
  return `M${a.cx},${a.cy} L${b.cx},${b.cy}`;
};

export default function MyFam() {
  const [boot] = useState(loadState); // saved tree from localStorage, or null
  const [persons, setPersons] = useState(() => boot?.persons ?? seedPersons);
  const [parentOf, setParentOf] = useState(() => boot?.parentOf ?? seedParent);
  const [spouse, setSpouse] = useState(() => boot?.spouse ?? seedSpouse);
  const [sibling, setSibling] = useState(() => boot?.sibling ?? []);
  const [meId, setMeId] = useState(() => boot?.meId ?? 1); // "you" — backend overrides this when logged in
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [selectedId, setSelectedId] = useState(() => boot?.meId ?? 1);
  const [panel, setPanel] = useState(null);       // 'add' | 'addFree' | 'connect' | 'share'
  const [toast, setToast] = useState(null);
  const [highlight, setHighlight] = useState(new Set());
  const [verifyFor, setVerifyFor] = useState(null);
  const [addAt, setAddAt] = useState(null);        // wereldcoörd voor vrij toevoegen
  const [dragPreview, setDragPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [mode, setMode] = useState("2d");
  const [lang, setLangState] = useState(getLang());
  const [access, setAccess] = useState(null);   // backend access info: { role, paid, locked, total, visible }
  const { user, logout } = useAuth();            // null in local-demo mode

  const containerRef = useRef(null);
  const panDrag = useRef({ active: false });
  const nodeDrag = useRef({ active: false });
  const pointers = useRef(new Map()); // active pointers on the 2D canvas (for pinch-zoom)
  const pinch = useRef(null);         // { dist, mid } while two fingers are down
  const viewRef = useRef(view); useEffect(() => { viewRef.current = view; }, [view]);
  const personsRef = useRef(persons); useEffect(() => { personsRef.current = persons; }, [persons]);

  const byId = (id) => persons.find((p) => p.id === id);
  const me = byId(meId) || persons[0];
  const selected = byId(selectedId);

  /* persist to localStorage — local-demo mode only (the backend is the source of truth when logged in) */
  useEffect(() => { if (backendEnabled() && user) return; saveState({ persons, parentOf, spouse, sibling, meId }); }, [persons, parentOf, spouse, sibling, meId, user]);

  /* backend mode: load the access-filtered tree from the server */
  const applyTree = useCallback((tr) => {
    if (!tr) return;
    setPersons(tr.persons || []); setParentOf(tr.parentOf || []); setSpouse(tr.spouse || []); setSibling(tr.sibling || []);
    if (tr.meId != null) setMeId(tr.meId); setAccess(tr.access || null);
  }, []);
  useEffect(() => {
    if (!backendEnabled() || !user) return;
    api.tree().then(applyTree).catch(() => {});
    if (typeof location !== "undefined" && /[?&]paid=1/.test(location.search)) { // returned from Mollie → poll (webhook may lag a moment)
      let n = 0; const iv = setInterval(() => { api.tree().then(applyTree).catch(() => {}); if (++n >= 4) clearInterval(iv); }, 1500);
      return () => clearInterval(iv);
    }
  }, [user, applyTree]);

  /* send a client-built add (newPersons + edges) to the server, then apply the returned filtered tree */
  const pushMutation = async (np, pe, se, sb) => {
    const ids = new Set(np.map((p) => p.id)); const ref = (id) => (ids.has(id) ? `t${id}` : id);
    const tree = await api.mutate({
      newPersons: np.map((p) => ({ tmp: `t${p.id}`, first: p.first, last: p.last, birth: p.birth, city: p.city, birthCity: p.birthCity, email: p.email, insta: p.insta, fb: p.fb, gender: p.gender, cx: p.cx, cy: p.cy })),
      parent: pe.map((e) => ({ p: ref(e.p), c: ref(e.c) })), spouse: se.map((e) => ({ a: ref(e.a), b: ref(e.b) })), sibling: sb.map((e) => ({ a: ref(e.a), b: ref(e.b) })),
    });
    applyTree(tree);
  };
  const startUnlock = () => { api.payCreate().then((r) => { if (r.checkoutUrl) window.location.href = r.checkoutUrl; }).catch(() => setToast({ type: "notfound", q: "payment unavailable" })); };

  /* fonts + intro-timing */
  useEffect(() => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600&display=swap";
    document.head.appendChild(l);
    const t1 = setTimeout(() => setLoading(false), 2000);
    const t2 = setTimeout(() => setRevealed(true), 3000);
    return () => { document.head.removeChild(l); clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const screenToWorld = (clientX, clientY) => {
    const r = containerRef.current.getBoundingClientRect(); const v = viewRef.current;
    return { x: (clientX - r.left - v.x) / v.k, y: (clientY - r.top - v.y) / v.k };
  };
  const centerOn = useCallback((cx, cy, k) => {
    const el = containerRef.current; if (!el) return;
    const kk = k ?? viewRef.current.k;
    setView({ x: el.clientWidth / 2 - cx * kk, y: el.clientHeight / 2 - cy * kk, k: kk });
  }, []);
  useEffect(() => { centerOn(0, 0, 1); }, []); // eslint-disable-line

  const zoomBy = (factor, sx, sy) => {
    const el = containerRef.current; if (!el) return; const r = el.getBoundingClientRect();
    const px = sx ?? r.width / 2, py = sy ?? r.height / 2;
    setView((v) => { const nk = Math.min(2.4, Math.max(0.3, v.k * factor)); const wx = (px - v.x) / v.k, wy = (py - v.y) / v.k; return { k: nk, x: px - wx * nk, y: py - wy * nk }; });
  };
  const onWheel = (e) => { if (mode !== "2d") return; e.preventDefault(); const r = containerRef.current.getBoundingClientRect(); zoomBy(e.deltaY < 0 ? 1.12 : 0.89, e.clientX - r.left, e.clientY - r.top); };

  /* ---------- relatie-helpers ---------- */
  /* relationship engine — pure logic lives in ./relationships.js; these thin wrappers
     bind the current edge-list state (and t() for localized labels). */
  const hasEdge = (a, b) => rel.hasEdge(parentOf, spouse, sibling, a, b);
  const bfsPath = (src, dst) => rel.bfsPath(parentOf, spouse, sibling, src, dst);
  const relationship = (idA, idB) => rel.relationship(parentOf, spouse, sibling, idA, idB, t);

  /* ---------- toevoegen via relatie (uit detailkaart) ---------- */
  const GEN_DY = { grootouder: -460, ouder: -230, "oom/tante": -230, "broer/zus": 0, partner: 0, "neef/nicht": 0, kind: 230, kleinkind: 460 };
  const SIDE_DX = { grootouder: -60, ouder: 60, "oom/tante": -320, "broer/zus": 220, partner: 190, "neef/nicht": -320, kind: 60, kleinkind: 60 };
  const placeNear = (anchor, kind, list) => { let cx = anchor.cx + (SIDE_DX[kind] ?? 60), cy = anchor.cy + (GEN_DY[kind] ?? 0); while (list.some((p) => Math.abs(p.cx - cx) < 160 && Math.abs(p.cy - cy) < 95)) cx += 175; return { cx, cy }; };
  const newPersonFromForm = (form, cx, cy, nextId) => ({ id: nextId, first: form.first.trim(), last: form.last.trim(), birth: form.birth, city: form.city, birthCity: form.birthCity, email: form.email, insta: form.insta, fb: form.fb, gender: form.gender, username: (form.first + form.last).toLowerCase().replace(/[^a-z]/g, ""), cx, cy });

  const addMember = (form, existing) => {
    const anchor = selected, kind = form.kind;
    const np = [], pe = [], se = [], sb = []; let nextId = Math.max(0, ...persons.map((p) => p.id)) + 1;
    const all = () => [...persons, ...np];
    const parents = (id) => parentOf.filter((e) => e.c === id).map((e) => e.p);
    const childrenOf = (id) => parentOf.filter((e) => e.p === id).map((e) => e.c);
    const mkConn = (label, k) => { const { cx, cy } = placeNear(anchor, k, all()); const c = { id: nextId++, first: label, last: "", birth: "", city: "", username: `c${nextId}`, cx, cy, connector: true }; np.push(c); return c; };
    let target = existing;
    if (!target) { const { cx, cy } = placeNear(anchor, kind, all()); target = newPersonFromForm(form, cx, cy, nextId++); np.push(target); }
    if (kind === "ouder") pe.push({ p: target.id, c: anchor.id });
    else if (kind === "kind") pe.push({ p: anchor.id, c: target.id });
    else if (kind === "partner") se.push({ a: anchor.id, b: target.id });
    else if (kind === "broer/zus") { parents(anchor.id).forEach((p) => pe.push({ p, c: target.id })); sb.push({ a: anchor.id, b: target.id }); }
    else if (kind === "grootouder") { let p0 = parents(anchor.id)[0]; if (!p0) { const c = mkConn(t("kind_ouder"), "ouder"); pe.push({ p: c.id, c: anchor.id }); p0 = c.id; } pe.push({ p: target.id, c: p0 }); }
    else if (kind === "oom/tante") { let p0 = parents(anchor.id)[0]; if (!p0) { const c = mkConn(t("kind_ouder"), "ouder"); pe.push({ p: c.id, c: anchor.id }); p0 = c.id; } const gps = parentOf.filter((e) => e.c === p0).map((e) => e.p); gps.forEach((g) => pe.push({ p: g, c: target.id })); sb.push({ a: p0, b: target.id }); }
    else if (kind === "neef/nicht") { let p0 = parents(anchor.id)[0]; if (!p0) { const c = mkConn(t("kind_ouder"), "ouder"); pe.push({ p: c.id, c: anchor.id }); p0 = c.id; } const gps = parentOf.filter((e) => e.c === p0).map((e) => e.p); let uncle = gps.length ? parentOf.filter((e) => gps.includes(e.p) && e.c !== p0).map((e) => e.c)[0] : null; if (!uncle) { const uc = mkConn(t("kind_oom/tante"), "oom/tante"); gps.forEach((g) => pe.push({ p: g, c: uc.id })); if (!gps.length) sb.push({ a: p0, b: uc.id }); uncle = uc.id; } pe.push({ p: uncle, c: target.id }); }
    else if (kind === "kleinkind") { let c0 = childrenOf(anchor.id)[0]; if (!c0) { const c = mkConn(t("kind_kind"), "kind"); pe.push({ p: anchor.id, c: c.id }); c0 = c.id; } pe.push({ p: c0, c: target.id }); }
    if (backendEnabled() && user) { // backend: persist via the server, then show the returned (access-filtered) tree
      setPanel(null);
      pushMutation(np, pe, se, sb)
        .then(() => { setSelectedId(null); if (!existing && form.email) setToast({ type: "invite", person: target, inviter: anchor, kind }); else if (existing) setToast({ type: "merged", person: target }); })
        .catch((ex) => setToast({ type: "notfound", q: ex.data?.detail || "could not save" }));
      return;
    }
    if (np.length) setPersons((ps) => [...ps, ...np]);
    if (pe.length) setParentOf((e) => [...e, ...pe]);
    if (se.length) setSpouse((e) => [...e, ...se]);
    if (sb.length) setSibling((e) => [...e, ...sb]);
    setPanel(null); setSelectedId(target.id); if (!existing) centerOn(target.cx, target.cy);
    if (!existing && form.email) setToast({ type: "invite", person: target, inviter: anchor, kind });
    else if (existing) setToast({ type: "merged", person: target });
  };

  /* ---------- vrij toevoegen (klik op veld) ---------- */
  const addFree = (form) => {
    const nextId = Math.max(0, ...persons.map((p) => p.id)) + 1;
    const target = newPersonFromForm(form, addAt.x, addAt.y, nextId);
    if (backendEnabled() && user) {
      setPanel(null); setAddAt(null);
      pushMutation([target], [], [], []).then(() => { setSelectedId(null); setToast({ type: "free", person: target }); }).catch(() => {});
      return;
    }
    setPersons((ps) => [...ps, target]); setPanel(null); setAddAt(null); setSelectedId(target.id);
    setToast({ type: "free", person: target });
  };

  /* ---------- pointer: pan + node-drag + klik-op-veld ---------- */
  const startNodeDrag = (id, e) => {
    e.stopPropagation();
    const p = personsRef.current.find((x) => x.id === id); const w = screenToWorld(e.clientX, e.clientY);
    nodeDrag.current = { active: true, id, offX: w.x - p.cx, offY: w.y - p.cy, sx: e.clientX, sy: e.clientY, moved: false };
  };
  const computePreview = (id, nx, ny) => {
    const ps = personsRef.current; let best = null;
    for (const o of ps) { if (o.id === id || hasEdge(id, o.id)) continue; const d = Math.hypot(o.cx - nx, o.cy - ny); if (d < 150 && (!best || d < best.d)) best = { o, d }; }
    if (!best) { setDragPreview(null); return; }
    const dy = ny - best.o.cy; const relation = dy < -55 ? "ouder" : dy > 55 ? "kind" : "partner";
    setDragPreview({ fromId: id, toId: best.o.id, relation });
  };
  const onPointerDown = (e) => {
    if (mode !== "2d") return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) { // second finger → begin pinch; cancel pan/node-drag
      const [a, b] = [...pointers.current.values()]; const r = containerRef.current.getBoundingClientRect();
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top } };
      panDrag.current = { active: false }; nodeDrag.current = { active: false }; setDragPreview(null);
      return;
    }
    panDrag.current = { active: true, sx: e.clientX, sy: e.clientY, ox: viewRef.current.x, oy: viewRef.current.y, moved: false };
  };
  const onPointerMove = (e) => {
    if (pinch.current) {
      if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size >= 2) {
        const [a, b] = [...pointers.current.values()]; const r = containerRef.current.getBoundingClientRect();
        const dist = Math.hypot(a.x - b.x, a.y - b.y); const mid = { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top };
        const prev = pinch.current; const factor = prev.dist ? dist / prev.dist : 1;
        setView((v) => { const nk = Math.min(2.4, Math.max(0.3, v.k * factor)); const wx = (mid.x - v.x) / v.k, wy = (mid.y - v.y) / v.k; return { k: nk, x: mid.x - wx * nk + (mid.x - prev.mid.x), y: mid.y - wy * nk + (mid.y - prev.mid.y) }; });
        pinch.current = { dist, mid };
      }
      return;
    }
    if (nodeDrag.current.active) {
      const nd = nodeDrag.current; const w = screenToWorld(e.clientX, e.clientY); const nx = w.x - nd.offX, ny = w.y - nd.offY;
      if (Math.hypot(e.clientX - nd.sx, e.clientY - nd.sy) > 4) nd.moved = true;
      setPersons((ps) => ps.map((p) => p.id === nd.id ? { ...p, cx: nx, cy: ny } : p));
      computePreview(nd.id, nx, ny);
    } else if (panDrag.current.active) {
      const pd = panDrag.current; if (Math.hypot(e.clientX - pd.sx, e.clientY - pd.sy) > 4) pd.moved = true;
      setView((v) => ({ ...v, x: pd.ox + (e.clientX - pd.sx), y: pd.oy + (e.clientY - pd.sy) }));
    }
  };
  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    if (pinch.current) { if (pointers.current.size < 2) { pinch.current = null; panDrag.current = { active: false }; } return; }
    if (nodeDrag.current.active) {
      const nd = nodeDrag.current;
      if (nd.moved && dragPreview) {
        const { fromId, toId, relation } = dragPreview; const from = byId(fromId), to = byId(toId);
        if (backendEnabled() && user) {
          const parent = relation === "ouder" ? [{ p: fromId, c: toId }] : relation === "kind" ? [{ p: toId, c: fromId }] : [];
          const spouseE = relation === "partner" ? [{ a: fromId, b: toId }] : [];
          api.mutate({ newPersons: [], parent, spouse: spouseE, sibling: [] }).then(applyTree).catch(() => {});
        } else if (relation === "ouder") setParentOf((es) => [...es, { p: fromId, c: toId }]);
        else if (relation === "kind") setParentOf((es) => [...es, { p: toId, c: fromId }]);
        else setSpouse((es) => [...es, { a: fromId, b: toId }]);
        setToast({ type: "connected", from, to, relation });
      } else if (nd.moved) { // repositioned only — persist the new coords in backend mode
        if (backendEnabled() && user) { const p = personsRef.current.find((x) => x.id === nd.id); if (p) api.patchPerson(nd.id, { cx: p.cx, cy: p.cy }).catch(() => {}); }
      } else { setSelectedId(nd.id); setHighlight(new Set()); }
      nodeDrag.current = { active: false }; setDragPreview(null); return;
    }
    if (panDrag.current.active) {
      const pd = panDrag.current; nodeDrag.current = { active: false };
      if (!pd.moved) {
        if (panel) setPanel(null);
        else if (selectedId) { setSelectedId(null); setHighlight(new Set()); }
        else { const w = screenToWorld(e.clientX, e.clientY); setAddAt(w); setPanel("addFree"); }
      }
      panDrag.current = { active: false };
    }
  };

  /* ---------- verbinden (onbekende) ---------- */
  const connectTo = (query) => {
    const q = query.trim(); let found = persons.find((p) => p.username === q.toLowerCase() && p.id !== meId);
    if (!found) { const parts = q.split(/\s+/); found = persons.find((p) => p.id !== meId && (rel.nameMatch(parts[0] || "", parts[1] || p.last, p.first, p.last) || rel.normalize(p.first).includes(rel.normalize(parts[0] || "____")))); }
    if (!found) { setToast({ type: "notfound", q }); return; }
    const rel = relationship(meId, found.id); const path = bfsPath(meId, found.id) || [];
    setHighlight(new Set(path)); setSelectedId(found.id); centerOn(found.cx, found.cy); setPanel(null);
    setToast({ type: "rel", person: found, rel, path, viaName: rel.via ? fullName(byId(rel.via)) : null });
  };

  /* ---------- render-data ---------- */
  const lines = [];
  parentOf.forEach((e, i) => { const a = byId(e.p), b = byId(e.c); if (a && b) lines.push({ key: `p${i}`, d: edgePath(a, b, true), hot: highlight.has(e.p) && highlight.has(e.c) }); });
  spouse.forEach((e, i) => { const a = byId(e.a), b = byId(e.b); if (a && b) lines.push({ key: `s${i}`, d: edgePath(a, b, false), hot: highlight.has(e.a) && highlight.has(e.b), dash: true }); });
  const prevFrom = dragPreview && byId(dragPreview.fromId), prevTo = dragPreview && byId(dragPreview.toId);

  const viewFallback = (_err, reset) => (
    <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: T.textSoft, fontFamily: sans, zIndex: 10 }}>
      <div style={{ textAlign: "center", padding: 24 }}>
        <div style={{ fontFamily: serif, fontSize: 18, color: T.text, marginBottom: 8 }}>This view couldn't load</div>
        <div style={{ fontSize: 13, marginBottom: 14 }}>The 3D renderer hit an error.</div>
        <button onClick={() => { reset(); setMode("2d"); }} style={pill(T.green, "#06140F")}>← Back to 2D</button>
      </div>
    </div>
  );

  return (
    <div dir={isRTL() ? "rtl" : "ltr"} style={{ fontFamily: sans, color: T.text, height: "100vh", minHeight: 560, display: "flex", flexDirection: "column", background: T.groundDeep }}>
      <style>{CSS}</style>

      {/* ---------- topbar ---------- */}
      <header style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 18px", background: T.surface, borderBottom: `1px solid ${T.border}`, zIndex: 30, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Logo size={30} />
          <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
            <span style={{ fontFamily: serif, fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em", color: T.text }}>MyFam</span>
            <span style={{ fontSize: 12.5, color: T.textSoft }}>{t("tagline")}</span>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", background: T.surfaceUp, border: `1px solid ${T.border}`, borderRadius: 999, padding: 3 }}>
          {["2d", "4d", "map"].map((m) => (
            <button key={m} onClick={() => setMode(m)} title={m === "map" ? t("mapTitle") : m.toUpperCase()} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 13px", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 700, fontFamily: mono, letterSpacing: "0.04em", background: mode === m ? T.gold : "transparent", color: mode === m ? "#06140F" : T.textSoft }}>{m === "map" ? <><Globe size={14} /> MAP</> : m.toUpperCase()}</button>
          ))}
        </div>
        <div title={t("relationsTitle")} style={{ display: "flex", alignItems: "center", gap: 6, background: T.surfaceUp, border: `1px solid ${T.border}`, borderRadius: 999, padding: "6px 12px", fontSize: 12.5, color: T.text }}>
          <Link2 size={14} color={T.gold} /> <b style={{ fontFamily: mono }}>{parentOf.length + spouse.length + sibling.length}</b> <span style={{ color: T.textSoft }}>{t("relations")}</span>
        </div>
        <select value={lang} onChange={(e) => { setLang(e.target.value); setLangState(e.target.value); }} title="Taal / Language" style={{ background: T.surfaceUp, color: T.text, border: `1px solid ${T.border}`, borderRadius: 999, padding: "7px 10px", fontSize: 12.5, fontFamily: sans, cursor: "pointer" }}>
          {LANGS.map(([code, name]) => <option key={code} value={code} style={{ background: T.surface, color: T.text }}>{name}</option>)}
        </select>
        {mode === "2d" && <>
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: T.surfaceUp, border: `1px solid ${T.border}`, borderRadius: 999, padding: 3 }}>
            <IconBtn onClick={() => zoomBy(0.83)}><ZoomOut size={17} /></IconBtn>
            <span style={{ fontFamily: mono, fontSize: 12, width: 42, textAlign: "center", color: T.textSoft }}>{Math.round(view.k * 100)}%</span>
            <IconBtn onClick={() => zoomBy(1.2)}><ZoomIn size={17} /></IconBtn>
          </div>
          <IconBtn onClick={() => { setHighlight(new Set()); setSelectedId(meId); centerOn(me?.cx ?? 0, me?.cy ?? 0, 1); }} title={t("centerMe")}><Crosshair size={17} /></IconBtn>
        </>}
        <button onClick={() => setPanel("connect")} style={pill(T.green, "#06140F")}><QrCode size={16} /> {t("connect")}</button>
        <button onClick={() => setPanel("share")} style={pill(T.surfaceUp, T.text)}><Share2 size={16} /> {t("share")}</button>
        {user && <>
          {access && !access.paid && access.locked > 0 && (
            <button onClick={startUnlock} title={`${access.locked} more relatives are locked`} style={pill(T.gold, "#06140F")}>🔒 Unlock full tree · €0,99</button>
          )}
          {user.role === "admin" && <button onClick={() => setPanel("admin")} style={pill(T.surfaceUp, T.text)}><Users size={16} /> Admin</button>}
          <div title={user.email} style={{ display: "flex", alignItems: "center", gap: 8, background: T.surfaceUp, border: `1px solid ${T.border}`, borderRadius: 999, padding: "5px 6px 5px 12px", fontSize: 12.5, color: T.text }}>
            <span style={{ maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</span>
            {user.role === "admin" && <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, color: "#06140F", background: T.gold, borderRadius: 6, padding: "1px 6px" }}>ADMIN</span>}
            <button onClick={logout} title="Sign out" style={{ border: "none", background: "transparent", color: T.textSoft, cursor: "pointer", display: "grid", placeItems: "center", padding: 4 }}><X size={15} /></button>
          </div>
        </>}
      </header>

      {/* ---------- canvas ---------- */}
      <div ref={containerRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp} onWheel={onWheel}
        style={{ position: "relative", flex: 1, overflow: "hidden", cursor: nodeDrag.current.active ? "grabbing" : "grab", background: `radial-gradient(130% 130% at 50% 30%, ${T.ground} 0%, ${T.groundDeep} 100%)`, touchAction: "none" }}>
        <div style={{ position: "absolute", inset: 0, opacity: 0.6, pointerEvents: "none", backgroundImage: `radial-gradient(circle at 22% 18%, rgba(63,185,133,0.10), transparent 42%), radial-gradient(circle at 82% 72%, rgba(232,178,76,0.08), transparent 46%)` }} />

        {mode === "2d" && <>
        <div style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
          <svg width={SVG_OFF * 2} height={SVG_OFF * 2} style={{ position: "absolute", left: -SVG_OFF, top: -SVG_OFF, overflow: "visible", pointerEvents: "none" }}>
            <g transform={`translate(${SVG_OFF},${SVG_OFF})`}>
              {lines.map((l, i) => (
                <path key={l.key} d={l.d} fill="none" pathLength="100"
                  stroke={l.hot ? T.gold : T.line} strokeWidth={l.hot ? 3 : 1.7}
                  strokeDasharray={l.dash && !l.hot ? "4 5" : undefined}
                  style={!revealed ? { strokeDasharray: 100, strokeDashoffset: 100, animation: `vw-draw .9s ease forwards ${(0.35 + i * 0.045).toFixed(2)}s` } : undefined} />
              ))}
              {dragPreview && prevFrom && prevTo && (
                <path d={edgePath(prevFrom, prevTo, dragPreview.relation !== "partner")} fill="none" stroke={T.gold} strokeWidth={2.6} strokeDasharray="7 6" opacity={0.95} />
              )}
            </g>
          </svg>

          {persons.map((p, i) => (
            <Node key={p.id} p={p} index={i} revealed={revealed}
              selected={p.id === selectedId} hot={highlight.has(p.id)}
              dragging={nodeDrag.current.active && nodeDrag.current.id === p.id}
              onDragStart={startNodeDrag} />
          ))}

          {dragPreview && prevFrom && (
            <div style={{ position: "absolute", left: prevFrom.cx, top: prevFrom.cy - 58, transform: "translate(-50%,-50%)", background: T.gold, color: "#06140F", padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", pointerEvents: "none", boxShadow: "0 4px 14px rgba(0,0,0,0.4)" }}>
              {dragPreview.relation === "ouder" ? t("dragParentOf", { name: prevTo.first }) : dragPreview.relation === "kind" ? t("dragChildOf", { name: prevTo.first }) : t("dragPartnerOf", { name: prevTo.first })}
            </div>
          )}
        </div>

        {/* hint */}
        {revealed && !panel && !selected && (
          <div style={{ position: "absolute", bottom: 18, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 16, alignItems: "center", background: "rgba(21,36,31,0.85)", border: `1px solid ${T.border}`, borderRadius: 999, padding: "8px 16px", fontSize: 12.5, color: T.textSoft, backdropFilter: "blur(6px)" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Plus size={14} color={T.green} /> {t("hint_add")}</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Move size={14} color={T.gold} /> {t("hint_drag")}</span>
          </div>
        )}

        </>}
        {mode === "4d" && <ErrorBoundary fallback={viewFallback}><ThreeView persons={persons} parentOf={parentOf} spouse={spouse} sibling={sibling} youId={meId} onSelect={(id) => { setSelectedId(id); setHighlight(new Set()); }} /></ErrorBoundary>}
        {mode === "map" && <ErrorBoundary fallback={viewFallback}><GlobeView persons={persons} parentOf={parentOf} spouse={spouse} sibling={sibling} youId={meId} onSelect={(id) => { setSelectedId(id); setHighlight(new Set()); }} /></ErrorBoundary>}

        {/* detail + modals */}
        {selected && !panel && <DetailCard p={selected} isMe={selected.id === meId} onAdd={() => setPanel("add")} onVerify={(id) => setVerifyFor(id)} onClose={() => setSelectedId(null)} />}
        {panel === "add" && selected && <AddPanel anchor={selected} persons={persons} onClose={() => setPanel(null)} onSubmit={addMember} />}
        {panel === "addFree" && <FreeAddPanel onClose={() => { setPanel(null); setAddAt(null); }} onSubmit={addFree} />}
        {panel === "connect" && <ConnectPanel onClose={() => setPanel(null)} onConnect={connectTo} />}
        {panel === "share" && <SharePanel me={me} onClose={() => setPanel(null)} />}
        {panel === "admin" && <AdminPanel onClose={() => setPanel(null)} />}
        {verifyFor != null && <VerifyModal person={byId(verifyFor)} onCancel={() => setVerifyFor(null)} onConfirm={() => { const id = verifyFor; setPersons((ps) => ps.map((p) => p.id === id ? { ...p, fbVerified: true } : p)); setVerifyFor(null); setToast({ type: "verified", person: byId(id) }); }} />}
        {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
      </div>

      {loading && <IntroLoader />}
    </div>
  );
}

/* ================= componenten ================= */

/* ---------- wereldbol ---------- */
const CITY_DB = {
  amsterdam: [52.37, 4.90, "Nederland"], rotterdam: [51.92, 4.48, "Nederland"], utrecht: [52.09, 5.12, "Nederland"], maarssen: [52.14, 5.04, "Nederland"], "den haag": [52.08, 4.31, "Nederland"],
  cairo: [30.04, 31.24, "Egypte"], alexandrie: [31.20, 29.92, "Egypte"], giza: [30.01, 31.21, "Egypte"],
  dubai: [25.20, 55.27, "VAE"], "abu dhabi": [24.45, 54.38, "VAE"], doha: [25.29, 51.53, "Qatar"], riyad: [24.71, 46.68, "Saoedi-Arabië"],
  london: [51.51, -0.13, "VK"], londen: [51.51, -0.13, "VK"], parijs: [48.86, 2.35, "Frankrijk"], paris: [48.86, 2.35, "Frankrijk"],
  berlijn: [52.52, 13.40, "Duitsland"], berlin: [52.52, 13.40, "Duitsland"], munchen: [48.14, 11.58, "Duitsland"],
  istanbul: [41.01, 28.98, "Turkije"], "new york": [40.71, -74.01, "VS"], vicenza: [45.55, 11.55, "Italië"], costabissara: [45.60, 11.46, "Italië"], milaan: [45.46, 9.19, "Italië"], rome: [41.90, 12.50, "Italië"],
};
const normCity = (s = "") => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
const cityGeo = (city) => {
  const k = normCity(city); if (CITY_DB[k]) return { lat: CITY_DB[k][0], lng: CITY_DB[k][1], country: CITY_DB[k][2], known: true };
  let h = 0; for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
  return { lat: ((h % 120) - 60), lng: (((h >> 3) % 360) - 180), country: "—", known: false };
};

function GlobeView({ persons, parentOf, spouse, sibling, youId, onSelect }) {
  const mountRef = useRef(null);
  const onSelectRef = useRef(onSelect); useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  const dataRef = useRef(null); dataRef.current = { persons, parentOf, spouse, sibling, youId };
  const rebuildRef = useRef(null);
  const builtRef = useRef(false);
  const stats = (() => {
    const cities = new Set(), countries = new Set();
    persons.forEach((p) => { if (p.city) { cities.add(normCity(p.city)); countries.add(cityGeo(p.city).country); } });
    return { members: persons.length, relations: parentOf.length + spouse.length + sibling.length, cities: cities.size, countries: countries.size };
  })();

  /* Build renderer/scene/camera/static globe/orbit/animation ONCE. City pins, flags,
     arcs and labels live in a content group rebuilt by the data effect below, so the
     camera is never reset when the family changes. */
  useEffect(() => {
    const mount = mountRef.current; if (!mount) return;
    let W = mount.clientWidth, H = mount.clientHeight;
    const scene = new THREE.Scene(); scene.background = new THREE.Color("#070F0C");
    const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 5000);
    const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.setSize(W, H); mount.appendChild(renderer.domElement);
    const R = 120, group = new THREE.Group(); scene.add(group); // whole globe (intro-scaled)

    const llToVec = (lat, lng, r) => { const phi = (90 - lat) * Math.PI / 180, theta = (lng + 180) * Math.PI / 180; return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta)); };

    // static base (built once)
    group.add(new THREE.Mesh(new THREE.SphereGeometry(R * 0.99, 48, 48), new THREE.MeshBasicMaterial({ color: 0x0a2230 })));
    group.add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.09, 32, 32), new THREE.MeshBasicMaterial({ color: 0x2f9e6b, transparent: true, opacity: 0.06, side: THREE.BackSide })));
    const bmat = new THREE.LineBasicMaterial({ color: 0x4fb58a, transparent: true, opacity: 0.6 });
    WORLD_BORDERS.forEach((ring) => { const pts = ring.map(([lng, lat]) => llToVec(lat, lng, R * 1.004)); group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), bmat)); });
    const gmat = new THREE.LineBasicMaterial({ color: 0x244a40, transparent: true, opacity: 0.22 });
    { const pts = []; for (let t = 0; t <= 360; t += 6) pts.push(llToVec(0, t - 180, R)); group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), gmat)); }

    const contentGroup = new THREE.Group(); group.add(contentGroup); // city pins/flags/dots/arcs (rebuilt)
    const labelLayer = document.createElement("div"); labelLayer.style.cssText = "position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:3;"; mount.appendChild(labelLayer);

    let labels = [], pick = [], byCity = {}, cityVec = {};
    const disposeChild = (o) => o.traverse?.((c) => { c.geometry?.dispose?.(); const mm = c.material; if (mm) (Array.isArray(mm) ? mm : [mm]).forEach((x) => { x.map?.dispose?.(); x.dispose?.(); }); });

    const rebuild = () => {
      const { persons, parentOf, spouse, sibling, youId } = dataRef.current;
      for (let i = contentGroup.children.length - 1; i >= 0; i--) { const o = contentGroup.children[i]; disposeChild(o); contentGroup.remove(o); }
      while (labelLayer.firstChild) labelLayer.removeChild(labelLayer.firstChild);
      byCity = {}; cityVec = {}; pick = []; const labelData = [];
      const youCity = normCity((persons.find((p) => p.id === youId) || {}).city || "");
      persons.forEach((p) => { if (!p.city) return; const k = normCity(p.city); (byCity[k] = byCity[k] || { members: [], city: p.city }).members.push(p); });
      Object.keys(byCity).forEach((k) => {
        const g = cityGeo(byCity[k].city); const base = llToVec(g.lat, g.lng, R); cityVec[k] = base;
        const normal = base.clone().normalize(); const isYou = k === youCity; const col = isYou ? 0xE8B24C : 0x3FB985;
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 16, 6), new THREE.MeshBasicMaterial({ color: 0xEAF2ED })); pole.position.copy(base.clone().add(normal.clone().multiplyScalar(8))); pole.quaternion.copy(q); contentGroup.add(pole);
        const tangent = new THREE.Vector3().crossVectors(normal, new THREE.Vector3(0, 1, 0)); if (tangent.length() < 0.1) tangent.set(1, 0, 0); tangent.normalize();
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(9, 6), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide })); flag.position.copy(base.clone().add(normal.clone().multiplyScalar(14)).add(tangent.clone().multiplyScalar(4.5))); flag.quaternion.copy(q); contentGroup.add(flag);
        const dot = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 12), new THREE.MeshBasicMaterial({ color: col })); dot.position.copy(base); dot.userData.city = k; contentGroup.add(dot); pick.push(dot, pole, flag); flag.userData.city = k; pole.userData.city = k;
        const n = byCity[k].members.length; labelData.push({ key: k, text: `${byCity[k].city}${n > 1 ? ` · ${n}` : ""}`, vec: base.clone().add(normal.clone().multiplyScalar(16)), isYou, count: n });
      });

      const arc = (a, b, color) => { if (!cityVec[a] || !cityVec[b] || a === b) return; const s = cityVec[a], e = cityVec[b]; const mid = s.clone().add(e).multiplyScalar(0.5).normalize().multiplyScalar(R + s.distanceTo(e) * 0.4 + 8); const pts = new THREE.QuadraticBezierCurve3(s, mid, e).getPoints(30); contentGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 }))); };
      const cityOf = (id) => { const p = persons.find((x) => x.id === id); return p && p.city ? normCity(p.city) : null; };
      parentOf.forEach((e) => arc(cityOf(e.p), cityOf(e.c), 0x3FB985));
      spouse.forEach((e) => arc(cityOf(e.a), cityOf(e.b), 0xE8B24C));
      sibling.forEach((e) => arc(cityOf(e.a), cityOf(e.b), 0x3FB985));

      labels = labelData.map((d) => { const el = document.createElement("div"); el.textContent = d.text; el.style.cssText = `position:absolute;left:0;top:0;white-space:nowrap;font:600 11px Inter,sans-serif;padding:2px 7px;border-radius:8px;background:rgba(7,15,12,.8);border:1px solid ${d.isYou ? "#E8B24C" : "rgba(234,242,237,.18)"};color:${d.isYou ? "#F6D690" : "#EAF2ED"};box-shadow:0 2px 8px rgba(0,0,0,.4);display:none;`; labelLayer.appendChild(el); return { d, el }; });
    };
    rebuildRef.current = rebuild;
    rebuild(); // initial build (the data effect skips its first run)

    const orbit = { radius: 360, theta: 0.5, phi: 1.15, drag: false, lx: 0, ly: 0, moved: 0, auto: true, t: 0 };
    const applyCam = () => { const r = orbit.radius; camera.position.set(r * Math.sin(orbit.phi) * Math.sin(orbit.theta), r * Math.cos(orbit.phi), r * Math.sin(orbit.phi) * Math.cos(orbit.theta)); camera.lookAt(0, 0, 0); };
    const el = renderer.domElement, ray = new THREE.Raycaster();
    const down = (e) => { orbit.drag = true; orbit.auto = false; orbit.lx = e.clientX; orbit.ly = e.clientY; orbit.moved = 0; };
    const move = (e) => { if (!orbit.drag) return; const dx = e.clientX - orbit.lx, dy = e.clientY - orbit.ly; orbit.moved += Math.abs(dx) + Math.abs(dy); orbit.theta -= dx * 0.005; orbit.phi = Math.max(0.2, Math.min(Math.PI - 0.2, orbit.phi - dy * 0.005)); orbit.lx = e.clientX; orbit.ly = e.clientY; };
    const up = (e) => { if (orbit.drag && orbit.moved < 6) { const r = el.getBoundingClientRect(); const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); const hit = ray.intersectObjects(pick, false)[0]; if (hit) { const k = hit.object.userData.city; if (byCity[k]) onSelectRef.current(byCity[k].members[0].id); } } orbit.drag = false; clearTimeout(orbit.tm); orbit.tm = setTimeout(() => { orbit.auto = true; }, 3000); };
    const wheel = (e) => { e.preventDefault(); orbit.radius = Math.max(170, Math.min(900, orbit.radius * (e.deltaY < 0 ? 0.9 : 1.1))); };
    el.addEventListener("pointerdown", down); window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); el.addEventListener("wheel", wheel, { passive: false });

    const t0 = performance.now(); let raf; const ease = (x) => 1 - Math.pow(1 - x, 3);
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const e = Math.min(1, (performance.now() - t0) / 1200); group.scale.setScalar(ease(e) * 0.999 + 0.001);
      if (orbit.auto && !orbit.drag) orbit.theta += 0.0016; if (e < 1) orbit.theta += 0.005; applyCam();
      const placed = []; const tmp = new THREE.Vector3(); const camN = camera.position.clone().normalize();
      const order = labels.slice().sort((a, b) => (b.d.isYou - a.d.isYou) || (b.d.count - a.d.count));
      for (const L of order) {
        tmp.copy(L.d.vec).multiplyScalar(group.scale.x);
        const faces = tmp.clone().normalize().dot(camN) > 0.12; tmp.project(camera);
        if (!faces || tmp.z > 1 || Math.abs(tmp.x) > 1.1 || Math.abs(tmp.y) > 1.1) { L.el.style.display = "none"; continue; }
        L.el.style.display = "block"; const w = L.el.offsetWidth, h = L.el.offsetHeight;
        const sx = (tmp.x * 0.5 + 0.5) * W, sy = (-tmp.y * 0.5 + 0.5) * H; const box = { x: sx - w / 2, y: sy - h - 10, w, h };
        let ov = false; for (const p of placed) { if (box.x < p.x + p.w && box.x + box.w > p.x && box.y < p.y + p.h && box.y + box.h > p.y) { ov = true; break; } }
        if (ov) { L.el.style.display = "none"; continue; }
        placed.push(box); L.el.style.transform = `translate(${box.x}px, ${box.y}px)`;
      }
      renderer.render(scene, camera);
    };
    applyCam(); animate();
    const onResize = () => { W = mount.clientWidth; H = mount.clientHeight; camera.aspect = W / H; camera.updateProjectionMatrix(); renderer.setSize(W, H); };
    window.addEventListener("resize", onResize);
    return () => { cancelAnimationFrame(raf); rebuildRef.current = null; window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("resize", onResize); el.removeEventListener("pointerdown", down); el.removeEventListener("wheel", wheel); if (labelLayer.parentNode === mount) mount.removeChild(labelLayer); try { scene.traverse((o) => { o.geometry?.dispose?.(); const mm = o.material; if (mm) (Array.isArray(mm) ? mm : [mm]).forEach((x) => { x.map?.dispose?.(); x.dispose?.(); }); }); } catch { /* ignore */ } renderer.dispose(); if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement); };
  }, []); // build once

  /* Rebuild only the content group when the family changes — camera/renderer untouched. */
  useEffect(() => { if (!builtRef.current) { builtRef.current = true; return; } rebuildRef.current?.(); }, [persons, parentOf, spouse, sibling, youId]);

  return (
    <div ref={mountRef} style={{ position: "absolute", inset: 0, touchAction: "none", cursor: "grab" }}>
      <div style={{ position: "absolute", top: 16, left: 16, display: "flex", gap: 8, flexWrap: "wrap", maxWidth: 240 }}>
        {[[t("stat_members"), stats.members], [t("stat_relations"), stats.relations], [t("stat_cities"), stats.cities], [t("stat_countries"), stats.countries]].map(([k, v]) => (
          <div key={k} style={{ background: "rgba(21,36,31,0.85)", border: `1px solid ${T.border}`, borderRadius: 12, padding: "8px 12px", backdropFilter: "blur(6px)" }}>
            <div style={{ fontFamily: mono, fontSize: 19, fontWeight: 700, color: T.gold, lineHeight: 1 }}>{v}</div>
            <div style={{ fontSize: 10.5, color: T.textSoft, textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 3 }}>{k}</div>
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", bottom: 18, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 16, alignItems: "center", background: "rgba(21,36,31,0.85)", border: `1px solid ${T.border}`, borderRadius: 999, padding: "8px 16px", fontSize: 12.5, color: T.textSoft, backdropFilter: "blur(6px)", pointerEvents: "none" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Globe size={14} color={T.gold} /> {t("globe_drag")}</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span>{t("globe_zoom")}</span>
      </div>
    </div>
  );
}

function ThreeView({ persons, parentOf, spouse, sibling, youId, onSelect }) {
  const mountRef = useRef(null);
  const onSelectRef = useRef(onSelect); useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  const dataRef = useRef(null); dataRef.current = { persons, parentOf, spouse, sibling, youId };
  const rebuildRef = useRef(null);
  const builtRef = useRef(false);

  /* Build renderer/scene/camera/orbit/animation ONCE on mount. Data-driven content
     (nodes, edges, labels) lives in a persistent group rebuilt by the data effect
     below, so the camera/orbit is never reset when the family changes. */
  useEffect(() => {
    const mount = mountRef.current; if (!mount) return;
    let W = mount.clientWidth, H = mount.clientHeight;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#070F0C");
    scene.fog = new THREE.FogExp2("#070F0C", 0.0014);
    const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 6000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(W, H);
    mount.appendChild(renderer.domElement);

    const group = new THREE.Group(); scene.add(group); // persistent; intro-scaled; holds rebuilt content
    let nodeMeshes = [];

    const makeLabel = (text, color) => {
      const c = document.createElement("canvas"); const ctx = c.getContext("2d"); const fs = 46;
      ctx.font = `600 ${fs}px Inter, sans-serif`; const w = Math.ceil(ctx.measureText(text).width);
      c.width = w + 24; c.height = fs + 18; ctx.font = `600 ${fs}px Inter, sans-serif`; ctx.fillStyle = color; ctx.textBaseline = "middle"; ctx.fillText(text, 12, c.height / 2);
      const tex = new THREE.CanvasTexture(c); tex.minFilter = THREE.LinearFilter;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
      const s = 0.13; sp.scale.set(c.width * s, c.height * s, 1); return sp;
    };
    const disposeChild = (o) => o.traverse?.((c) => { c.geometry?.dispose?.(); const mm = c.material; if (mm) (Array.isArray(mm) ? mm : [mm]).forEach((x) => { x.map?.dispose?.(); x.dispose?.(); }); });
    const clearGroup = () => { for (let i = group.children.length - 1; i >= 0; i--) { const o = group.children[i]; disposeChild(o); group.remove(o); } };

    const orbit = { radius: 520, theta: 0.6, phi: 1.12, ty: 0, drag: false, lx: 0, ly: 0, moved: 0, auto: true };
    let firstBuild = true;

    const rebuild = () => {
      const { persons, parentOf, spouse, sibling, youId } = dataRef.current;
      clearGroup();
      const idsOf = (arr, f) => arr.map(f);
      const parentsOf = (id) => idsOf(parentOf.filter((e) => e.c === id), (e) => e.p);
      const childrenOf = (id) => idsOf(parentOf.filter((e) => e.p === id), (e) => e.c);
      const spousesOf = (id) => parentOf && spouse.filter((e) => e.a === id || e.b === id).map((e) => e.a === id ? e.b : e.a);
      const sibsOf = (id) => sibling.filter((e) => e.a === id || e.b === id).map((e) => e.a === id ? e.b : e.a);

      /* generatieniveau t.o.v. 'jij' */
      const level = {}; const q = [[youId, 0]]; level[youId] = 0;
      while (q.length) {
        const [cur, lv] = q.shift();
        parentsOf(cur).forEach((p) => { if (!(p in level)) { level[p] = lv + 1; q.push([p, lv + 1]); } });
        childrenOf(cur).forEach((c) => { if (!(c in level)) { level[c] = lv - 1; q.push([c, lv - 1]); } });
        [...spousesOf(cur), ...sibsOf(cur)].forEach((s) => { if (!(s in level)) { level[s] = lv; q.push([s, lv]); } });
      }
      persons.forEach((p) => { if (!(p.id in level)) level[p.id] = -Math.round((p.cy || 0) / 230); });

      /* ring-layout per generatie */
      const byLevel = {}; persons.forEach((p) => { (byLevel[level[p.id]] = byLevel[level[p.id]] || []).push(p); });
      const pos = {};
      Object.keys(byLevel).forEach((lv) => {
        const arr = byLevel[lv].slice().sort((a, b) => (a.cx || 0) - (b.cx || 0));
        const n = arr.length; const radius = n === 1 ? 0 : 40 + n * 13; const yoff = Number(lv) * 78;
        arr.forEach((p, idx) => { const ang = (idx / Math.max(1, n)) * Math.PI * 2 + Number(lv) * 0.7; pos[p.id] = new THREE.Vector3(Math.cos(ang) * radius, yoff, Math.sin(ang) * radius); });
      });
      const levels = Object.keys(byLevel).map(Number); const centerY = (Math.max(...levels) + Math.min(...levels)) / 2 * 78;
      if (firstBuild) { orbit.ty = centerY; firstBuild = false; } // center camera on first build only

      const mkLine = (a, b, color, op) => { const g = new THREE.BufferGeometry().setFromPoints([pos[a], pos[b]]); const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: op }); group.add(new THREE.Line(g, m)); };
      parentOf.forEach((e) => { if (pos[e.p] && pos[e.c]) mkLine(e.p, e.c, 0x3a7a5e, 0.55); });
      spouse.forEach((e) => { if (pos[e.a] && pos[e.b]) mkLine(e.a, e.b, 0xc9912f, 0.5); });
      sibling.forEach((e) => { if (pos[e.a] && pos[e.b]) mkLine(e.a, e.b, 0x3a7a5e, 0.3); });

      const meshes = [];
      persons.forEach((p) => {
        const v = pos[p.id]; if (!v) return; const me = p.id === youId;
        const col = me ? 0xE8B24C : new THREE.Color(["#4FA3C7", "#C79A4F", "#C77FA8", "#6FB85C", "#9B7FD1", "#C77F5C"][p.id % 6]).getHex();
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(me ? 13 : 8, 20, 20), new THREE.MeshBasicMaterial({ color: col }));
        mesh.position.copy(v); mesh.userData.id = p.id; group.add(mesh); meshes.push(mesh);
        if (me) { const halo = new THREE.Mesh(new THREE.SphereGeometry(22, 20, 20), new THREE.MeshBasicMaterial({ color: 0xE8B24C, transparent: true, opacity: 0.18 })); halo.position.copy(v); group.add(halo); }
        const lab = makeLabel(fullName(p), me ? "#F6D690" : "#EAF2ED"); lab.position.set(v.x, v.y + (me ? 22 : 15), v.z); group.add(lab);
      });
      nodeMeshes = meshes;
    };
    rebuildRef.current = rebuild;
    rebuild(); // initial build (the data effect skips its first run)

    /* eigen orbit-besturing */
    const applyCam = () => { const r = orbit.radius; camera.position.set(r * Math.sin(orbit.phi) * Math.sin(orbit.theta), orbit.ty + r * Math.cos(orbit.phi), r * Math.sin(orbit.phi) * Math.cos(orbit.theta)); camera.lookAt(0, orbit.ty, 0); };
    const el = renderer.domElement;
    const down = (e) => { orbit.drag = true; orbit.auto = false; orbit.lx = e.clientX; orbit.ly = e.clientY; orbit.moved = 0; };
    const move = (e) => { if (!orbit.drag) return; const dx = e.clientX - orbit.lx, dy = e.clientY - orbit.ly; orbit.moved += Math.abs(dx) + Math.abs(dy); orbit.theta -= dx * 0.005; orbit.phi = Math.max(0.18, Math.min(Math.PI - 0.18, orbit.phi - dy * 0.005)); orbit.lx = e.clientX; orbit.ly = e.clientY; };
    const ray = new THREE.Raycaster();
    const up = (e) => { if (orbit.drag && orbit.moved < 6) { const r = el.getBoundingClientRect(); const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); const hit = ray.intersectObjects(nodeMeshes, false)[0]; if (hit) onSelectRef.current(hit.object.userData.id); } orbit.drag = false; clearTimeout(orbit.t); orbit.t = setTimeout(() => { orbit.auto = true; }, 3000); };
    const wheel = (e) => { e.preventDefault(); orbit.radius = Math.max(140, Math.min(1800, orbit.radius * (e.deltaY < 0 ? 0.9 : 1.1))); };
    el.addEventListener("pointerdown", down); window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); el.addEventListener("wheel", wheel, { passive: false });

    const t0 = performance.now(); let raf;
    const ease = (x) => 1 - Math.pow(1 - x, 3);
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const e = Math.min(1, (performance.now() - t0) / 1100); group.scale.setScalar(ease(e) * 0.999 + 0.001);
      if (orbit.auto && !orbit.drag) orbit.theta += 0.0018; if (e < 1) orbit.theta += 0.004;
      applyCam(); renderer.render(scene, camera);
    };
    applyCam(); animate();
    const onResize = () => { W = mount.clientWidth; H = mount.clientHeight; camera.aspect = W / H; camera.updateProjectionMatrix(); renderer.setSize(W, H); };
    window.addEventListener("resize", onResize);

    return () => { cancelAnimationFrame(raf); rebuildRef.current = null; window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("resize", onResize); el.removeEventListener("pointerdown", down); el.removeEventListener("wheel", wheel); try { scene.traverse((o) => { o.geometry?.dispose?.(); const mm = o.material; if (mm) (Array.isArray(mm) ? mm : [mm]).forEach((x) => { x.map?.dispose?.(); x.dispose?.(); }); }); } catch { /* ignore */ } renderer.dispose(); if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement); };
  }, []); // build once

  /* Rebuild only the content group when the family changes — camera/renderer untouched. */
  useEffect(() => { if (!builtRef.current) { builtRef.current = true; return; } rebuildRef.current?.(); }, [persons, parentOf, spouse, sibling, youId]);

  return (
    <div ref={mountRef} style={{ position: "absolute", inset: 0, touchAction: "none", cursor: "grab" }}>
      <div style={{ position: "absolute", bottom: 18, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 16, alignItems: "center", background: "rgba(21,36,31,0.85)", border: `1px solid ${T.border}`, borderRadius: 999, padding: "8px 16px", fontSize: 12.5, color: T.textSoft, backdropFilter: "blur(6px)", pointerEvents: "none", zIndex: 5 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Move size={14} color={T.gold} /> {t("view4d_drag")}</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span>{t("view4d_zoom")}</span>
      </div>
    </div>
  );
}

function IntroLoader() {
  const branches = [
    "M120,150 C100,110 96,80 110,40", "M120,150 C140,112 150,86 138,44",
    "M120,150 C92,128 66,116 40,118", "M120,150 C150,130 178,120 204,124",
    "M120,150 C108,124 86,104 64,72", "M120,150 C132,124 156,106 180,78",
  ];
  const leaves = [[110, 40], [138, 44], [40, 118], [204, 124], [64, 72], [180, 78]];
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "grid", placeItems: "center", background: `radial-gradient(120% 120% at 50% 40%, ${T.ground}, ${T.groundDeep})`, animation: "vw-fade .3s ease" }}>
      <div style={{ textAlign: "center" }}>
        <svg width="240" height="200" viewBox="0 0 240 200" style={{ transformOrigin: "120px 150px", animation: "vw-twist 1.8s cubic-bezier(.2,.7,.2,1) forwards" }}>
          {branches.map((d, i) => (
            <path key={i} d={d} fill="none" stroke={i % 2 ? T.gold : T.green} strokeWidth="3" strokeLinecap="round" pathLength="100"
              style={{ strokeDasharray: 100, strokeDashoffset: 100, animation: `vw-draw 1.1s ease forwards ${(0.2 + i * 0.12).toFixed(2)}s` }} />
          ))}
          {leaves.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="7" fill={i % 2 ? T.gold : T.green} style={{ transformOrigin: `${x}px ${y}px`, opacity: 0, animation: `vw-leaf .5s ease forwards ${(0.9 + i * 0.1).toFixed(2)}s` }} />
          ))}
          <circle cx="120" cy="150" r="13" fill={T.gold} style={{ transformOrigin: "120px 150px", animation: "vw-pulse 1.6s ease-in-out infinite" }} />
        </svg>
        <div style={{ fontFamily: serif, fontSize: 34, fontWeight: 600, color: T.text, letterSpacing: "-0.02em", opacity: 0, animation: "vw-fade .8s ease forwards 1s" }}>MyFam</div>
        <div style={{ fontSize: 13, color: T.textSoft, marginTop: 4, opacity: 0, animation: "vw-fade .8s ease forwards 1.3s" }}>{t("growing")}</div>
      </div>
    </div>
  );
}

function Logo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-label="MyFam">
      <rect width="32" height="32" rx="9" fill="#15241F" stroke="rgba(234,242,237,0.12)" />
      <path d="M16 15.5 L16 8 M16 15.5 L8.5 24 M16 15.5 L23.5 24" stroke="#3FB985" strokeWidth="2.1" strokeLinecap="round" />
      <circle cx="16" cy="8" r="3.7" fill="#E8B24C" />
      <circle cx="8.5" cy="24" r="2.9" fill="#3FB985" />
      <circle cx="23.5" cy="24" r="2.9" fill="#3FB985" />
    </svg>
  );
}

function IconBtn({ children, ...rest }) {
  return (
    <button {...rest} style={{ width: 34, height: 34, display: "grid", placeItems: "center", border: "none", background: "transparent", borderRadius: 999, cursor: "pointer", color: T.text }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.07)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
      {children}
    </button>
  );
}
const pill = (bg, color) => ({ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 15px", background: bg, color, border: "none", borderRadius: 999, fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: sans });

function Node({ p, index, revealed, selected, hot, dragging, onDragStart }) {
  const age = ageFrom(p.birth);
  const popStyle = !revealed ? { animation: `vw-pop .55s cubic-bezier(.2,.8,.2,1) both ${(0.5 + index * 0.05).toFixed(2)}s` } : undefined;
  const common = { position: "absolute", left: p.cx, top: p.cy, transform: "translate(-50%,-50%)", cursor: "grab", zIndex: dragging ? 30 : selected ? 6 : 5, touchAction: "none" };
  if (p.isYou) {
    return (
      <div onPointerDown={(e) => onDragStart(p.id, e)} style={{ ...common, textAlign: "center", ...popStyle }}>
        <div style={{ width: 96, height: 96, borderRadius: "50%", margin: "0 auto", background: `radial-gradient(circle at 35% 30%, #F6D690, ${T.gold})`, display: "grid", placeItems: "center", color: T.groundDeep, fontFamily: serif, fontWeight: 600, fontSize: 30, boxShadow: `0 0 0 4px rgba(232,178,76,0.22), 0 0 40px rgba(232,178,76,0.55)`, outline: selected ? "3px solid #fff" : "none", outlineOffset: 3 }}>{initials(p)}</div>
        <div style={{ marginTop: 8, color: T.text, fontFamily: serif, fontWeight: 600, fontSize: 15 }}>{fullName(p)}</div>
        <div style={{ color: T.textSoft, fontSize: 11.5, fontFamily: mono }}>{t("youLower")} · {p.city}</div>
      </div>
    );
  }
  return (
    <div onPointerDown={(e) => onDragStart(p.id, e)} style={{ ...common, width: NODE_W, background: p.connector ? "rgba(30,47,41,0.6)" : T.surfaceUp, borderRadius: 14, padding: "10px 12px", border: p.connector ? `1.5px dashed ${T.textSoft}` : `1px solid ${T.border}`, boxShadow: hot ? `0 0 0 2px ${T.gold}, 0 10px 26px rgba(0,0,0,0.5)` : selected ? `0 0 0 2px ${T.green}, 0 10px 22px rgba(0,0,0,0.45)` : "0 8px 18px rgba(0,0,0,0.4)", display: "flex", gap: 10, alignItems: "center", ...popStyle }}>
      <div style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0, background: p.connector ? T.textSoft : colorFor(p), color: "#0A1512", display: "grid", placeItems: "center", fontFamily: serif, fontWeight: 600, fontSize: 15 }}>{p.connector ? "?" : initials(p)}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: serif, fontWeight: 600, fontSize: 14, color: T.text, lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontStyle: p.connector ? "italic" : "normal" }}>{p.connector ? p.first : fullName(p)}</div>
        <div style={{ fontSize: 11, color: T.textSoft, fontFamily: mono }}>{p.connector ? t("connectorTodo") : `${age != null ? t("ageShort", { n: age }) : "—"} · ${p.city}`}</div>
      </div>
    </div>
  );
}

function Field({ icon, value, href }) {
  if (!value) return null;
  const inner = (<><span style={{ color: T.textSoft, display: "grid", placeItems: "center" }}>{icon}</span><span style={{ textDecoration: href ? "underline" : "none" }}>{value}</span></>);
  if (href) return <a href={href} target="_blank" rel="noreferrer" onPointerDown={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, color: T.green, textDecoration: "none", fontWeight: 500 }}>{inner}</a>;
  return <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, color: T.text }}>{inner}</div>;
}

function DetailCard({ p, isMe, onAdd, onClose, onVerify }) {
  const age = ageFrom(p.birth);
  return (
    <div onPointerDown={(e) => e.stopPropagation()} style={{ position: "absolute", left: 16, bottom: 16, width: 290, background: T.surface, borderRadius: 18, padding: 18, border: `1px solid ${T.border}`, boxShadow: "0 18px 50px rgba(0,0,0,0.55)", zIndex: 20 }}>
      <button onClick={onClose} style={closeX}><X size={16} /></button>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ width: 50, height: 50, borderRadius: "50%", background: isMe ? T.gold : colorFor(p), color: "#0A1512", display: "grid", placeItems: "center", fontFamily: serif, fontWeight: 600, fontSize: 19 }}>{initials(p)}</div>
        <div>
          <div style={{ fontFamily: serif, fontWeight: 600, fontSize: 18, color: T.text, display: "flex", alignItems: "center", gap: 6 }}>{fullName(p)}{p.fbVerified && <span title={t("fbVerifiedTitle")} style={{ display: "inline-grid", placeItems: "center", width: 17, height: 17, borderRadius: "50%", background: "#1877F2", color: "#fff" }}><Check size={11} strokeWidth={3} /></span>}</div>
          {isMe && <span style={{ fontSize: 11, color: T.gold, fontWeight: 600, fontFamily: mono }}>{t("youAre")}</span>}
        </div>
      </div>
      <div style={{ height: 1, background: T.border, margin: "14px 0" }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        <Field icon={<Calendar size={15} />} value={p.birth ? `${p.birth}${age != null ? `  ·  ${t("ageLong", { n: age })}` : ""}` : null} />
        <Field icon={<MapPin size={15} />} value={p.city} />
        <Field icon={<Baby size={15} />} value={p.birthCity ? t("bornIn", { city: p.birthCity }) : null} />
        <Field icon={<Mail size={15} />} value={p.email} />
        <Field icon={<Phone size={15} />} value={p.phone} />
        <Field icon={<Instagram size={15} />} value={p.insta ? `@${p.insta}` : null} href={p.insta ? `https://instagram.com/${p.insta}` : null} />
        <Field icon={<Facebook size={15} />} value={p.fb ? `/${p.fb}` : null} href={p.fb ? `https://facebook.com/${p.fb}` : null} />
      </div>
      {p.fb && !p.fbVerified && <button onClick={() => onVerify(p.id)} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", marginTop: 14, padding: "9px 12px", background: "#1877F2", color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: sans }}><Facebook size={16} /> {t("verifyFb")}</button>}
      <button onClick={onAdd} style={{ ...pill(T.green, "#06140F"), width: "100%", justifyContent: "center", marginTop: 10 }}><UserPlus size={16} /> {t("addRelative")}</button>
    </div>
  );
}

function PersonFields({ f, set }) {
  return (
    <>
      <div style={{ display: "flex", gap: 10 }}>
        <Input label={t("field_first")} value={f.first} onChange={set("first")} placeholder={t("ph_first")} />
        <Input label={t("field_last")} value={f.last} onChange={set("last")} placeholder={t("ph_last")} />
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <Input label={t("field_birth")} type="date" value={f.birth} onChange={set("birth")} />
        <Input label={t("field_city")} value={f.city} onChange={set("city")} placeholder={t("ph_city")} />
      </div>
      <Input label={t("field_birthCity")} value={f.birthCity} onChange={set("birthCity")} placeholder={t("ph_birthCity")} />
      <Input label={t("field_email")} value={f.email} onChange={set("email")} placeholder={t("ph_email")} />
      <div style={{ display: "flex", gap: 10 }}>
        <Input label={t("field_insta")} value={f.insta} onChange={set("insta")} placeholder={t("ph_username")} />
        <Input label={t("field_fb")} value={f.fb} onChange={set("fb")} placeholder={t("ph_username")} />
      </div>
    </>
  );
}

function AddPanel({ anchor, persons, onClose, onSubmit }) {
  const [f, setF] = useState({ kind: "ouder", first: "", last: anchor.last, birth: "", city: "", birthCity: "", email: "", insta: "", fb: "", gender: "" });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const kinds = ["grootouder", "ouder", "oom/tante", "broer/zus", "partner", "neef/nicht", "kind", "kleinkind"];
  const suggestions = (f.first.length >= 2 && f.last.length >= 2) ? persons.filter((p) => p.id !== anchor.id && rel.nameMatch(f.first, f.last, p.first, p.last)) : [];
  return (
    <Modal title={t("addTitle", { name: anchor.first })} onClose={onClose}>
      <label style={lbl}>{t("relationTo", { name: anchor.first })}</label>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {kinds.map((k) => <button key={k} onClick={() => setF((s) => ({ ...s, kind: k }))} style={{ padding: "7px 13px", borderRadius: 999, border: `1px solid ${f.kind === k ? T.green : T.border}`, background: f.kind === k ? T.green : T.surfaceUp, color: f.kind === k ? "#06140F" : T.text, fontSize: 13, fontWeight: 500, cursor: "pointer", textTransform: "capitalize" }}>{t("kind_" + k)}</button>)}
      </div>
      <PersonFields f={f} set={set} />
      {suggestions.length > 0 && (
        <div style={{ background: "rgba(232,178,76,0.10)", border: `1px solid ${T.gold}`, borderRadius: 12, padding: 12, marginTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 600, color: T.gold, marginBottom: 8 }}><Sparkles size={15} /> {t("maybeExists")}</div>
          {suggestions.map((p) => (
            <button key={p.id} onClick={() => onSubmit(f, p)} style={{ display: "flex", width: "100%", alignItems: "center", gap: 10, padding: "8px 6px", border: "none", borderTop: `1px solid ${T.border}`, background: "transparent", cursor: "pointer", textAlign: "left" }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: colorFor(p), color: "#0A1512", display: "grid", placeItems: "center", fontSize: 12, fontFamily: serif }}>{initials(p)}</div>
              <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{fullName(p)}</div><div style={{ fontSize: 11, color: T.textSoft, fontFamily: mono }}>{p.city}{p.birth ? ` · ${p.birth.slice(0, 4)}` : ""}</div></div>
              <span style={{ fontSize: 12, color: T.green, fontWeight: 600 }}>{t("link")}</span>
            </button>
          ))}
        </div>
      )}
      <button onClick={() => f.first && f.last && onSubmit(f, null)} disabled={!f.first || !f.last} style={{ ...pill(T.gold, "#06140F"), width: "100%", justifyContent: "center", marginTop: 16, opacity: (!f.first || !f.last) ? 0.4 : 1 }}><Plus size={16} /> {t("addToTree")}</button>
    </Modal>
  );
}

function FreeAddPanel({ onClose, onSubmit }) {
  const [f, setF] = useState({ first: "", last: "", birth: "", city: "", birthCity: "", email: "", insta: "", fb: "", gender: "" });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  return (
    <Modal title={t("newPerson")} onClose={onClose}>
      <p style={{ fontSize: 13, color: T.textSoft, marginTop: 0, lineHeight: 1.5 }}>{t("freeDesc")}</p>
      <PersonFields f={f} set={set} />
      <button onClick={() => f.first && f.last && onSubmit(f)} disabled={!f.first || !f.last} style={{ ...pill(T.green, "#06140F"), width: "100%", justifyContent: "center", marginTop: 16, opacity: (!f.first || !f.last) ? 0.4 : 1 }}><Plus size={16} /> {t("placeOnField")}</button>
    </Modal>
  );
}

function ConnectPanel({ onClose, onConnect }) {
  const [q, setQ] = useState("");
  const examples = ["mohammed", "tarek", "kamal", "Mohamed Hussain"];
  return (
    <Modal title={t("connectTitle")} onClose={onClose}>
      <p style={{ fontSize: 13.5, color: T.textSoft, marginTop: 0, lineHeight: 1.5 }}>{t("connectDesc")}</p>
      <div style={{ display: "flex", gap: 10, margin: "14px 0" }}>
        <Tile icon={<QrCode size={22} />} label={t("qrScan")} /><Tile icon={<Smartphone size={22} />} label={t("phoneTap")} />
      </div>
      <Input label={t("searchName")} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ph_search")} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>{examples.map((x) => <button key={x} onClick={() => setQ(x)} style={chip}>{x}</button>)}</div>
      <button onClick={() => onConnect(q)} disabled={!q.trim()} style={{ ...pill(T.green, "#06140F"), width: "100%", justifyContent: "center", marginTop: 16, opacity: q.trim() ? 1 : 0.4 }}><Search size={16} /> {t("findRel")}</button>
    </Modal>
  );
}

function SharePanel({ me, onClose }) {
  const link = `https://myfam.app/u/${me.username}`;
  const text = encodeURIComponent(t("shareText", { link }));
  const [copied, setCopied] = useState(false);
  return (
    <Modal title={t("shareTitle")} onClose={onClose}>
      <p style={{ fontSize: 13.5, color: T.textSoft, marginTop: 0 }}>{t("shareDesc")}</p>
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.surfaceUp, border: `1px solid ${T.border}`, borderRadius: 12, padding: "10px 12px", margin: "12px 0" }}>
        <Link2 size={16} color={T.textSoft} /><span style={{ flex: 1, fontFamily: mono, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: T.text }}>{link}</span>
        <button onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }} style={{ border: "none", background: T.green, color: "#06140F", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{copied ? t("copied") : t("copy")}</button>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <a href={`https://wa.me/?text=${text}`} target="_blank" rel="noreferrer" style={{ ...shareTile, background: "#25D366" }}><MessageCircle size={20} /> WhatsApp</a>
        <a href={`https://wa.me/?text=${text}`} target="_blank" rel="noreferrer" style={{ ...shareTile, background: "#128C7E" }}><Users size={20} /> Status</a>
        <button onClick={() => navigator.clipboard?.writeText(link)} style={{ ...shareTile, background: "linear-gradient(45deg,#F58529,#DD2A7B,#8134AF)", border: "none", cursor: "pointer", color: "#fff" }}><Instagram size={20} /> Story</button>
      </div>
    </Modal>
  );
}

function VerifyModal({ person, onCancel, onConfirm }) {
  if (!person) return null;
  return (
    <div onPointerDown={(e) => e.stopPropagation()} style={{ position: "absolute", inset: 0, background: "rgba(4,8,6,0.6)", display: "grid", placeItems: "center", zIndex: 60 }}>
      <div style={{ width: 340, background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 24px 70px rgba(0,0,0,0.6)", fontFamily: sans }}>
        <div style={{ background: "#1877F2", color: "#fff", padding: "14px 18px", display: "flex", alignItems: "center", gap: 9 }}><Facebook size={20} /> <span style={{ fontWeight: 600 }}>{t("fbLogin")}</span></div>
        <div style={{ padding: 20, color: "#1B2622" }}>
          <div style={{ fontSize: 14, lineHeight: 1.55 }}><b>MyFam</b> {t("fbWants")}
            <div style={{ margin: "12px 0", padding: "10px 12px", background: "#F0F2F5", borderRadius: 10, fontSize: 13 }}>{t("fbScope")}</div>
            {t("fbAssure")}</div>
          <div style={{ marginTop: 12, fontSize: 11, color: "#5C6B63", fontFamily: mono, lineHeight: 1.5 }}>{t("fbDemo")}</div>
          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <button onClick={onCancel} style={{ flex: 1, padding: 10, border: "1px solid #ddd", background: "#fff", borderRadius: 10, fontSize: 13.5, fontWeight: 600, cursor: "pointer", color: "#1B2622" }}>{t("cancel")}</button>
            <button onClick={onConfirm} style={{ flex: 1, padding: 10, border: "none", background: "#1877F2", color: "#fff", borderRadius: 10, fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>{t("continueAs", { name: person.first })}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Toast({ toast, onClose }) {
  let body;
  if (toast.type === "invite") {
    const p = toast.person, inv = toast.inviter, age = ageFrom(p.birth);
    body = (<>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: T.green, fontWeight: 600, fontSize: 13 }}><Mail size={16} /> {t("inviteSent", { email: p.email })}</div>
      <div style={{ marginTop: 10, background: T.surfaceUp, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, fontSize: 13, lineHeight: 1.55, color: T.text }}>
        <div style={{ fontFamily: serif, fontWeight: 600, fontSize: 15, marginBottom: 6 }}>{t("inviteHead")}</div>
        {t("inviteBy", { inviter: fullName(inv), kind: t("kind_" + toast.kind) })}
        <div style={{ marginTop: 8, padding: "8px 10px", background: "rgba(232,178,76,0.10)", borderRadius: 8, fontFamily: mono, fontSize: 12 }}>{fullName(p)}{age != null ? ` · ${t("ageShort", { n: age })}` : ""}{p.city ? ` · ${p.city}` : ""}</div>
        <div style={{ marginTop: 8, color: T.textSoft }}>{t("inviteRecognize")}</div>
        <div style={{ display: "inline-block", marginTop: 10, background: T.green, color: "#06140F", padding: "7px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 600 }}>{t("inviteCta")}</div>
      </div></>);
  } else if (toast.type === "rel") {
    const p = toast.person;
    body = (<>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: T.gold, fontWeight: 600, fontSize: 13 }}><Sparkles size={16} /> {t("relFound")}</div>
      <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.55, color: T.text }}>{t("relYouAnd", { name: fullName(p), label: toast.rel.label })}{toast.viaName ? t("relVia", { via: toast.viaName }) : "."}</div>
      <div style={{ marginTop: 8, fontSize: 12, color: T.textSoft, fontFamily: mono }}>{t("relSteps", { n: toast.path.length })}</div></>);
  } else if (toast.type === "connected") {
    const r = toast.relation;
    body = <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: T.text }}><Link2 size={16} color={T.gold} /> {t("connectedToast", { from: toast.from.first, rel: t("rel_" + (r === "ouder" ? "parentOf" : r === "kind" ? "childOf" : "partnerOf"), { name: toast.to.first }) })}</div>;
  } else if (toast.type === "free") {
    body = <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: T.text }}><Move size={16} color={T.green} /> {t("freeToast", { name: toast.person.first })}</div>;
  } else if (toast.type === "merged") {
    body = <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: T.text }}><Check size={16} color={T.green} /> {t("mergedToast")}</div>;
  } else if (toast.type === "verified") {
    body = <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: T.text }}><span style={{ display: "inline-grid", placeItems: "center", width: 18, height: 18, borderRadius: "50%", background: "#1877F2", color: "#fff" }}><Check size={11} strokeWidth={3} /></span> {t("verifiedToast", { name: fullName(toast.person) })}</div>;
  } else {
    body = <div style={{ fontSize: 13.5, color: T.text }}>{t("notFound", { q: toast.q })}</div>;
  }
  return (
    <div style={{ position: "absolute", right: 16, bottom: 16, width: 320, background: T.surface, borderRadius: 16, padding: 16, border: `1px solid ${T.border}`, boxShadow: "0 18px 50px rgba(0,0,0,0.6)", zIndex: 40 }}>
      <button onClick={onClose} style={closeX}><X size={16} /></button>{body}
    </div>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div onPointerDown={(e) => e.stopPropagation()} style={{ position: "absolute", top: 16, right: 16, width: 340, maxHeight: "calc(100% - 32px)", overflowY: "auto", background: T.surface, borderRadius: 18, padding: 20, border: `1px solid ${T.border}`, boxShadow: "0 22px 60px rgba(0,0,0,0.6)", zIndex: 35 }}>
      <button onClick={onClose} style={closeX}><X size={16} /></button>
      <h3 style={{ fontFamily: serif, fontSize: 19, fontWeight: 600, margin: "0 0 14px", color: T.text }}>{title}</h3>{children}
    </div>
  );
}
function Input({ label, ...rest }) {
  return (
    <label style={{ display: "block", flex: 1, marginTop: 10 }}>
      <span style={lbl}>{label}</span>
      <input {...rest} style={{ width: "100%", boxSizing: "border-box", padding: "9px 11px", border: `1px solid ${T.border}`, borderRadius: 10, fontSize: 13.5, fontFamily: sans, background: T.surfaceUp, color: T.text, outline: "none" }}
        onFocus={(e) => (e.target.style.borderColor = T.green)} onBlur={(e) => (e.target.style.borderColor = T.border)} />
    </label>
  );
}
function Tile({ icon, label }) {
  return <div style={{ flex: 1, border: `1px dashed ${T.border}`, borderRadius: 12, padding: "16px 8px", display: "grid", placeItems: "center", gap: 6, color: T.textSoft }}>{icon}<span style={{ fontSize: 12, fontWeight: 500 }}>{label}</span></div>;
}
const lbl = { display: "block", fontSize: 11.5, fontWeight: 600, color: T.textSoft, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em" };
const closeX = { position: "absolute", top: 12, right: 12, width: 28, height: 28, display: "grid", placeItems: "center", border: "none", background: "rgba(255,255,255,0.07)", borderRadius: 999, cursor: "pointer", color: T.text };
const chip = { padding: "5px 11px", borderRadius: 999, border: `1px solid ${T.border}`, background: T.surfaceUp, fontSize: 12, cursor: "pointer", color: T.text, fontFamily: mono };
const shareTile = { flex: 1, color: "#fff", borderRadius: 12, padding: "12px 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, textDecoration: "none", border: "none" };

/* ---------- admin: user management (admin role only) ---------- */
const miniBtn = { border: "none", borderRadius: 999, padding: "5px 11px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: mono };
function AdminPanel({ onClose }) {
  const [users, setUsers] = useState(null);
  const [err, setErr] = useState(null);
  const load = () => api.adminUsers().then((d) => setUsers(d.users)).catch((e) => setErr(e.message || "failed to load users"));
  useEffect(() => { load(); }, []);
  const toggle = (u, field) => {
    const next = field === "paid" ? (u.paid ? 0 : 1) : u.role === "admin" ? "user" : "admin";
    api.adminUpdateUser(u.id, { [field]: next }).then(load).catch(() => {});
  };
  return (
    <Modal title="Admin · users" onClose={onClose}>
      {err && <div style={{ fontSize: 13, color: "#E88A8A" }}>{err}</div>}
      {!users && !err && <div style={{ fontSize: 13, color: T.textSoft }}>Loading…</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
        {users && users.map((u) => (
          <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: T.surfaceUp, border: `1px solid ${T.border}`, borderRadius: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</div>
              <div style={{ fontSize: 11, color: T.textSoft, fontFamily: mono }}>#{u.id}</div>
            </div>
            <button onClick={() => toggle(u, "role")} style={{ ...miniBtn, background: u.role === "admin" ? T.gold : T.surface, color: u.role === "admin" ? "#06140F" : T.textSoft }}>{u.role}</button>
            <button onClick={() => toggle(u, "paid")} style={{ ...miniBtn, background: u.paid ? T.green : T.surface, color: u.paid ? "#06140F" : T.textSoft }}>{u.paid ? "paid" : "free"}</button>
          </div>
        ))}
      </div>
    </Modal>
  );
}
