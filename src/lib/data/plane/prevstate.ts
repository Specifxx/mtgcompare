// src/lib/data/plane/prevstate.ts (owner WP01b, FROZEN). WHAT THE IMPORTER REMEMBERS FROM LAST TIME, rebuilt from a checkout of the pointed data commit. The importer reads NOTHING from Neon (owner addendum 9): every datum it used to select from a table is a
// field of a published file (contract 6.2). Measured on the real 9,488-file tree: 98,991 slugs, 98,991 masks, 33,447 oracle ordinals, 439 set tokens, 402 group rows, read and parsed in 328 ms, +210 MB heap.
//
//   write-once datum (C3)                       where it lives                              checked by writeOnceProblems
//   product slug                                cat/<b> row[1]                              a slug of an existing id never changes
//   oracle ordinal (and its slug)               or/<n> row[0], row[2]                       an existing oracle slug keeps its ordinal
//   Set.tok and the set slug                    meta/sets.json                              an existing set id keeps tok and slug
//   catalogue mask (the hysteresis memory)      px/<b> row[5]                               (input of flagChangeGuard, not write-once)
//   group hold memory, config hash, guard trips status.json groups / config                 (input of the F2b hold and F10)
//   the gate (TCGCSV and Scryfall stamps)       latest.json                                 (input of S0)
//   history windows                             hist/p, hist/t                              (read and appended in place)
import type { CatRow, OracleRow, PxRow, SetRow } from "./formats";
import type { StatusFile } from "./status";
import type { TreeView } from "./tree";

export interface PrevState {
  empty: boolean;
  slugById: Map<number, string>; maskById: Map<number, number>;
  oracleNoBySlug: Map<string, number>; slugByOracleNo: Map<number, string>;
  tokBySetId: Map<number, string>; setSlugById: Map<number, string>;
  lastDay: string | null; seq: number; phase: "catalog" | "full" | null; histCut: string | null;
  groups: Map<number, [products: number, priced: number]>; configHash: string | null; guardTrips: number;
  files: number;
}
const rd = <T>(t: TreeView, rel: string): T => JSON.parse(t.read(rel)) as T;
export function loadPrevState(t: TreeView): PrevState {
  const s: PrevState = { empty: true, slugById: new Map(), maskById: new Map(), oracleNoBySlug: new Map(), slugByOracleNo: new Map(), tokBySetId: new Map(), setSlugById: new Map(), lastDay: null, seq: 0, phase: null, histCut: null, groups: new Map(), configHash: null, guardTrips: 0, files: 0 };
  const files = t.files(); s.files = files.length;
  if (!files.length) return s;
  s.empty = false;
  for (const f of files) {
    if (f.startsWith("cat/")) { for (const r of rd<{ c: CatRow[] }>(t, f).c) s.slugById.set(r[0], r[1]); }
    else if (f.startsWith("px/")) { for (const r of rd<{ p: PxRow[] }>(t, f).p) s.maskById.set(r[0], r[5]); }
    else if (f.startsWith("or/")) { for (const r of rd<{ o: OracleRow[] }>(t, f).o) { s.oracleNoBySlug.set(r[2], r[0]); s.slugByOracleNo.set(r[0], r[2]); } }
  }
  if (t.has("meta/sets.json")) for (const r of rd<{ sets: SetRow[] }>(t, "meta/sets.json").sets) { s.tokBySetId.set(r[0], r[2]); s.setSlugById.set(r[0], r[1]); }
  if (t.has("status.json")) {
    const st = rd<StatusFile>(t, "status.json");
    s.lastDay = st.pointer?.priceDay ?? null; s.seq = st.pointer?.seq ?? 0; s.phase = st.pointer?.phase ?? null; s.histCut = st.pointer?.histCut ?? null;
    for (const g of st.groups ?? []) s.groups.set(g[0], [g[1], g[2]]);
    s.configHash = st.config?.trackConfigHash ?? null; s.guardTrips = st.config?.guardTrips?.flagChange ?? 0;
  }
  return s;
}
export interface WriteOnceProblem { code: "SLUG_CHANGED" | "ORACLE_MOVED" | "SET_TOK_CHANGED" | "ROW_DELETED"; message: string }
/** The write-once rules (C3, 6.2) as a check of the NEW tree against the previous state: no existing catalogue row is deleted, no slug changes, no oracle ordinal moves, no set token or set slug changes. A violation REFUSES the publish (publisher.ts). */
export function writeOnceProblems(prev: PrevState, next: TreeView, cap = 20): WriteOnceProblem[] {
  if (prev.empty) return [];
  const out: WriteOnceProblem[] = []; const add = (p: WriteOnceProblem) => { if (out.length < cap) out.push(p); };
  const seen = new Set<number>();
  for (const f of next.files()) {
    if (f.startsWith("cat/")) for (const r of rd<{ c: CatRow[] }>(next, f).c) { seen.add(r[0]); const was = prev.slugById.get(r[0]); if (was !== undefined && was !== r[1]) add({ code: "SLUG_CHANGED", message: `product ${r[0]}: slug ${was} became ${r[1]}` }); }
    else if (f.startsWith("or/")) for (const r of rd<{ o: OracleRow[] }>(next, f).o) { const was = prev.oracleNoBySlug.get(r[2]); if (was !== undefined && was !== r[0]) add({ code: "ORACLE_MOVED", message: `oracle ${r[2]}: ordinal ${was} became ${r[0]}` }); const slugWas = prev.slugByOracleNo.get(r[0]); if (slugWas !== undefined && slugWas !== r[2]) add({ code: "ORACLE_MOVED", message: `oracle ordinal ${r[0]}: slug ${slugWas} became ${r[2]}` }); }
  }
  for (const id of prev.slugById.keys()) if (!seen.has(id)) { add({ code: "ROW_DELETED", message: `product ${id} (${prev.slugById.get(id)}) has no catalogue row any more: rows are never deleted, only flagged GONE` }); if (out.length >= cap) break; }
  if (next.has("meta/sets.json")) for (const r of rd<{ sets: SetRow[] }>(next, "meta/sets.json").sets) {
    const tok = prev.tokBySetId.get(r[0]); if (tok !== undefined && tok !== r[2]) add({ code: "SET_TOK_CHANGED", message: `set ${r[0]}: token ${tok} became ${r[2]}` });
    const sl = prev.setSlugById.get(r[0]); if (sl !== undefined && sl !== r[1]) add({ code: "SET_TOK_CHANGED", message: `set ${r[0]}: slug ${sl} became ${r[1]}` });
  }
  return out;
}
