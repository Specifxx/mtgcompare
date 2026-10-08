// src/lib/data/plane/state-backup.ts (owner WP01b, FROZEN). THE SECOND COPY OF THE WRITE-ONCE STATE (critique DP-17). Product slugs, oracle ordinals and slugs, set tokens and set slugs live only in the published files of branch `data`, and that branch is squashed every week and could be
// force-pushed by an operator: losing it would re-slug 99k URLs. After every pointer commit the publisher appends this state to an APPEND-ONLY branch `state` of the same private repository (never squashed, never force-pushed): three small text files in sorted line order, so git stores a
// day's change (tens of new slugs) as a delta of a few hundred bytes. `restoreState` rebuilds the PrevState a new importer needs when `data` is gone. The hysteresis masks and the group memory are NOT saved: losing them costs one day of hysteresis, never a URL.
import type { PrevState } from "./prevstate";

export interface StateFiles { "slugs.tsv": string; "oracles.tsv": string; "sets.tsv": string }
export const STATE_BRANCH = "state";
const enc = (s: string): string => s.replace(/[\t\n\\]/g, (c) => (c === "\t" ? "\\t" : c === "\n" ? "\\n" : "\\\\"));
const dec = (s: string): string => s.replace(/\\(t|n|\\)/g, (_, c: string) => (c === "t" ? "\t" : c === "n" ? "\n" : "\\"));
/** Sorted, one record per line (id TAB slug; oracle ordinal TAB slug; set id TAB tok TAB slug). Deterministic: the same state is the same bytes. */
export function exportState(p: PrevState): StateFiles {
  const lines = <K extends number | string>(m: ReadonlyMap<number, K>, f: (k: number, v: K) => string): string => [...m.keys()].sort((a, b) => a - b).map((k) => f(k, m.get(k)!)).join("\n") + "\n";
  return {
    "slugs.tsv": lines(p.slugById, (id, s) => `${id}\t${enc(s)}`),
    "oracles.tsv": lines(p.slugByOracleNo, (no, s) => `${no}\t${enc(s)}`),
    "sets.tsv": lines(p.tokBySetId, (id, tok) => `${id}\t${enc(tok)}\t${enc(p.setSlugById.get(id) ?? "")}`),
  };
}
export function parseState(f: StateFiles): PrevState {
  const rows = (t: string): string[][] => t.split("\n").filter(Boolean).map((l) => l.split("\t"));
  const slugById = new Map<number, string>(), oracleNoBySlug = new Map<string, number>(), slugByOracleNo = new Map<number, string>(), tokBySetId = new Map<number, string>(), setSlugById = new Map<number, string>();
  for (const [id, s] of rows(f["slugs.tsv"])) slugById.set(Number(id), dec(s!));
  for (const [no, s] of rows(f["oracles.tsv"])) { oracleNoBySlug.set(dec(s!), Number(no)); slugByOracleNo.set(Number(no), dec(s!)); }
  for (const [id, tok, slug] of rows(f["sets.tsv"])) { tokBySetId.set(Number(id), dec(tok!)); setSlugById.set(Number(id), dec(slug ?? "")); }
  return { empty: slugById.size === 0, slugById, maskById: new Map(), oracleNoBySlug, slugByOracleNo, tokBySetId, setSlugById, lastDay: null, seq: 0, phase: null, histCut: null, groups: new Map(), configHash: null, guardTrips: 0, files: 0 };
}
