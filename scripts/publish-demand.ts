// The demand-snapshot job (contract 14.5, .github/workflows/demand-snapshot.yml). The ONE job that reads Neon for the data plane, and it publishes through the publisher's OVERLAY mode, which may change pv/ and nothing else
// (validateOverlay, code OVERLAY_SCOPE): the free preview slices of the two paid analytics. Nothing paid is a file.
//   1. record today's DemandDay row (the running totals of the busiest cards) and prune the old ones;
//   2. pv/demand.json: the top 10 most searched cards over 7 days, SEARCHES ONLY (what a signed-out visitor sees on /movers);
//   3. pv/rising.json: the top 3 picks of Rising Cards per scope with the reason of each (what a free account sees on the tool page), computed by the same assembly the Premium list uses, from the public weekly closes (hist/w) and the browse index of the CHECKOUT it publishes onto;
//   4. one overlay commit and a pointer move, the site told (the warm call and the ranking tag).
// A failed run leaves yesterday's slices (PREVIEW_STALE shows after 48 hours). It never writes anything private to the data repository: a counter, a view count or a velocity is refused by the validator (FORBIDDEN_KEY).
//   npx tsx scripts/publish-demand.ts           # PLANE_REPO, DATA_REPO_TOKEN, DATABASE_URL, REVALIDATE_URL, CRON_SECRET
import path from "node:path";
import { demandPreviewFile, readDemandWindow, readRiseDemand, riseEntryFrom, risingPreviewFile, weeklyClosesOf } from "../src/lib/data/demand";
import { BrowseIndex } from "../src/lib/data/plane/browse-index";
import type { PointerFile, SetsFile, WeeklyFile } from "../src/lib/data/plane/formats";
import { publish, type PublishOutcome } from "../src/lib/data/plane/publisher";
import { optionalOf } from "../src/lib/data/plane/runtime";
import { weeklyPath } from "../src/lib/data/plane/shards";
import { PlaneError, type PlaneSource } from "../src/lib/data/plane/source";
import type { RunRecord } from "../src/lib/data/plane/status";
import type { MutableTree, TreeView } from "../src/lib/data/plane/tree";
import { RISE_SCOPES, type RiseAnalysis, type RiseScope } from "../src/lib/rise-predictor";
import { revalidateSite } from "../src/lib/import";
import { recordDemandDay, prismaDemandStore, type DemandStore } from "../src/lib/tools-history";
import { utcDayKey } from "../src/lib/demand-snapshot";
import type { SetLite } from "../src/lib/data/types";
import { authenticateGit, log, remoteOf, readRemotePointer, verifyThroughRaw, workRoot } from "./import";

/** A PlaneSource over the checkout the publisher is building in: the same code that serves a page reads the same files. */
export function treeSource(tree: TreeView): PlaneSource {
  const text = async (rel: string): Promise<string> => { if (!tree.has(rel)) throw new PlaneError(rel, "missing"); return tree.read(rel); };
  return { text, json: async <T,>(rel: string): Promise<T> => JSON.parse(await text(rel)) as T };
}
const setOfRow = (r: SetsFile["sets"][number]): SetLite => ({ id: r[0], slug: r[1], tok: r[2], code: r[3], name: r[4], tcgName: r[5] || r[4], kind: r[6] as SetLite["kind"], releasedOn: r[7] || null, bucket: r[8] === 1, cardCount: r[10], trackedCount: r[11], sealedCount: r[12] });

export interface OverlayResult { day: string; demandRows: number; risingPicks: Partial<Record<RiseScope, number>> }
/** Computes both slices from the Neon store and the files of `tree`, and writes them into it. Exposed for the tests, which run it over a small tree and a fake store. */
export async function writeSlices(tree: MutableTree, store: DemandStore, now: Date = new Date()): Promise<OverlayResult> {
  const src = treeSource(tree), today = utcDayKey(now), at = now.toISOString();
  const sets = (await src.json<SetsFile>("meta/sets.json")).sets.map(setOfRow);
  const ix = await BrowseIndex.load(src, sets, { withStores: true, withOracle: false });
  const weekly = weeklyClosesOf(await Promise.all(Array.from({ length: 8 }, (_, i) => optionalOf<WeeklyFile>(src, weeklyPath(i)))));
  const window = await readDemandWindow(7, false, store, today), demand = await readRiseDemand(store, today);
  const demandFile = demandPreviewFile(window, at, (id) => ix.rowOf(id) >= 0);
  const analyses: Partial<Record<RiseScope, RiseAnalysis>> = {};
  for (const scope of RISE_SCOPES) analyses[scope] = riseEntryFrom(scope, demand, ix, weekly, now.getTime()).analysis;
  const risingFile = risingPreviewFile(analyses, at);
  tree.write("pv/demand.json", JSON.stringify(demandFile));
  tree.write("pv/rising.json", JSON.stringify(risingFile));
  return { day: today, demandRows: demandFile.r.length, risingPicks: Object.fromEntries(Object.entries(risingFile.scopes).map(([k, v]) => [k, v.length])) };
}

export interface DemandJobResult { outcome: PublishOutcome | "no-data"; overlay?: OverlayResult }
export async function runDemandJob(o: { env?: NodeJS.ProcessEnv; store?: DemandStore; now?: () => Date; fetch?: typeof fetch; skipHook?: boolean } = {}): Promise<DemandJobResult> {
  const env = o.env ?? process.env, store = o.store ?? prismaDemandStore(), now = o.now ?? (() => new Date()), { remote, repo, github } = remoteOf(env);
  authenticateGit(env);
  const recorded = await recordDemandDay(store, utcDayKey(now()));
  log(`DemandDay ${recorded.day}: ${recorded.cards} cards, ${recorded.snapshotDays} days on record, ${recorded.pruned} old rows pruned`);
  const ptr = await readRemotePointer(env, o.fetch), started = now();
  let overlay: OverlayResult | undefined;
  const outcome = await publish({
    remote, workdir: path.join(workRoot(env), "demand"), phase: "overlay", priceDay: ptr?.priceDay ?? utcDayKey(started), tcgcsv: ptr?.tcgcsv ?? "", scryfall: ptr?.scryfall ?? "", repo, now,
    build: async (tree, ctx) => {
      if (!ctx.prev) throw new Error("nothing is published yet: there is no catalogue to overlay (run the import first)");
      overlay = await writeSlices(tree, store, now());
      const run: RunRecord = { at: now().toISOString(), startedAt: started.toISOString(), kind: "overlay", ok: true, seconds: Math.round((now().getTime() - started.getTime()) / 1000), note: `${overlay.demandRows} demand rows, ${Object.values(overlay.risingPicks).reduce((a, b) => a + (b ?? 0), 0)} rising picks in ${Object.keys(overlay.risingPicks).length} scopes` };
      return { counts: ctx.prev.counts, histCut: ctx.prev.histCut, status: { runs: [run, ...(ctx.prevStatus?.runs ?? [])].slice(0, 30) } };
    },
    verify: github ? (ref) => verifyThroughRaw(ref, env, o.fetch) : undefined,
  }).catch((e: Error) => { if (/nothing is published yet/.test(e.message)) { log(e.message); return "no-data" as const; } throw e; });
  if (outcome === "no-data") return { outcome };
  if (outcome.kind === "refused") { log(`REFUSED: ${outcome.problems.slice(0, 5).map((p) => `${p.code} ${p.message}`).join(" | ")}`); return { outcome, overlay }; }
  log(`Published seq ${outcome.seq} ${outcome.ref.slice(0, 7)} (overlay: pv/ only)`);
  if (!o.skipHook && !(env.SKIP_REVALIDATE === "1")) await revalidateSite(log, { pointer: outcome.pointer as PointerFile });
  return { outcome, overlay };
}

if (process.argv[1] && /scripts[\\/]publish-demand\.ts$/.test(process.argv[1])) {
  runDemandJob()
    .then(async (r) => { if (r.outcome !== "no-data" && r.outcome.kind === "refused") process.exitCode = 1; const { prisma } = await import("../src/lib/db"); await prisma.$disconnect().catch(() => undefined); })
    .catch((e) => { console.error(e); process.exitCode = 1; });
}
