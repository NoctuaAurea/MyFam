/* MyFam — pure relationship / kinship engine over the edge lists.
 * No React, no i18n, no Three.js: every function is pure given its arguments,
 * which makes the cleverest logic in the app unit-testable (see relationships.test.js).
 * `relationship()` takes a translate fn `t` so callers own the labels (tests pass a stub). */

/* ---------- fuzzy name matching / transliteration ---------- */
export const normalize = (s = "") =>
  s.toLowerCase().trim().normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/ou|oe/g, "u").replace(/kh|ch/g, "k").replace(/ph/g, "f")
    .replace(/y/g, "i").replace(/w/g, "v").replace(/q/g, "k")
    .replace(/(.)\1+/g, "$1").replace(/[^a-z]/g, "");

export const lev = (a, b) => {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
};

export const nameMatch = (f1, l1, f2, l2) =>
  lev(normalize(f1), normalize(f2)) <= 1 && lev(normalize(l1), normalize(l2)) <= 1;

/* ---------- graph over parentOf / spouse / sibling edge lists ---------- */
export const parentsOf = (parentOf, id) => parentOf.filter((e) => e.c === id).map((e) => e.p);

export const hasEdge = (parentOf, spouse, sibling, a, b) =>
  parentOf.some((e) => (e.p === a && e.c === b) || (e.p === b && e.c === a)) ||
  spouse.some((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a)) ||
  sibling.some((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));

export const ancestors = (parentOf, id) => { const out = new Map(); const q = [[id, 0]]; while (q.length) { const [c, d] = q.shift(); parentsOf(parentOf, c).forEach((p) => { if (!out.has(p) || out.get(p) > d + 1) { out.set(p, d + 1); q.push([p, d + 1]); } }); } return out; };

export const adjacency = (parentOf, spouse, sibling) => { const adj = {}; const add = (a, b) => { (adj[a] = adj[a] || []).push(b); }; parentOf.forEach((e) => { add(e.p, e.c); add(e.c, e.p); }); spouse.forEach((e) => { add(e.a, e.b); add(e.b, e.a); }); sibling.forEach((e) => { add(e.a, e.b); add(e.b, e.a); }); return adj; };

export const bfsPath = (parentOf, spouse, sibling, src, dst) => { const adj = adjacency(parentOf, spouse, sibling); const prev = { [src]: null }; const q = [src]; while (q.length) { const c = q.shift(); if (c === dst) break; (adj[c] || []).forEach((n) => { if (!(n in prev)) { prev[n] = c; q.push(n); } }); } if (!(dst in prev)) return null; const path = []; let c = dst; while (c !== null && c !== undefined) { path.unshift(c); c = prev[c]; } return path[0] === src ? path : null; };

export const relationship = (parentOf, spouse, sibling, idA, idB, t) => {
  if (idA === idB) return { label: t("rel_same"), via: null };
  if (spouse.some((e) => (e.a === idA && e.b === idB) || (e.a === idB && e.b === idA))) return { label: t("rel_partners"), via: null };
  if (sibling.some((e) => (e.a === idA && e.b === idB) || (e.a === idB && e.b === idA))) return { label: t("rel_siblings"), via: null };
  const aA = ancestors(parentOf, idA); aA.set(idA, 0); const aB = ancestors(parentOf, idB); aB.set(idB, 0);
  let best = null; aA.forEach((da, anc) => { if (aB.has(anc)) { const s = da + aB.get(anc); if (!best || s < best.s) best = { anc, da, db: aB.get(anc), s }; } });
  if (best) {
    const { anc, da, db } = best;
    const up = ["", t("up_1"), t("up_2"), t("up_3"), t("up_4")], down = ["", t("down_1"), t("down_2"), t("down_3")];
    if (da === 0) return { label: `${up[db] || t("up_1")} ${t("and")} ${down[db] || t("down_1")}`, via: anc };
    if (db === 0) return { label: `${up[da] || t("up_1")} ${t("and")} ${down[da] || t("down_1")}`, via: anc };
    if (da === 1 && db === 1) return { label: t("rel_siblings"), via: anc };
    const mn = Math.min(da, db);
    if (mn === 1) return { label: t("rel_uncle"), via: anc };
    if (da === 2 && db === 2) return { label: t("rel_cousins1"), via: anc };
    return { label: t("rel_cousinsDeg", { n: mn }), via: anc };
  }
  return { label: t("rel_none"), via: null };
};

/* ---------- kinship titles (richer, gendered terms relative to one person) ---------- */
// Classify how `toId` relates to `fromId` via their lowest common ancestor.
export function kinship(parentOf, spouse, sibling, fromId, toId) {
  if (fromId === toId) return { kind: "same" };
  if (spouse.some((e) => (e.a === fromId && e.b === toId) || (e.a === toId && e.b === fromId))) return { kind: "partner" };
  const aA = ancestors(parentOf, fromId); aA.set(fromId, 0);
  const aB = ancestors(parentOf, toId); aB.set(toId, 0);
  let best = null;
  aA.forEach((da, anc) => { if (aB.has(anc)) { const s = da + aB.get(anc); if (!best || s < best.s) best = { anc, da, db: aB.get(anc), s }; } });
  if (sibling.some((e) => (e.a === fromId && e.b === toId) || (e.a === toId && e.b === fromId)))
    return { kind: "sibling", via: best ? best.anc : null };
  if (!best) return { kind: "none" };
  const { anc, da, db } = best;
  if (da === 0) return { kind: "descendant", depth: db, via: anc };
  if (db === 0) return { kind: "ancestor", depth: da, via: anc };
  if (da === 1 && db === 1) return { kind: "sibling", via: anc };
  if (Math.min(da, db) === 1) return da === 1 ? { kind: "nibling", depth: db, via: anc } : { kind: "pibling", depth: da, via: anc };
  return { kind: "cousin", degree: Math.min(da, db), removed: Math.abs(da - db), via: anc };
}

const repeat = (s, n) => (n > 0 ? s.repeat(n) : "");

// Dutch: uses the over-/betover- (ancestors) and achter-/oud- (descendants, collaterals) prefixes.
function nlTitle(k, g) {
  const pick = (m, f, n) => (g === "m" ? m : g === "v" ? f : n);
  switch (k.kind) {
    case "same": return "jij";
    case "partner": return "partner";
    case "sibling": return pick("broer", "zus", "broer/zus");
    case "ancestor": { const d = k.depth;
      if (d === 1) return pick("vader", "moeder", "ouder");
      if (d === 2) return pick("opa", "oma", "grootouder");
      if (d === 3) return "overgrootouder";
      if (d === 4) return "betovergrootouder";
      return `voorouder (${d}e generatie)`; }
    case "descendant": { const d = k.depth;
      if (d === 1) return pick("zoon", "dochter", "kind");
      if (d === 2) return pick("kleinzoon", "kleindochter", "kleinkind");
      return repeat("achter", d - 2) + "kleinkind"; }       // 3=achterkleinkind, 4=achterachterkleinkind
    case "pibling": return repeat("oud", k.depth - 2) + pick("oom", "tante", "oom/tante"); // 2=oom, 3=oudoom
    case "nibling": return repeat("achter", k.depth - 2) + pick("neef", "nicht", "neef/nicht"); // 2=neef, 3=achterneef
    case "cousin": { const base = repeat("achter", k.degree - 2) + pick("neef", "nicht", "neef/nicht"); // 2=neef, 3=achterneef, 4=achterachterneef
      return k.removed > 0 ? `${base} (${k.removed}× verwijderd)` : base; }
    default: return null;
  }
}

const ordEn = (n) => ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"][n] || `${n}th`;
function enTitle(k, g) {
  const pick = (m, f, n) => (g === "m" ? m : g === "v" ? f : n);
  switch (k.kind) {
    case "same": return "you";
    case "partner": return "partner";
    case "sibling": return pick("brother", "sister", "sibling");
    case "ancestor": { const d = k.depth;
      if (d === 1) return pick("father", "mother", "parent");
      if (d === 2) return pick("grandfather", "grandmother", "grandparent");
      return repeat("great-", d - 2) + "grandparent"; }
    case "descendant": { const d = k.depth;
      if (d === 1) return pick("son", "daughter", "child");
      if (d === 2) return pick("grandson", "granddaughter", "grandchild");
      return repeat("great-", d - 2) + "grandchild"; }
    case "pibling": return repeat("great-", k.depth - 2) + pick("uncle", "aunt", "uncle/aunt");
    case "nibling": return repeat("great-", k.depth - 2) + pick("nephew", "niece", "nephew/niece");
    case "cousin": { const c = `${ordEn(k.degree - 1)} cousin`;
      return k.removed > 0 ? `${c} ${k.removed}× removed` : c; }
    default: return null;
  }
}

// Localized kinship title of `toId` relative to `fromId`. Rich for nl/en; other
// languages fall back to the basic relationship() label.
export function kinshipTitle(parentOf, spouse, sibling, fromId, toId, gender, lang, t) {
  const k = kinship(parentOf, spouse, sibling, fromId, toId);
  if (k.kind === "none") return null;
  if (lang === "nl") return nlTitle(k, gender);
  if (lang === "en") return enTitle(k, gender);
  return relationship(parentOf, spouse, sibling, fromId, toId, t).label;
}
