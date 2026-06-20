import { describe, it, expect } from "vitest";
import { normalize, lev, nameMatch, parentsOf, ancestors, hasEdge, bfsPath, relationship, kinshipTitle } from "./relationships.js";

// Stub translator: returns the key (with {n} appended) so tests assert the chosen
// classification rather than locale wording.
const t = (key, vars) => (vars && "n" in vars ? `${key}(${vars.n})` : key);

// Graph A — nuclear family: 1 & 2 are partners and parents of 3 & 4.
const A = { parentOf: [{ p: 1, c: 3 }, { p: 2, c: 3 }, { p: 1, c: 4 }, { p: 2, c: 4 }], spouse: [{ a: 1, b: 2 }], sibling: [] };
// Graph B — three generations: 10 -> 11,12 ; 11 -> 21 ; 12 -> 22.
const B = { parentOf: [{ p: 10, c: 11 }, { p: 10, c: 12 }, { p: 11, c: 21 }, { p: 12, c: 22 }], spouse: [], sibling: [] };
// Graph C — four generations (for second cousins): 100 -> 101,102 ; 101->111 ; 102->112 ; 111->121 ; 112->122.
const C = { parentOf: [{ p: 100, c: 101 }, { p: 100, c: 102 }, { p: 101, c: 111 }, { p: 102, c: 112 }, { p: 111, c: 121 }, { p: 112, c: 122 }], spouse: [], sibling: [] };

describe("normalize", () => {
  it("lowercases, strips accents and non-letters", () => {
    expect(normalize("José")).toBe("jose");
    expect(normalize("  Müller! ")).toBe("muler");
    expect(normalize("")).toBe("");
  });
  it("applies transliteration collapses", () => {
    expect(normalize("Khaled")).toBe("kaled"); // kh -> k
    expect(normalize("Philip")).toBe("filip");  // ph -> f
    expect(normalize("Wahid")).toBe("vahid");   // w -> v
  });
  it("collapses doubled letters", () => {
    expect(normalize("Mohammed")).toBe("mohamed");
    expect(normalize("Hussein")).toBe("husein");
  });
});

describe("lev", () => {
  it("computes edit distance", () => {
    expect(lev("", "abc")).toBe(3);
    expect(lev("abc", "")).toBe(3);
    expect(lev("abc", "abc")).toBe(0);
    expect(lev("kitten", "sitting")).toBe(3);
  });
});

describe("nameMatch", () => {
  it("matches transliteration variants within threshold", () => {
    expect(nameMatch("Mohamed", "Hussain", "Mohammed", "Hussein")).toBe(true);
  });
  it("rejects clearly different names", () => {
    expect(nameMatch("Yara", "Hussein", "Omar", "Hussein")).toBe(false);
  });
});

describe("parentsOf / ancestors / hasEdge", () => {
  it("parentsOf returns direct parents", () => {
    expect(parentsOf(A.parentOf, 3).sort()).toEqual([1, 2]);
    expect(parentsOf(A.parentOf, 1)).toEqual([]);
  });
  it("ancestors maps each ancestor to its distance", () => {
    const a = ancestors(B.parentOf, 21);
    expect(a.get(11)).toBe(1);
    expect(a.get(10)).toBe(2);
    expect(a.size).toBe(2);
  });
  it("hasEdge detects any direct relation", () => {
    expect(hasEdge(A.parentOf, A.spouse, A.sibling, 1, 3)).toBe(true); // parent edge
    expect(hasEdge(A.parentOf, A.spouse, A.sibling, 1, 2)).toBe(true); // spouse edge
    expect(hasEdge(A.parentOf, A.spouse, A.sibling, 3, 4)).toBe(false); // siblings, no direct edge
  });
});

describe("bfsPath", () => {
  it("finds the shortest connection path", () => {
    const path = bfsPath(A.parentOf, A.spouse, A.sibling, 3, 4);
    expect(path[0]).toBe(3);
    expect(path[path.length - 1]).toBe(4);
    expect(path.length).toBe(3); // 3 -> shared parent -> 4
  });
  it("returns a single-node path to self", () => {
    expect(bfsPath(A.parentOf, A.spouse, A.sibling, 3, 3)).toEqual([3]);
  });
  it("returns null when unreachable", () => {
    expect(bfsPath(A.parentOf, A.spouse, A.sibling, 3, 999)).toBe(null);
  });
});

describe("relationship", () => {
  const rel = (g, a, b) => relationship(g.parentOf, g.spouse, g.sibling, a, b, t);
  it("identifies self and partners", () => {
    expect(rel(A, 1, 1)).toEqual({ label: "rel_same", via: null });
    expect(rel(A, 1, 2)).toEqual({ label: "rel_partners", via: null });
  });
  it("identifies siblings via a shared parent", () => {
    expect(rel(A, 3, 4)).toEqual({ label: "rel_siblings", via: 1 });
  });
  it("identifies parent/child", () => {
    const r = rel(A, 1, 3);
    expect(r.via).toBe(1);
    expect(r.label).toContain("up_1");
    expect(r.label).toContain("down_1");
  });
  it("identifies a grandparent", () => {
    const r = rel(B, 21, 10);
    expect(r.via).toBe(10);
    expect(r.label).toContain("up_2");
  });
  it("identifies uncle/aunt", () => {
    expect(rel(B, 21, 12)).toEqual({ label: "rel_uncle", via: 10 });
  });
  it("identifies first cousins", () => {
    expect(rel(B, 21, 22)).toEqual({ label: "rel_cousins1", via: 10 });
  });
  it("identifies higher-degree cousins", () => {
    expect(rel(C, 121, 122)).toEqual({ label: "rel_cousinsDeg(3)", via: 100 });
  });
  it("reports no blood relation for disconnected people", () => {
    expect(rel(B, 21, 999)).toEqual({ label: "rel_none", via: null });
  });
});

describe("kinshipTitle (rich, gendered)", () => {
  // D: linear ancestry 1->2->3->4->5->6
  const D = { parentOf: [{ p: 1, c: 2 }, { p: 2, c: 3 }, { p: 3, c: 4 }, { p: 4, c: 5 }, { p: 5, c: 6 }], spouse: [], sibling: [] };
  // E: 1->2, 1->3, then 3->4->5->6 (a long nephew/cousin line off sibling 2)
  const E = { parentOf: [{ p: 1, c: 2 }, { p: 1, c: 3 }, { p: 3, c: 4 }, { p: 4, c: 5 }, { p: 5, c: 6 }], spouse: [], sibling: [] };
  const kt = (g, from, to, gender, lang) => kinshipTitle(g.parentOf, g.spouse, g.sibling, from, to, gender, lang, t);

  it("Dutch ancestors/descendants use over-/betover-/achter- prefixes", () => {
    expect(kt(D, 5, 1, "m", "nl")).toBe("betovergrootouder");        // depth-4 ancestor
    expect(kt(D, 1, 5, undefined, "nl")).toBe("achterachterkleinkind"); // depth-4 descendant
  });
  it("English uses grand-/great- prefixes (gendered close terms)", () => {
    expect(kt(D, 4, 2, "m", "en")).toBe("grandfather");              // depth-2 ancestor, male
    expect(kt(D, 5, 1, "m", "en")).toBe("great-great-grandparent");  // depth-4 ancestor
    expect(kt(D, 1, 5, "v", "en")).toBe("great-great-grandchild");
  });
  it("Dutch collateral line: neef … achterachterneef", () => {
    expect(kt(E, 2, 4, "m", "nl")).toBe("neef");              // nephew (depth 2)
    expect(kt(E, 2, 6, "m", "nl")).toBe("achterachterneef");  // great-great-nephew (depth 4)
  });
  it("cousins are degree-based", () => {
    expect(kt(C, 121, 122, "m", "nl")).toBe("achterneef"); // second cousins
    expect(kt(C, 121, 122, "m", "en")).toBe("2nd cousin");
  });
  it("self and unrelated", () => {
    expect(kt(D, 1, 1, "m", "nl")).toBe("jij");
    expect(kt(D, 1, 999, "m", "nl")).toBe(null);
  });
});
