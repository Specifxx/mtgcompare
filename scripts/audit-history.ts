// scripts/audit-history.ts (owner WP19, parity P03; RiftCompare's script printed the last 14 days of the PriceHistory TABLE per market to the log so a gap or a scale jump was visible by eye). Price history is FILES now (the base
// windows hist/p, the tails after the last cut hist/t, the weekly closes hist/w and the market index hist/index.json; contract 2.10 and 6.5), so the audit asserts instead of printing: every series decodes, a TRACKED unit has a series that
// ends on the published price day and whose last point is today's market in px/, the base never runs past the cut and the tail never starts before it, the weekly closes sit on Sundays, and the market index is dated and increasing.
//
//   npx tsx scripts/audit-history.ts [--dir .data] [--json]       (read-only; exit 1 on any `error`)
// The pointer (latest.json beside v1/) names the price day and the cut; without it v1/status.json carries the same two fields. Calibrated on the real tree of 2026-10-07 (28,531 tracked units, 31,263 base series, 0 findings).
import fs from "node:fs";
import path from "node:path";
import { PRICE_MASK } from "../src/lib/constants";
import type { HistFile, HistTailFile, IndexSeriesFile, PointerFile, PxRow, SeriesV4, WeeklyFile } from "../src/lib/data/plane/formats";
import { decodeV3, endDayOf, mergeTail, spanOf } from "../src/lib/data/plane/history-codec";
import { fsTree, type TreeView } from "../src/lib/data/plane/tree";
import { KEEP_DAYS, dayNum } from "../src/lib/history";
import type { Finding, Level } from "./audit-publication";

const CAP = 12, M = PRICE_MASK;
const rd = <T,>(t: TreeView, rel: string): T => JSON.parse(t.read(rel)) as T;
const isDay = (d: unknown): d is number => { if (typeof d !== "number" || !Number.isInteger(d)) return false; const y = Math.floor(d / 10000), m = Math.floor(d / 100) % 100, dd = d % 100; const dt = new Date(Date.UTC(y, m - 1, dd)); return y >= 2000 && y < 2100 && dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === dd; };
const weekdayOf = (iso: string): number => new Date(`${iso}T00:00:00Z`).getUTCDay();
export interface HistInput { priceDay: string; histCut: string }

/** Shape of one v4 series: start day, then (value, days) pairs; values are positive whole cents or null, days are positive. Returns a reason or null. */
export function seriesProblem(s: unknown): string | null {
  if (!Array.isArray(s) || s.length < 3 || s.length % 2 === 0) return "not [startDay, value, days, ...]";
  if (!isDay(s[0])) return `start day ${String(s[0])} is not a date`;
  for (let i = 1; i + 1 < s.length; i += 2) {
    const v = s[i], n = s[i + 1];
    if (v !== null && !(Number.isInteger(v) && (v as number) > 0)) return `value ${String(v)} is neither null nor a positive whole number of cents`;
    if (!Number.isInteger(n) || (n as number) < 1) return `run length ${String(n)} is not a positive whole number of days`;
  }
  return null;
}
/** All history checks over a tree. `input` names the price day and the cut (the pointer); null skips the checks that need them. Pure. */
export function evaluateHistory(t: TreeView, input: HistInput | null): Finding[] {
  const out: Finding[] = []; const seen = new Map<string, number>();
  const add = (level: Level, code: string, message: string) => { const n = (seen.get(code) ?? 0) + 1; seen.set(code, n); if (n <= CAP) out.push({ level, code, message }); else if (n === CAP + 1) out.push({ level, code, message: `...more ${code} findings not listed` }); };
  const files = t.files(), px = new Map<number, PxRow>();
  for (const f of files) if (f.startsWith("px/")) for (const r of rd<{ p: PxRow[] }>(t, f).p) px.set(r[0], r);
  const cut = input ? dayNum(input.histCut) : null, today = input ? dayNum(input.priceDay) : null;
  const base = new Map<string, SeriesV4>(), tail = new Map<string, SeriesV4>();
  for (const f of files.filter((x) => x.startsWith("hist/p/"))) {
    const j = rd<HistFile>(t, f);
    if (j.v !== 3 && j.v !== 4) { add("error", "HIST_FORMAT", `${f}: history format ${String(j.v)}`); continue; }
    for (const [k, s] of Object.entries(j.p)) {
      if (!/^\d+\.[01]$/.test(k)) { add("error", "HIST_KEY", `${f}: key "${k}" is not <productId>.<finish>`); continue; }
      const v4: SeriesV4 | null = j.v === 3 ? v3ToV4(s as (number | null)[]) : (s as SeriesV4);
      const bad = v4 ? seriesProblem(v4) : "an empty v3 series"; if (bad) { add("error", "SERIES_SHAPE", `${f} ${k}: ${bad}`); continue; }
      base.set(k, v4!);
      if (cut != null && endDayOf(v4!) > cut) add("error", "BASE_PAST_CUT", `${f} ${k}: the base window ends ${endDayOf(v4!)}, after the cut ${cut}`);
      if (spanOf(v4!) > KEEP_DAYS + 1) add("error", "BASE_TOO_LONG", `${f} ${k}: ${spanOf(v4!)} days (the window is ${KEEP_DAYS})`);
    }
  }
  const cuts = new Set<number>();
  for (const f of files.filter((x) => x.startsWith("hist/t/"))) {
    const j = rd<HistTailFile>(t, f); cuts.add(j.cut);
    if (cut != null && j.cut !== cut) add("error", "TAIL_CUT", `${f}: names cut ${j.cut}, the pointer says ${cut}`);
    for (const [k, s] of Object.entries(j.p)) {
      const bad = seriesProblem(s); if (bad) { add("error", "SERIES_SHAPE", `${f} ${k}: ${bad}`); continue; }
      tail.set(k, s as SeriesV4);
      if ((s as SeriesV4)[0] <= j.cut && base.has(k)) add("error", "TAIL_BEFORE_CUT", `${f} ${k}: the tail starts ${(s as SeriesV4)[0]}, not after the cut ${j.cut}`);
    }
  }
  // a tracked unit: a series that ends on the price day and whose last point is today's market (the importer appends the market of the day)
  if (today != null) {
    for (const p of px.values()) {
      for (const fin of [0, 1] as const) {
        if (!(p[5] & (fin === 0 ? M.TRACKN : M.TRACKF))) continue;
        const k = `${p[0]}.${fin}`, s = mergeTail(base.get(k), tail.get(k));
        if (!s) { add("error", "TRACKED_NO_SERIES", `unit ${k} is tracked but has no history series`); continue; }
        if (endDayOf(s) !== today) add("error", "SERIES_STALE", `unit ${k}: the series ends ${endDayOf(s)}, the price day is ${today}`);
        const last = s[s.length - 2] as number | null, market = fin === 0 ? p[1] : p[2];
        if (endDayOf(s) === today && last !== market) add("error", "LAST_VS_PX", `unit ${k}: the last point is ${last}, px says the market is ${market}`);
      }
    }
  }
  // weekly closes: Sundays, 18 weeks, the shard of a unit is uid % 8
  for (const f of files.filter((x) => /^hist\/w\/\d+\.json$/.test(x))) {
    const j = rd<WeeklyFile>(t, f), shard = Number(/(\d+)\.json$/.exec(f)![1]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(j.end) || weekdayOf(j.end) !== 0) add("error", "WEEKLY_END", `${f}: end ${j.end} is not a Sunday`);
    else if (input && j.end > input.priceDay) add("error", "WEEKLY_END", `${f}: end ${j.end} is after the price day ${input.priceDay}`);
    else if (input && (Date.parse(input.priceDay) - Date.parse(j.end)) / 86_400_000 > 13) add("warn", "WEEKLY_OLD", `${f}: end ${j.end} is over two weeks before the price day ${input.priceDay}`);
    if (j.k.length !== j.c.length) add("error", "WEEKLY_SHAPE", `${f}: ${j.k.length} units but ${j.c.length} rows`);
    j.k.forEach((uid, i) => {
      if (uid % 8 !== shard) add("error", "WEEKLY_SHARD", `${f}: unit ${uid} belongs in hist/w/${uid % 8}.json`);
      if (j.c[i]?.length !== j.weeks) add("error", "WEEKLY_SHAPE", `${f}: unit ${uid} has ${j.c[i]?.length} closes, expected ${j.weeks}`);
      if (i > 0 && uid <= j.k[i - 1]!) add("error", "WEEKLY_ORDER", `${f}: unit ${uid} is not after ${j.k[i - 1]}`);
    });
  }
  // the market index: ISO days, strictly increasing, ending on the price day
  if (t.has("hist/index.json")) {
    const days = rd<IndexSeriesFile>(t, "hist/index.json").days; let prev = "";
    for (const [day, value, total, n] of days) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) add("error", "INDEX_DAY", `hist/index.json: "${day}" is not a date`);
      else if (day <= prev) add("error", "INDEX_ORDER", `hist/index.json: ${day} does not come after ${prev}`);
      if (!(value > 0) || !(total >= 0) || !(n >= 0)) add("error", "INDEX_VALUE", `hist/index.json ${day}: ${value}/${total}/${n}`);
      prev = day;
    }
    if (input && prev && prev !== input.priceDay) add(prev < input.priceDay ? "warn" : "error", "INDEX_END", `hist/index.json ends ${prev}, the price day is ${input.priceDay}`);
    if (days.length > KEEP_DAYS + 1) add("error", "INDEX_LONG", `hist/index.json holds ${days.length} days (the window is ${KEEP_DAYS})`);
  }
  return out;
}
function v3ToV4(s: (number | null)[]): SeriesV4 | null {
  const dense = decodeV3(s); if (!dense.length) return null;
  const out: SeriesV4 = [dense[0]!.day]; let i = 0;
  while (i < dense.length) { const v = dense[i]!.cents && dense[i]!.cents! > 0 ? dense[i]!.cents! : null; let j = i; while (j + 1 < dense.length && (dense[j + 1]!.cents && dense[j + 1]!.cents! > 0 ? dense[j + 1]!.cents : null) === v) j++; out.push(v, j - i + 1); i = j + 1; }
  return out;
}

export async function main(argv: readonly string[], env: Record<string, string | undefined>): Promise<number> {
  const i = argv.indexOf("--dir"), root = path.resolve((i >= 0 ? argv[i + 1] : undefined) ?? env.PLANE_DIR ?? ".data"), v1 = path.join(root, "v1");
  if (!fs.existsSync(v1)) { console.log(`${root} has no v1/ directory: nothing to audit.`); return 0; }
  const t = fsTree(v1); const pf = path.join(root, "latest.json");
  const ptr = fs.existsSync(pf) ? (JSON.parse(fs.readFileSync(pf, "utf8")) as PointerFile) : t.has("status.json") ? (JSON.parse(t.read("status.json")) as { pointer?: PointerFile }).pointer ?? null : null;
  const findings = evaluateHistory(t, ptr ? { priceDay: ptr.priceDay, histCut: ptr.histCut } : null);
  console.log(`history of ${root}: ${t.files().filter((f) => f.startsWith("hist/")).length} files; price day ${ptr?.priceDay ?? "unknown"}, cut ${ptr?.histCut ?? "unknown"}`);
  if (!findings.length) console.log("no finding: every series decodes, every tracked unit ends on the price day at today's market, the tail follows the cut, the weekly closes sit on Sundays.");
  for (const f of findings) { console.log(`  ${f.level === "error" ? "ERROR" : "warn "} [${f.code}] ${f.message}`); if (f.level === "error") console.log(`::error title=History (${f.code})::${f.message}`); }
  if (argv.includes("--json")) console.log(JSON.stringify(findings, null, 1));
  return findings.some((f) => f.level === "error") ? 1 : 0;
}
if (process.argv[1] && /scripts[\\/]audit-history\.ts$/.test(process.argv[1])) main(process.argv.slice(2), process.env).then((c) => { process.exitCode = c; }).catch((e) => { console.error(e); process.exitCode = 1; });
