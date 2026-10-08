// owner: WP02
// src/lib/data/history.ts: the section "history.ts" of api.ts (contract 7.12). Readers of the hist/ files; all P (a pinned plane read, memoised parsed in the instance). The names, arguments, result types and cache kinds are FROZEN.
// A unit's series is its base (hist/p, 64 ids a file, about 730 days ending on the cut day) merged with its tail (hist/t, 512 ids a file, the days after the cut) by mergeTail. v3 base files (the draft) are still read and converted; v4 is what is written.
import { addDays, dayIso, dayNum } from "../history";
import { unitKey, type UnitKey, type UnitRef } from "../constants";
import { getCardsByIds } from "./catalog";
import { decodeDense, encodeRuns, endDayOf, mergeTail } from "./plane/history-codec";
import type { HistFile, HistTailFile, IndexSeriesFile, MoversFile, SeriesV4 } from "./plane/formats";
import { bucketList, optionalOf, planeSource, type BucketList } from "./plane/runtime";
import { bucketPath, cardBucket, histBucket, tailBucket } from "./plane/shards";
import type { CardLite, HistoryPoint, IndexPoint } from "./types";

export const RECENT_HISTORY_MAX_IDS: 500 = 500;
const SPARK_MAX_UNITS = 48, SPARK_POINTS = 30, RECENT_DAYS = 120, RECENT_BATCH = 16, CHART_DAYS = 365;

const dayMsOf = (n: number): number => Date.parse(`${dayIso(n)}T00:00:00Z`);
/** One unit's series out of a base file (v3 or v4) or a tail file; undefined when the unit has none. */
function seriesIn(file: HistFile | HistTailFile | null, key: UnitKey): SeriesV4 | undefined {
  const s = file?.p[key]; if (!s || s.length < 2 || typeof s[0] !== "number") return undefined;
  return file!.v === 3 ? encodeRuns(s[0], s.slice(1)) : (s as SeriesV4);
}
interface Loaded { series: Map<UnitKey, SeriesV4>; anchor: number }
/** The merged series of the units, reading each distinct base and tail file once (the bucket list rules out the files of untracked buckets, so an untracked unit costs no request). `anchor` is the newest day the window ends on: the price day of the pointed commit, or the series' own end if later. */
async function loadSeries(units: readonly UnitRef[], batch = Infinity): Promise<Loaded> {
  const { src, ptr } = await planeSource(), found: BucketList | null = await bucketList(src, ptr);
  // meta/buckets.json lists the buckets that hold tracked units; a tree published before the first store stage has none listed yet (the list is built from the `un` files) although its history files exist, so an EMPTY list rules nothing out
  const list = found && found.tracked.size > 0 ? found : null;
  const wanted = units.filter((u) => Number.isInteger(u.id) && u.id > 0 && (!list || list.tracked.has(cardBucket(u.id))));
  const bases = [...new Set(wanted.map((u) => histBucket(u.id)))], tails = [...new Set(wanted.map((u) => tailBucket(u.id)))];
  const files = new Map<string, HistFile | HistTailFile | null>();
  const rels = [...bases.map((b) => bucketPath("hist/p", b)), ...tails.map((b) => bucketPath("hist/t", b))];
  for (let i = 0; i < rels.length; i += batch) await Promise.all(rels.slice(i, i + batch).map(async (rel) => { files.set(rel, await optionalOf<HistFile | HistTailFile>(src, rel)); }));
  const series = new Map<UnitKey, SeriesV4>(); let anchor = dayNum(ptr.priceDay);
  for (const u of wanted) {
    const key = unitKey(u.id, u.finish);
    const merged = mergeTail(seriesIn(files.get(bucketPath("hist/p", histBucket(u.id))) ?? null, key), seriesIn(files.get(bucketPath("hist/t", tailBucket(u.id))) ?? null, key));
    if (merged) { series.set(key, merged); anchor = Math.max(anchor, endDayOf(merged)); }
  }
  return { series, anchor };
}
const windowOf = (s: SeriesV4, anchor: number, days: number): { day: number; cents: number }[] =>
  decodeDense(s).filter((p): p is { day: number; cents: number } => p.cents != null && p.day >= addDays(anchor, -days));

/** hist/p base bucket (floor(id / 64)) + hist/t tail (floor(id / 512)), merged by mergeTail; default 365 days; [] for an untracked unit (the mask says so: no request). The per-card getProductHistory(id) is gone: a call without a finish cannot exist.
 *  v4 files carry the market price only, so `lowUsd` is null and `lows` is absent; a day without a price is not a point. */
export async function getUnitHistory(unit: UnitRef, days: number = CHART_DAYS): Promise<HistoryPoint[]> {
  const { series, anchor } = await loadSeries([unit]), s = series.get(unitKey(unit.id, unit.finish));
  return s ? windowOf(s, anchor, Math.max(1, Math.floor(days))).map((p) => ({ day: dayIso(p.day), marketUsd: p.cents, lowUsd: null })) : [];
}
/** <= 48 units, key UnitKey, <= 30 points: the last `days` (default 30) market prices, oldest first, downsampled evenly; a unit with fewer than two prices has no sparkline. */
export async function getSparklines(units: readonly UnitRef[], days = 30): Promise<Record<string, number[]>> {
  const { series, anchor } = await loadSeries(units.slice(0, SPARK_MAX_UNITS)), out: Record<string, number[]> = {};
  for (const [key, s] of series) {
    const v = windowOf(s, anchor, Math.max(1, Math.floor(days))).map((p) => p.cents);
    if (v.length >= 2) out[key] = v.length <= SPARK_POINTS ? v : Array.from({ length: SPARK_POINTS }, (_, i) => v[Math.round((i * (v.length - 1)) / (SPARK_POINTS - 1))]!);
  }
  return out;
}
/** <= 500 units; the last 120 days; batches of 16 files; key UnitKey -> dayMs -> cents (market price; a day without one is absent). */
export async function getRecentHistory(units: readonly UnitRef[]): Promise<Map<string, Map<number, number>>> {
  const { series, anchor } = await loadSeries(units.slice(0, RECENT_HISTORY_MAX_IDS), RECENT_BATCH), out = new Map<string, Map<number, number>>();
  for (const [key, s] of series) {
    const m = new Map<number, number>(); for (const p of windowOf(s, anchor, RECENT_DAYS)) m.set(dayMsOf(p.day), p.cents);
    if (m.size) out.set(key, m);
  }
  return out;
}
/** hist/index.json, newest 730 days, oldest first (the chart order). An absent file (before the first history day) is an empty series. */
export async function getIndexSeries(): Promise<IndexPoint[]> {
  const { src } = await planeSource(), f = await optionalOf<IndexSeriesFile>(src, "hist/index.json");
  return (f?.days ?? []).slice(-730).map(([day, value, totalUsd, cardCount]) => ({ day, value, totalUsd, cardCount }));
}
/** mv/recent.json (the 24 largest changes between the last two days) -> getCardsByIds. Each card is shown in the finish that moved. */
export async function getRecentlyUpdated(n = 24): Promise<{ card: CardLite; pct: number }[]> {
  const { src } = await planeSource(), f = await optionalOf<MoversFile>(src, "mv/recent.json"); if (!f?.r.length) return [];
  const rows = f.r.slice(0, Math.max(1, Math.min(24, Math.floor(n))));
  const [normal, foil] = await Promise.all((["N", "F"] as const).map((unit) => getCardsByIds(rows.filter((r) => (r[1] === 1 ? "F" : "N") === unit).map((r) => r[0]), { unit })));
  return rows.flatMap((r) => { const card = (r[1] === 1 ? foil : normal).get(r[0]); return card ? [{ card, pct: r[9] }] : []; });
}
