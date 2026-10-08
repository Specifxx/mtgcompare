// src/lib/data/plane/reconcile.ts (owner WP01b, FROZEN). PHASE 1 MEMBERSHIP RECONCILIATION (critique DP-02, a blocker verified on the real tree).
//
// The first publish of a day (phase `catalog`) rewrites cat, px and the free views from today's prices and leaves the store families (un, of, ix s, ix f) carrying yesterday's rows. But the tracked set moves every day: a unit crosses the
// hysteresis band, a set releases, a price is corrected. Left alone, those families name units that px no longer tracks, and a validator that checks them would refuse the publish (the lab's did: 7 problems for ONE cleared TRACKN bit)
// so the prices of everyone stayed a day old. This module is the fix: before phase 1 validates, it DROPS the rows of units that left tracking from every store family and recomputes the bucket list. Units that ENTER tracking get no row
// (an absent row means "no store data yet"; the reader treats it so, and the phase-2 `full` publish adds them). Pure over a MutableTree.
import { PRICE_MASK } from "../../constants";
import type { IxF, IxK, IxS, OfferFile, UnFile } from "./formats";
import { cardBucket } from "./shards";
import type { MutableTree } from "./tree";

export interface ReconcileReport { unDropped: number; ofDropped: number; ixSDropped: number; ixFDropped: number; filesRemoved: number; filesRewritten: number; tracked: number; withoutStoreRows: number }
const json = (v: unknown): string => JSON.stringify(v);

export function reconcileStoreFamilies(t: MutableTree, trackedUids: ReadonlySet<number>): ReconcileReport {
  const rep: ReconcileReport = { unDropped: 0, ofDropped: 0, ixSDropped: 0, ixFDropped: 0, filesRemoved: 0, filesRewritten: 0, tracked: trackedUids.size, withoutStoreRows: 0 };
  const haveUn = new Set<number>();
  for (const f of t.files().filter((x) => x.startsWith("un/"))) {
    const J = JSON.parse(t.read(f)) as UnFile; const keep = J.u.filter((r) => trackedUids.has(r[0]));
    rep.unDropped += J.u.length - keep.length;
    if (!keep.length) { t.remove(f); rep.filesRemoved++; continue; }
    if (keep.length !== J.u.length) { t.write(f, json({ ...J, u: keep })); rep.filesRewritten++; }
    for (const r of keep) haveUn.add(r[0]);
  }
  for (const f of t.files().filter((x) => x.startsWith("of/"))) {
    const J = JSON.parse(t.read(f)) as OfferFile; const keep = J.o.filter((r) => trackedUids.has(r[0]));
    rep.ofDropped += J.o.length - keep.length;
    if (!keep.length) { t.remove(f); rep.filesRemoved++; continue; }
    if (keep.length !== J.o.length) { t.write(f, json({ ...J, o: keep })); rep.filesRewritten++; }
  }
  for (const f of t.files().filter((x) => /^ix\/s-\d+\.json$/.test(x))) {
    const c = f.slice(5, -5); const K = JSON.parse(t.read(`ix/k-${c}.json`)) as IxK; const J = JSON.parse(t.read(f)) as IxS;
    const keep = J.u.filter((u) => { const id = K.id[u[0]!]; return id !== undefined && trackedUids.has(id * 2 + u[1]!); });
    rep.ixSDropped += J.u.length - keep.length; if (keep.length !== J.u.length) { t.write(f, json({ ...J, u: keep })); rep.filesRewritten++; }
  }
  for (const f of t.files().filter((x) => /^ix\/f-\d+\.json$/.test(x))) {
    const J = JSON.parse(t.read(f)) as IxF; const idx: number[] = []; J.uid.forEach((u, i) => { if (trackedUids.has(u)) idx.push(i); });
    rep.ixFDropped += J.uid.length - idx.length;
    if (idx.length !== J.uid.length) { t.write(f, json({ ...J, n: idx.length, uid: idx.map((i) => J.uid[i]!), mk: idx.map((i) => J.mk[i]!).join(""), st: idx.map((i) => J.st[i]!), pr: idx.map((i) => J.pr[i]!) })); rep.filesRewritten++; }
  }
  if (t.has("meta/buckets.json")) { const b = JSON.parse(t.read("meta/buckets.json")); b.tracked = [...new Set([...trackedUids].map((u) => cardBucket(Math.floor(u / 2))))].sort((x, y) => x - y); t.write("meta/buckets.json", json(b)); }   // the buckets that hold a tracked unit (px), not only those with store rows: the history of a unit before its first store row is readable
  for (const u of trackedUids) if (!haveUn.has(u)) rep.withoutStoreRows++;
  return rep;
}
/** The tracked uids of a tree's px files: the single definition of "tracked" (PRICE_MASK.TRACKN / TRACKF). */
export function trackedUidsOf(t: { files(): string[]; read(rel: string): string }): Set<number> {
  const out = new Set<number>();
  for (const f of t.files().filter((x) => x.startsWith("px/"))) for (const r of (JSON.parse(t.read(f)) as { p: number[][] }).p) { if (r[5]! & PRICE_MASK.TRACKN) out.add(r[0]! * 2); if (r[5]! & PRICE_MASK.TRACKF) out.add(r[0]! * 2 + 1); }
  return out;
}
