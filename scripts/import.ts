// The daily publish (contract section 6). Run by .github/workflows/import-prices.yml (21:25 UTC and two retries) or by hand:
//
//   npx tsx scripts/import.ts --phase catalog                  # S0..S7, S10, S11, S12, S13: catalogue, prices, history, free views (about 10 minutes after the start)
//   npx tsx scripts/import.ts --phase full --only-stores a,b   # S8, S9, S11, S12, S13: store offers and aggregates, on top of today's phase 1
//   IMPORT_FORCE=1 npx tsx scripts/import.ts --phase catalog   # import even if the sources have not changed
//   IMPORT_STORES=0 ...                                        # phase `full` is skipped (the store stage is off)
//   TCGCSV_CACHE_DIR=... SCRYFALL_CACHE_DIR=... PLANE_REMOTE=<a git remote or a path>   # developer runs, tests: no network for the sources, a local bare repository for the data
//
// THE IMPORTER READS NOTHING FROM NEON. Its memory of last time is a depth-1 checkout of the data branch (PrevState); its output is a tree of JSON files that the publisher validates, commits, verifies and points at (plane/publisher.ts). A refusal, a crash or a failed
// push ends the run red and changes nothing for readers. Neon receives one courtesy ImportRun row at the very end, inside try, with a 10-second timeout.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { createHash, randomInt } from "node:crypto";
import { aggregate, aggregateInfoOf, importCatalog, matchRowsFromTree, recordHistory, revalidateSite, scryfallStamp, snapshotFromTree, tcgcsvStamp, writeCatalogueFiles, type ImportContext, type ImportSummaryV1, type SlugSeed } from "../src/lib/import";
import { MARKETS, normalizeCountry, type Country } from "../src/lib/country";
import { trackConfigFromEnv, trackConfigHash } from "../src/lib/track";
import type { MatchRow } from "../src/lib/match";
import type { StoreResult } from "../src/lib/stores";
import { loadPrevState, type PrevState } from "../src/lib/data/plane/prevstate";
import { publish, restoreState, type PublishInput, type PublishOutcome } from "../src/lib/data/plane/publisher";
import { fsTree, type MutableTree } from "../src/lib/data/plane/tree";
import { validateTree, type Phase } from "../src/lib/data/plane/validate";
import { familyOf } from "../src/lib/data/plane/shards";
import type { PointerFile } from "../src/lib/data/plane/formats";
import type { StatusFile } from "../src/lib/data/plane/status";

export const log = (...a: unknown[]): void => console.log(new Date().toISOString().slice(11, 19), ...a);
/** Thrown by the gate: nothing to do, exit 0. */
export class AlreadyPublished extends Error { constructor(m: string) { super(m); this.name = "AlreadyPublished"; } }
const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");

// ── git access: the token travels in an http extraheader (never in the URL or a log), like scripts/plane-checkout.sh ─────────────────────────────────────────────────────────
export function remoteOf(env: NodeJS.ProcessEnv = process.env): { remote: string; repo: string; github: boolean } {
  const repo = env.PLANE_REPO || "Specifxx/mtgcompare-data";
  if (env.PLANE_REMOTE) return { remote: env.PLANE_REMOTE, repo, github: /^https:\/\/github\.com\//.test(env.PLANE_REMOTE) };
  return { remote: `https://github.com/${repo}.git`, repo, github: true };
}
/** Makes every git child process of this run authenticate to github.com with the write token. No-op without a token or for a local remote. */
export function authenticateGit(env: NodeJS.ProcessEnv = process.env): void {
  const token = env.DATA_REPO_TOKEN; if (!token || !remoteOf(env).github) return;
  const header = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`;
  process.env.GIT_CONFIG_COUNT = "1"; process.env.GIT_CONFIG_KEY_0 = "http.https://github.com/.extraheader"; process.env.GIT_CONFIG_VALUE_0 = header;
  console.log(`::add-mask::${header}`); console.log(`::add-mask::${Buffer.from(`x-access-token:${token}`).toString("base64")}`);
}
/** The pointer without a clone (S0 in under 10 seconds): raw.githubusercontent.com with the token. null when it cannot be read; the gate inside the build then decides from the checkout. */
export async function readRemotePointer(env: NodeJS.ProcessEnv = process.env, f: typeof fetch = fetch): Promise<PointerFile | null> {
  const r = remoteOf(env); if (!r.github || !env.DATA_REPO_TOKEN) return null;
  try { const res = await f(`https://raw.githubusercontent.com/${r.repo}/${env.PLANE_BRANCH || "data"}/latest.json`, { headers: { Authorization: `token ${env.DATA_REPO_TOKEN}` }, cache: "no-store" } as RequestInit); return res.ok ? ((await res.json()) as PointerFile) : null; } catch { return null; }
}
/** S12 step 5: fetch manifest.json, the root files and 50 random files at `ref` through raw with the token and compare their sha-256 prefix with the manifest; retry for up to 2 minutes (propagation). */
export async function verifyThroughRaw(ref: string, env: NodeJS.ProcessEnv = process.env, f: typeof fetch = fetch, o: { sleepMs?: number; maxMs?: number; sample?: number } = {}): Promise<void> {
  const r = remoteOf(env); const token = env.DATA_REPO_TOKEN; const deadline = Date.now() + (o.maxMs ?? 120_000); let last = "";
  const get = async (rel: string): Promise<string> => { const res = await f(`https://raw.githubusercontent.com/${r.repo}/${ref}/v1/${rel}`, { headers: token ? { Authorization: `token ${token}` } : {}, cache: "no-store" } as RequestInit); if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`); return res.text(); };
  for (;;) {
    try {
      const man = JSON.parse(await get("manifest.json")) as { files: [string, number, string][] };
      const pick = new Set<number>(); const want = Math.min(o.sample ?? 50, man.files.length); while (pick.size < want) pick.add(randomInt(man.files.length));
      for (const i of pick) { const [rel, , prefix] = man.files[i]!; const text = await get(rel); if (sha256(text).slice(0, prefix.length) !== prefix) throw new Error(`${rel}: sha-256 differs from the manifest`); }
      return;
    } catch (e) { last = String(e); if (Date.now() >= deadline) throw new Error(`verification through raw failed: ${last}`); await new Promise((res) => setTimeout(res, o.sleepMs ?? 10_000)); }
  }
}

// ── the match index cache (S7): the Actions cache hands it from phase 1 to phase 2 ───────────────────────────────────────────────────────────────────────────────────────────
const cacheDir = (env: NodeJS.ProcessEnv): string => env.IMPORT_CACHE_DIR || ".cache";
/** Where the clones of the data repository live: outside the Actions cache directory (the cache holds the Scryfall slim file and the match index, not 150 MB checkouts). */
export const workRoot = (env: NodeJS.ProcessEnv = process.env): string => env.PLANE_WORK_DIR || path.join(os.tmpdir(), "mtgcompare-plane");
export function writeMatchIndex(rows: readonly MatchRow[], stamp: string, env: NodeJS.ProcessEnv = process.env): void {
  const dir = cacheDir(env); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "match-index.json.gz"), zlib.gzipSync(JSON.stringify({ v: 1, stamp, rows })));
}
export function readMatchIndex(stamp: string, env: NodeJS.ProcessEnv = process.env): MatchRow[] | null {
  const f = path.join(cacheDir(env), "match-index.json.gz"); if (!fs.existsSync(f)) return null;
  try { const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString("utf8")) as { v: number; stamp: string; rows: MatchRow[] }; return j.v === 1 && j.stamp === stamp ? j.rows : null; } catch { return null; }
}
export function readSlugSeed(file = path.join(__dirname, "..", "data", "slug-seed.json")): SlugSeed | null {
  try { const s = JSON.parse(fs.readFileSync(file, "utf8")) as SlugSeed; return s.v === 1 ? s : null; } catch { return null; }
}

// ── one phase ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface PhaseArgs {
  phase: Phase; priceDay: string; tcgcsv: string; scryfall: string; env?: NodeJS.ProcessEnv; onlyStores?: string[]; market?: Country; remote?: string; now?: () => Date;
  /** Test seams: the store stage and the registry lookup (production loads src/lib/store-import.ts and src/lib/stores.ts by name when they exist). */
  deps?: { importStores?: (ctx: ImportContext, o: { only?: string[]; market?: Country }) => Promise<StoreResult[]>; storeId?: (key: string, country: Country) => number | undefined };
}
type Built = Awaited<ReturnType<PublishInput["build"]>>;
export interface PhaseResult { built: Built; summary: Partial<ImportSummaryV1>; ok: boolean }

/** gz size of a tree by family, for status.json (the admin panel's bytes by kind and the repository budget). */
export function familiesOf(tree: MutableTree): StatusFile["families"] {
  const by = new Map<string, [number, number, number]>();
  for (const f of tree.files()) { const text = tree.read(f); const e = by.get(familyOf(f)) ?? [0, 0, 0]; e[0]++; e[1] += Buffer.byteLength(text); e[2] += zlib.gzipSync(text, { level: 6 }).length; by.set(familyOf(f), e); }
  return [...by].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([name, [files, raw, gz]]) => [name, files, raw, gz]);
}
/** Is `e` the error of the module `name` not being there (as opposed to a module that is there and broken, or one of its own imports missing)? The first line of Node's message names the module that could not be found. */
export function isMissingModule(e: unknown, name: string): boolean {
  const code = (e as { code?: string } | null)?.code;
  return (code === "MODULE_NOT_FOUND" || code === "ERR_MODULE_NOT_FOUND") && (String((e as Error).message).split("\n")[0] ?? "").includes(name);
}
/** The store stage (src/lib/store-import.ts importStores) and the registry lookup. A module that does not exist yet means "no store stage": the day stays at phase catalog. A module that exists and fails to load (a syntax error, a missing import of its own, a throw at load time) is an error:
 *  swallowing it would leave phase 2 skipped every day behind a green run. */
export const loadStoreStage = async (specs: { stage: string; registry: string } = { stage: ["..", "src", "lib", "store-import"].join("/"), registry: ["..", "src", "lib", "stores"].join("/") }): Promise<PhaseArgs["deps"]> => {
  let mod: { importStores?: NonNullable<PhaseArgs["deps"]>["importStores"] };
  try { mod = (await import(specs.stage)) as typeof mod; } catch (e) { if (isMissingModule(e, path.basename(specs.stage))) return {}; throw e; }
  if (typeof mod.importStores !== "function") return {};
  let storeId: NonNullable<PhaseArgs["deps"]>["storeId"];
  try { const reg = (await import(specs.registry)) as { storeByKey?: (k: string) => { id: number } | undefined }; if (typeof reg.storeByKey === "function") storeId = (key) => reg.storeByKey!(key)?.id; } catch (e) { if (!isMissingModule(e, path.basename(specs.registry))) throw e; }
  return { importStores: mod.importStores, storeId };
};

/** Builds one phase into `tree` (the checkout of the previous publish) and returns what the publisher needs: counts, the history cut and this run's slice of status.json. `catalog` = S1..S7, S10, S11; `full` = S8, S9, S11. */
export async function buildPhase(tree: MutableTree, c: { prev: PointerFile | null; prevStatus: StatusFile | null; cutDay: boolean }, a: PhaseArgs): Promise<PhaseResult> {
  const env = a.env ?? process.env; const started = Date.now(); const startedAt = new Date().toISOString(); const cfg = trackConfigFromEnv(env);
  if (a.phase === "catalog" && !truthy(env.IMPORT_FORCE) && c.prev && c.prev.tcgcsv === a.tcgcsv && c.prev.scryfall === a.scryfall) throw new AlreadyPublished(`phase catalog is already published for ${a.tcgcsv} / ${a.scryfall}`);
  if (a.phase === "full" && !truthy(env.IMPORT_FORCE) && c.prev && c.prev.phase === "full" && c.prev.tcgcsv === a.tcgcsv && c.prev.scryfall === a.scryfall && runsOfDay(c.prevStatus, a.priceDay) >= 2) throw new AlreadyPublished(`phase full is already published for ${a.tcgcsv} (two store attempts today)`);
  if (a.phase === "catalog" && c.prev && a.priceDay < c.prev.priceDay) throw new Error(`F0: the source's price day ${a.priceDay} is older than the published ${c.prev.priceDay}: a stale TCGCSV copy is never published (the site would read yesterday's prices as today's)`);
  if (a.phase === "full" && (!c.prev || c.prev.tcgcsv !== a.tcgcsv)) throw new Error("phase full needs today's phase 1 on the branch: run --phase catalog first");
  let prevState: PrevState = loadPrevState(tree); let restoredFrom: string | null = null;
  if (prevState.empty && a.remote) { try { const restored = restoreState(a.remote, path.join(workRoot(env), "state")); if (restored && !restored.empty) { prevState = restored; restoredFrom = "state"; log(`PrevState restored from branch state (${restored.slugById.size} slugs, ${restored.slugByOracleNo.size} oracles)`); } } catch (e) { log(`state branch not usable: ${String(e).slice(0, 120)}`); } }
  let summary: Partial<ImportSummaryV1>; let guards: StatusFile["guards"]; let groups: StatusFile["groups"]; let histCut = c.prev?.histCut ?? a.priceDay; let stores: StoreResult[] = []; let ctx: ImportContext; const degraded: string[] = [];
  if (a.phase === "catalog") {
    const bg = env.BOOTSTRAP_GROUPS ? Number(env.BOOTSTRAP_GROUPS) : undefined;
    const imp = await importCatalog({ log, cfg, prev: prevState }, { cacheDir: env.TCGCSV_CACHE_DIR || undefined, scryfallCacheDir: env.SCRYFALL_CACHE_DIR || undefined, slimDir: cacheDir(env), scryfall: env.SCRYFALL_MODE === "off" ? "off" : "auto", tree, slugSeed: readSlugSeed(), bootstrapGroups: bg && bg > 0 ? bg : undefined, lastUpdated: a.tcgcsv });
    ctx = imp.ctx; ctx.work = tree; summary = imp.result.summary; groups = imp.result.groups;
    guards = { flagChange: imp.result.guards.flagChange, groupHold: imp.result.guards.groupHold, storeHold: [], configChanged: imp.result.guards.configChanged, countsOk: true };
    const h = await recordHistory(ctx); summary.history = h; if (h.skipped) { log(h.skipped); summary.guards = { ...summary.guards, priceSanity: h.skipped }; degraded.push(h.skipped); } else histCut = h.cut ? a.priceDay : histCut;
    const w = writeCatalogueFiles(ctx); summary.writes = { filesWritten: w.written, filesUnchanged: w.unchanged, filesRemoved: w.removed, bytes: w.bytes };
    writeMatchIndex(ctx.match, a.tcgcsv, env);
  } else {
    const snapshot = snapshotFromTree(tree, a.priceDay); const tracked = new Set<number>(snapshot.units.map((u) => u.id * 2 + (u.finish === "F" ? 1 : 0)));
    ctx = { log, day: a.priceDay, cfg, prev: prevState, phase: "full", work: tree, snapshot, match: readMatchIndex(a.tcgcsv, env) ?? matchRowsFromTree(tree), joined: new Map(), tracked, offers: { cards: [], sealed: [], reads: [], asOf: (a.now ?? (() => new Date()))().toISOString() } };
    const deps = a.deps?.importStores ? a.deps : await loadStoreStage();
    if (!deps?.importStores) throw new AlreadyPublished("the store stage (src/lib/store-import.ts) is not available: the day stays at phase catalog");
    stores = await deps.importStores(ctx, { only: a.onlyStores?.length ? a.onlyStores : undefined, market: a.market });
    // F2c: a read whose matched count fell under 50% of the last run's is a FAILED read: its rows stay, its freshness does not advance
    // the last matched count of each (store, market) pair, from the newest run that read it: the newest RUN is today's phase 1 (it has no stores), and a manual run of a few stores must not make the others forget
    const memory = new Map<string, number>(); for (const r of c.prevStatus?.runs ?? []) for (const s of r.stores ?? []) if (!memory.has(`${s.key}|${s.market}`)) memory.set(`${s.key}|${s.market}`, s.matched);
    const hold: string[] = [];
    for (const s of stores) { const was = memory.get(`${s.key}|${s.country}`); if (!s.failed && was && (s.matched ?? 0) < was * 0.5) { hold.push(`${s.key}|${s.country}`); const id = deps.storeId?.(s.key, s.country); const m = MARKETS.indexOf(s.country); if (id !== undefined && ctx.offers) for (const r of ctx.offers.reads) if (r.store === id && r.market === m) r.ok = false; } }
    if (hold.length) { log(`F2c: ${hold.length} store read(s) held (matched fell under 50%): ${hold.join(", ")}`); degraded.push(`store hold: ${hold.join(", ")}`); }
    aggregate(ctx, stores);
    const info = aggregateInfoOf(ctx);
    summary = { v: 1, priceDay: a.priceDay, mode: "full", stores, catalogue: { offersPruned: info.offersPruned } as never };
    guards = { ...(c.prevStatus?.guards ?? { flagChange: null, groupHold: [], configChanged: false, countsOk: true }), storeHold: hold };
    groups = c.prevStatus?.groups ?? [];
  }
  // counts, families, this run's record
  const v = validateTree(tree, { phase: a.phase });
  const bookkeeping = ((tree.has("manifest.json") ? 1 : 0) + (tree.has("status.json") ? 1 : 0));               // the manifest and the status copy of the PREVIOUS commit are in the checkout: the file count is the data files, the same on every run of the same day
  const fam = familiesOf(tree);
  const prevCounts = c.prevStatus?.counts;
  const counts: StatusFile["counts"] = { cards: v.counts.cards, listed: v.counts.listed, thin: v.counts.thin, tracked: v.counts.tracked, oracles: v.counts.oracles, sets: ctx.snapshot.sets.length, sealed: a.phase === "catalog" ? ctx.snapshot.sealed.length : prevCounts?.sealed ?? 0, offers: v.counts.offers, files: v.counts.files - bookkeeping, bytesRaw: v.counts.bytes, bytesGz: fam.reduce((x, f) => x + f[3], 0) };
  const run: StatusFile["runs"][number] = { at: new Date().toISOString(), startedAt, kind: a.phase, ok: true, seconds: Math.round((Date.now() - started) / 1000), note: runNote(a.phase, summary, counts, restoredFrom), errors: degraded.length ? degraded : undefined, stores: stores.length ? stores.map((s) => ({ key: s.key, market: s.country, ok: !s.failed, matched: s.matched ?? 0, offers: s.cards + s.sealed, failure: s.failed ? s.skipped ?? s.note : undefined })) : undefined };
  const status: Partial<StatusFile> = {
    counts, families: fam, groups, guards,
    // F10 trips are counted by phase 1 only (phase 2 carries phase 1's guards and its count): counted again there, a trip would be two and the "third consecutive trip" would arrive on the second day
    config: { trackConfigHash: trackConfigHash(cfg), guardTrips: { flagChange: a.phase === "full" ? c.prevStatus?.config?.guardTrips?.flagChange ?? 0 : guards.flagChange ? (c.prevStatus?.config?.guardTrips?.flagChange ?? 0) + 1 : 0 }, catalogFloorCents: cfg.catalogFloorCents, indexFloorCents: cfg.indexFloorCents },
    previous: prevCounts ? { files: prevCounts.files, cards: prevCounts.cards, listed: prevCounts.listed, tracked: prevCounts.tracked, oracles: prevCounts.oracles } : null,
    runs: [run, ...(c.prevStatus?.runs ?? [])].slice(0, 30),
    refusals: c.prevStatus?.refusals ?? [],
  };
  return { built: { counts: { cards: v.counts.cards, units: v.counts.tracked, files: v.counts.files - bookkeeping }, histCut, status }, summary: { ...summary, timings: { ...(summary.timings ?? {}), total: Date.now() - started } }, ok: true };
}
const truthy = (v: string | undefined): boolean => v === "1" || v?.toLowerCase() === "true";
const runsOfDay = (s: StatusFile | null, day: string): number => (s?.runs ?? []).filter((r) => r.kind === "full" && r.at.slice(0, 10) >= day).length;
function runNote(phase: Phase, s: Partial<ImportSummaryV1>, c: StatusFile["counts"], restored: string | null): string {
  if (phase === "full") { const st = s.stores ?? []; return `stores ${st.filter((x) => !x.failed).length} of ${st.length} ok, ${c.offers} offers`; }
  return `${c.cards} cards, ${c.tracked} tracked units, ${c.oracles} oracles${restored ? ` (state restored from ${restored})` : ""}`;
}

// ── the run: gate, publish, hook, courtesy row ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface RunResult { outcome: PublishOutcome | "already-published" | "skipped"; summary?: Partial<ImportSummaryV1>; neon: "recorded" | "skipped" | "failed"; message?: string }
export async function runImport(a: { phase: Phase; onlyStores?: string[]; market?: Country; env?: NodeJS.ProcessEnv; deps?: PhaseArgs["deps"]; fetch?: typeof fetch; skipHook?: boolean }): Promise<RunResult> {
  const env = a.env ?? process.env; const { remote, repo, github } = remoteOf(env);
  if (!remote) throw new Error("PLANE_REPO is not set");
  authenticateGit(env);
  // S0: the sources' stamps against the pointer
  const mode = env.SCRYFALL_MODE === "off" ? "off" : "auto";
  const tcgcsv = await tcgcsvStamp({ cacheDir: env.TCGCSV_CACHE_DIR || undefined, fetch: a.fetch });
  const scryfall = await scryfallStamp({ pinnedDir: env.SCRYFALL_CACHE_DIR || undefined, mode, fetch: a.fetch });
  const priceDay = tcgcsv.slice(0, 10);
  if (!truthy(env.IMPORT_FORCE)) {
    const ptr = await readRemotePointer(env, a.fetch);
    if (ptr && ptr.tcgcsv === tcgcsv && ptr.scryfall === scryfall && (a.phase === "catalog" || ptr.phase === "full")) { log(`Already published: seq ${ptr.seq}, phase ${ptr.phase}, ${tcgcsv}`); return { outcome: "already-published", neon: "skipped" }; }
  }
  let result: PhaseResult | null = null; const started = new Date();
  const workdir = path.join(workRoot(env), "data");
  let outcome: PublishOutcome;
  try {
    outcome = await publish({
      remote, workdir, phase: a.phase, priceDay, tcgcsv, scryfall, repo,
      build: async (tree, ctx) => { result = await buildPhase(tree, ctx, { phase: a.phase, priceDay, tcgcsv, scryfall, env, onlyStores: a.onlyStores, market: a.market, remote, deps: a.deps }); return result.built; },
      verify: github ? (ref) => verifyThroughRaw(ref, env, a.fetch) : undefined,
      onStateBackupError: (e) => log(`::warning::the second copy on branch state was not pushed (the publish is unaffected; slugs and ordinals are recoverable from the data branch until the next good run): ${String(e).slice(0, 200)}`),
    });
  } catch (e) {
    if (e instanceof AlreadyPublished) { log(e.message); return { outcome: "already-published", neon: "skipped", message: e.message }; }
    throw e;
  }
  const summary = (result as PhaseResult | null)?.summary; let neon: RunResult["neon"] = "skipped";
  if (outcome.kind === "refused") { log(`REFUSED: ${outcome.problems.slice(0, 5).map((p) => `${p.code} ${p.message}`).join(" | ")}`); neon = await courtesyRow(env, a.phase, started, false, { ...summary, error: outcome.problems[0]?.message }); return { outcome, summary, neon }; }
  log(`Published seq ${outcome.seq} ${outcome.ref.slice(0, 7)} (${a.phase}, ${priceDay})`);
  if (!a.skipHook && !truthy(env.SKIP_REVALIDATE)) await revalidateSite(log, { pointer: outcome.pointer });
  neon = await courtesyRow(env, a.phase, started, true, summary);
  return { outcome, summary, neon };
}
/** The one courtesy ImportRun row: inside try, 10-second timeout; an unreachable, rotated or deleted database changes nothing (the run records `neon: skipped` or `failed`). */
async function courtesyRow(env: NodeJS.ProcessEnv, kind: Phase, started: Date, ok: boolean, summary: Partial<ImportSummaryV1> | undefined): Promise<RunResult["neon"]> {
  if (!env.DATABASE_URL) return "skipped";
  try {
    const dbSpec = ["..", "src", "lib", "db"].join("/");
    const { prisma } = (await import(dbSpec)) as { prisma: { importRun: { create(a: { data: Record<string, unknown> }): Promise<unknown> }; $disconnect(): Promise<void> } };
    await Promise.race([prisma.importRun.create({ data: { kind, startedAt: started, finishedAt: new Date(), ok, summary: { ...summary, neon: "recorded" } as object } }), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 10_000))]);
    await prisma.$disconnect().catch(() => undefined); return "recorded";
  } catch (e) { log(`ImportRun row not recorded (${String(e).slice(0, 100)}); the data stages do not depend on it`); return "failed"; }
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export function parseArgs(argv: readonly string[]): { phase: Phase | "all"; onlyStores: string[]; market?: Country; force: boolean } {
  const get = (name: string): string | undefined => { const i = argv.findIndex((x) => x === `--${name}` || x.startsWith(`--${name}=`)); if (i < 0) return undefined; return argv[i]!.includes("=") ? argv[i]!.split("=").slice(1).join("=") : argv[i + 1]; };
  const phase = get("phase") ?? "catalog"; if (phase !== "catalog" && phase !== "full" && phase !== "all") throw new Error(`--phase must be catalog, full or all (got ${phase})`);
  const only = (get("only-stores") ?? process.env.IMPORT_ONLY_STORES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const mk = get("market") ?? process.env.IMPORT_ONLY_COUNTRY;
  return { phase, onlyStores: only, market: mk ? normalizeCountry(mk) : undefined, force: argv.includes("--force") };
}
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2)); if (args.force) process.env.IMPORT_FORCE = "1";
  if (process.env.IMPORT_STORES === "0" && args.phase === "full") { log("IMPORT_STORES=0: the store stage is off; nothing to do"); return; }
  const phases: Phase[] = args.phase === "all" ? (process.env.IMPORT_STORES === "0" ? ["catalog"] : ["catalog", "full"]) : [args.phase];
  for (const phase of phases) {
    const r = await runImport({ phase, onlyStores: args.onlyStores, market: args.market });
    if (typeof r.outcome === "object" && r.outcome.kind === "refused") { process.exitCode = 1; return; }
  }
}
if (process.argv[1] && /scripts[\\/]import\.ts$/.test(process.argv[1])) {
  main().catch((e) => { console.error(e); process.exitCode = 1; });
}
