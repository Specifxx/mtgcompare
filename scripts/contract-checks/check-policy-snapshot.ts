// Replays the policy over the real 2026-10-07 snapshot (111,839 included singles) and prints every count quoted in section 5.
import * as T from "../../src/lib/track";
import * as fs from "node:fs";
import { plausibleLow } from "../../src/lib/catalog";
const rows = JSON.parse(fs.readFileSync(process.env.POLICY_SNAPSHOT ?? "/tmp/claude-0/-home-user/1729fd1a-6a1a-50c2-b66b-ed691e9d9923/scratchpad/port/design/_judge/src/snapshot-policy.json", "utf8"));   // 15.7 MB, kept outside the tree
const cfg = T.TRACK_DEFAULTS;
interface Row { id: number; cls: number; N: { m: number | null; l: number | null } | null; F: { m: number | null; l: number | null } | null; rank: number | null; res: boolean; oid: string | null }
const priced = (p: Row) => {
  const n = T.unitValueCents(p.N ? { marketCents: p.N.m, lowCents: plausibleLow(p.N.l, p.N.m) } : null), f = T.unitValueCents(p.F ? { marketCents: p.F.m, lowCents: plausibleLow(p.F.l, p.F.m) } : null);
  return { n, f };
};
// 1. the ladder: rows and oracle coverage per catalogue floor, with and without the completeness rule
const all = (rows as Row[]).map((p) => ({ p, ...priced(p) })).filter((x) => x.n || x.f);
const cls0 = all.filter((x) => x.p.cls === 0);
const oracles = new Set(cls0.filter((x) => x.p.oid).map((x) => x.p.oid!));
const score = (x: (typeof all)[number], c = cfg) => T.trackScoreCents({ n: x.n?.cents ?? null, f: x.f?.cents ?? null }, x.p.oid ? T.popularity(x.p.rank, x.p.res) : 0, c);
const ladder: Record<string, unknown>[] = [];
for (const floor of [50, 25, 10, 1]) {
  const c = { ...cfg, catalogFloorCents: floor };
  const listed = cls0.filter((x) => T.inCatalogue(score(x, c), false, 0, c));
  const listedOr = new Set(listed.filter((x) => x.p.oid).map((x) => x.p.oid!));
  const picks = T.completenessPicks(cls0.map((x) => ({ id: x.p.id, oracleId: x.p.oid, marketCents: x.n?.lowBasis === false || x.f?.lowBasis === false ? Math.max(x.n && !x.n.lowBasis ? x.n.cents : 0, x.f && !x.f.lowBasis ? x.f.cents : 0) : null, valueCents: Math.max(x.n?.cents ?? 0, x.f?.cents ?? 0) })), listedOr);
  ladder.push({ floor, rows: listed.length, oraclesCovered: listedOr.size, oraclesPriced: oracles.size, completenessRowsAdded: picks.size, rowsWithCompleteness: listed.length + picks.size });
}
console.table(ladder);
// 2. the default policy: catalogue, THIN, tracking
let cat = 0, spec = 0, unpriced = 0, uM = 0, uL = 0, pM = 0, pL = 0, dual = 0, fOnlyTracked = 0, band = 0, thin = 0, lowOnlyHead = 0;
const covered = new Set<string>();
for (const p of rows as Row[]) {
  const { n, f } = priced(p);
  if (!n && !f) { unpriced++; continue; }
  const v = { n: n?.cents ?? null, f: f?.cents ?? null };
  if (p.cls !== 0) { const best = Math.max(v.n ?? 0, v.f ?? 0); if (T.inCatalogue(best, false, p.cls, cfg)) spec++; continue; }
  const sc = T.trackScoreCents(v, p.oid ? T.popularity(p.rank, p.res) : 0, cfg);
  if (!T.inCatalogue(sc, false, 0, cfg)) continue;
  cat++; if (p.oid) covered.add(p.oid);
  if (T.isThin(sc, false, 0, cfg)) thin++;
  if (n ? n.lowBasis : f?.lowBasis) lowOnlyHead++;
  const tn = T.unitTracked(n?.cents ?? null, false, n?.lowBasis ?? false, cfg), tf = T.unitTracked(f?.cents ?? null, false, f?.lowBasis ?? false, cfg);
  const tnL = T.unitTracked(n?.cents ?? null, false, n?.lowBasis ?? false, { ...cfg, lowBasis: true }), tfL = T.unitTracked(f?.cents ?? null, false, f?.lowBasis ?? false, { ...cfg, lowBasis: true });
  uM += +tn + +tf; uL += +tnL + +tfL; pM += +(tn || tf); pL += +(tnL || tfL);
  if (p.N && p.F) dual++; if (!tn && tf && p.N) fOnlyTracked++;
  for (const x of [n, f]) if (x && !x.lowBasis && x.cents >= 400 && x.cents < 500) band++;
}
console.log({ catalogueClass0: cat, thinRows: thin, indexEligibleRows: cat - thin, specials: spec, unpricedSingles: unpriced, oraclesReferenced: covered.size, lowOnlyHeadlineRows: lowOnlyHead, trackedUnitsMarket: uM, trackedPrintingsMarket: pM, trackedUnitsLowIncl: uL, trackedPrintingsLowIncl: pL, dualFinishInCatalogue: dual, foilOnlyTrackedWithNormalRow: fOnlyTracked, unitsInExitBand4to5: band });
