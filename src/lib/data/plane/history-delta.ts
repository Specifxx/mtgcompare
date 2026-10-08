// src/lib/data/plane/history-delta.ts (owner WP01a, FROZEN). THE DURABLE COPY OF THE PRICE HISTORY: one small file per price day on the append-only branch `state` (state-backup.ts), listing only the tracked units whose market price differs from the day before:
//   state:d/<yyyy>/<mm>/<yyyy-mm-dd>.json = { v: 1, day: 20261007, full?: true, u: [[uid, cents | null], ...] }
// A FULL file (the first publish and every history cut day, every 28 days) lists every tracked unit that has a value, so a rebuild starts at the latest full file and never needs the days before it; an ordinary file lists the changes.
// The live history (hist/p, hist/t) is rewritten on every cut and lives on a branch that is squashed weekly; this is the second copy that survives a lost `data` branch (critique DP-17), is rebuilt into series by `rebuildSeries` (scripts/history-rebuild.ts), and lets a chart
// longer than the 730-day window exist without keeping it in the live tree. Measured at 34.4% daily churn on 28,538 units: 140 KB raw, 49 KB zlib a day, 17.5 MB a year as pushed.
import { addDays } from "../../history";
import { appendDay, decodeDense, mergeTail, toPoints } from "./history-codec";
import type { HistFile, HistTailFile, SeriesV4 } from "./formats";
import type { TreeView } from "./tree";

export interface DeltaFile { v: 1; day: number; full?: true; u: [uid: number, cents: number | null][] }
const uidOfKey = (k: string): number => { const [id, f] = k.split("."); return Number(id) * 2 + Number(f); };
/** All merged series of a tree (base + tail), keyed by uid. */
export function seriesOf(t: TreeView): Map<number, SeriesV4> {
  const base = new Map<number, SeriesV4>(), tail = new Map<number, SeriesV4>();
  for (const f of t.files()) {
    if (f.startsWith("hist/p/")) { for (const [k, s] of Object.entries((JSON.parse(t.read(f)) as HistFile).p)) if (Array.isArray(s) && (JSON.parse(t.read(f)) as HistFile).v === 4) base.set(uidOfKey(k), s as SeriesV4); }
    else if (f.startsWith("hist/t/")) for (const [k, s] of Object.entries((JSON.parse(t.read(f)) as HistTailFile).p)) tail.set(uidOfKey(k), s as SeriesV4);
  }
  const out = new Map<number, SeriesV4>(); for (const uid of new Set([...base.keys(), ...tail.keys()])) { const s = mergeTail(base.get(uid), tail.get(uid)); if (s) out.set(uid, s); }
  return out;
}
const valueAt = (s: SeriesV4, day: number): number | null => { const d = decodeDense(s); const first = d[0]!.day; const i = Math.round((Date.UTC(Math.floor(day / 10000), Math.floor(day / 100) % 100 - 1, day % 100) - Date.UTC(Math.floor(first / 10000), Math.floor(first / 100) % 100 - 1, first % 100)) / 86_400_000); return i >= 0 && i < d.length ? d[i]!.cents : null; };
/** The units whose value on `day` differs from the day before (a unit that has no value on `day` after having one is [uid, null]). */
export function historyDelta(t: TreeView, day: number, full = false, series: Map<number, SeriesV4> = seriesOf(t)): DeltaFile {
  const u: DeltaFile["u"] = []; const prev = addDays(day, -1);
  for (const [uid, s] of [...series].sort((a, b) => a[0] - b[0])) { const now = valueAt(s, day), before = valueAt(s, prev); if (full ? now != null : now !== before) u.push([uid, now]); }
  return full ? { v: 1, day, full: true, u } : { v: 1, day, u };
}
export const deltaPath = (day: number): string => { const s = String(day); return `d/${s.slice(0, 4)}/${s.slice(4, 6)}/${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}.json`; };
/** Rebuild every series from daily deltas in day order (a unit holds its last value on a day its delta omits). Trailing null runs are trimmed, so the result equals the live series day for day. */
export function rebuildSeries(deltas: readonly DeltaFile[]): Map<number, SeriesV4> {
  const out = new Map<number, SeriesV4>(), last = new Map<number, number | null>();
  for (const d of [...deltas].sort((a, b) => a.day - b.day)) {
    const today = new Map(d.u); if (d.full) { for (const uid of last.keys()) if (!today.has(uid)) last.set(uid, null); }   // a full file is the whole state of the day
    for (const [uid, v] of today) last.set(uid, v);
    for (const uid of last.keys()) { const v = today.has(uid) ? today.get(uid)! : last.get(uid)!; out.set(uid, appendDay(out.get(uid), d.day, v).series); }
  }
  return out;
}
export const pointsOf = (s: SeriesV4): (number | null)[][] => toPoints(s);
