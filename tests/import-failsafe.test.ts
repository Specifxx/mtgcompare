// The failsafes of the importer (contract C17, Annex C check 12), owner WP01b: the publisher fails closed. A partial TCGCSV day never deletes, nulls or unlists; a group or store that vanishes or comes back unpriced is HELD (its rows keep every flag); a mass change of
// flags keeps the old flags; the hard caps refuse; an absent product is GONEP for one complete day and GONE for the second; F7 keeps the history of a half-priced day out. Every scenario runs the real importer on the 57 real products of tests/fixtures/magic-products.json
// (no network). Volume that a failsafe needs (F2 judges days of over 1,000 products, F10 catalogues of over 1,000 rows) comes from CLONES of those real records under new productIds: same name, group, number and prices, so every price in here is a real TCGplayer price.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { bootstrap } from "../scripts/bootstrap";
import { buildPhase } from "../scripts/import";
import { goneReport } from "../scripts/prune-catalog";
import { aggregate, aggregateInfoOf, importCatalog, snapshotFromTree, writeCatalogueFiles, type ImportContext, type OfferStage } from "../src/lib/import";
import { loadPrevState, type PrevState } from "../src/lib/data/plane/prevstate";
import { fsTree, memTree, type MutableTree } from "../src/lib/data/plane/tree";
import { PRICE_MASK } from "../src/lib/constants";
import { TRACK_DEFAULTS, trackConfigHash, trackConfigFromEnv, type TrackConfig } from "../src/lib/track";
import type { StoreResult } from "../src/lib/stores";
import type { PointerFile } from "../src/lib/data/plane/formats";
import type { StatusFile } from "../src/lib/data/plane/status";
import { importEnv, magicFixtures, miniMagicDay, tmpRoot, type MiniDayOpts, type MiniProduct } from "./helpers/publish-harness";
import fs from "node:fs";

const quiet = (): void => undefined;
const NOW = (): Date => new Date("2026-10-08T01:00:00Z");
const D2 = "2026-10-08T20:06:09Z", D3 = "2026-10-09T20:06:09Z";
const FLAGS = PRICE_MASK.LISTED | PRICE_MASK.THIN | PRICE_MASK.TRACKN | PRICE_MASK.TRACKF;
const SLD = 2576, PRERELEASE = 92, THE_LIST = 2715;                                                                                       // the three biggest bucket groups of the real game
// real class-0 records whose best price is between $2 and $10: listed at a $1 floor, unlisted when the price falls to a twentieth
const REAL_CLASS0 = magicFixtures().filter((f) => { const best = Math.max(f.prices.Normal?.market ?? 0, f.prices.Foil?.market ?? 0); return f.tcgRarity && f.expect.cls === 0 && best >= 2 && best <= 10; });
const asProduct = (f: ReturnType<typeof magicFixtures>[number], id: number, groupId = f.groupId): MiniProduct => ({ productId: id, name: f.name, groupId, number: f.tcgNumber, rarity: f.tcgRarity, Normal: f.prices.Normal, Foil: f.prices.Foil });
/** `n` clones of real class-0 records priced between $2 and $10, ids from `from`, all in `groupId` (or each in its own group). */
const clones = (n: number, from: number, groupId?: number): MiniProduct[] => Array.from({ length: n }, (_, i) => asProduct(REAL_CLASS0[i % REAL_CLASS0.length]!, from + i, groupId));
const idsOf = (ps: readonly MiniProduct[]): number[] => ps.map((p) => p.productId);

interface Base { t: ReturnType<typeof tmpRoot>; tree: MutableTree; prev: PrevState; ctx: ImportContext; groups: [number, number, number][]; opts: { cacheDir: string; scryfallCacheDir: string; lastUpdated: string } }
/** Day 1 through importCatalog and writeCatalogueFiles into a memory tree, and the PrevState a publisher would load from it (the group-hold memory is hand-built from the day's group counts, like status.json would carry it). */
async function baseline(o: MiniDayOpts, cfg: TrackConfig = TRACK_DEFAULTS): Promise<Base> {
  const t = tmpRoot(); const day = miniMagicDay(path.join(t.root, "d1"), o); const opts = { cacheDir: day.tcgDir, scryfallCacheDir: day.scryDir, lastUpdated: day.stamp };
  const all = await importCatalog({ log: quiet, cfg, prev: loadPrevState(memTree()) }, opts); writeCatalogueFiles(all.ctx);
  const prev: PrevState = { ...loadPrevState(all.ctx.work), groups: new Map(all.result.groups.map(([g, a, b]) => [g, [a, b] as [number, number]])), configHash: trackConfigHash(cfg) };
  return { t, tree: all.ctx.work, prev, ctx: all.ctx, groups: all.result.groups, opts };
}
/** A later day over a baseline: the same importer, the memory of day 1. */
async function nextDay(b: Base, o: MiniDayOpts, cfg: TrackConfig = TRACK_DEFAULTS, prev: PrevState = b.prev, n = 2): Promise<Awaited<ReturnType<typeof importCatalog>>> {
  const day = miniMagicDay(path.join(b.t.root, `d${n}`), { stamp: D2, ...o });
  return importCatalog({ log: quiet, cfg, prev }, { cacheDir: day.tcgDir, scryfallCacheDir: day.scryDir, lastUpdated: day.stamp, tree: b.tree });
}
const maskOf = (ctx: ImportContext): Map<number, number> => new Map(ctx.snapshot.cards.map((c, i) => [c.id, ctx.snapshot.prices[i]!.mask] as const));
const absentOf = (ctx: ImportContext): Map<number, number> => new Map(ctx.snapshot.absent?.cards ?? []);
const groupOfCard = (ctx: ImportContext): Map<number, number> => new Map(ctx.snapshot.cards.map((c) => [c.id, c.setId] as const));

// ── F1, F2: the day itself ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("F1: a group whose files cannot be read makes the day incomplete: the run is refused before anything is written", async () => {
  const t = tmpRoot(); try {
    const day = miniMagicDay(t.root); fs.writeFileSync(path.join(day.tcgDir, "2576", "prices.json"), '{"success":true,"results":[{"productId":2');   // a truncated download
    await assert.rejects(importCatalog({ log: quiet, cfg: TRACK_DEFAULTS, prev: loadPrevState(memTree()) }, { cacheDir: day.tcgDir, scryfallCacheDir: day.scryDir, lastUpdated: day.stamp }), /^Error: F1: 1 included group\(s\) could not be read \(2576\)/);
    const plane = path.join(t.root, "plane"); await assert.rejects(bootstrap({ ...importEnv(t.root, day), PLANE_DIR: plane }, NOW), /F1/);
    assert.equal(fs.existsSync(path.join(plane, "latest.json")), false, "no pointer"); assert.equal(fsTree(path.join(plane, "v1")).files().length, 0, "no file");
  } finally { t.done(); }
});

test("F2: a day with under 90% of the last publish's products, or of its priced products, is refused when the last publish had over 1,000; 95% passes and the missing 5% are GONEP, not deleted", async () => {
  const extra = clones(1100, 5_000_000); const b = await baseline({ products: extra });
  try {
    assert.ok(b.prev.groups.size > 20 && [...b.prev.groups.values()].reduce((a, [p]) => a + p, 0) > 1100, "the last publish held over 1,000 products");
    await assert.rejects(nextDay(b, { products: extra, drop: new Set(idsOf(extra.slice(0, 160))) }), /^Error: F2: \d+ products and \d+ priced against \d+ and \d+ in the last publish \(under 90%\)/);
    const unpriced = new Set(idsOf(extra.slice(0, 200)));                                                                                    // every product is there, 200 of them without a price row
    await assert.rejects(nextDay(b, { products: extra, patch: (p) => (unpriced.has(p.productId) ? { ...p, Normal: undefined, Foil: undefined } : p) }), /^Error: F2: /);
    const lost = extra.slice(0, 40); const ok = await nextDay(b, { products: extra, drop: new Set(idsOf(lost)) });                          // 3.5% gone: a normal day
    const absent = absentOf(ok.ctx); for (const p of lost) { const m = absent.get(p.productId); assert.ok(m !== undefined, `${p.productId} is an absent row, not deleted`); assert.ok(m & PRICE_MASK.GONEP && m & PRICE_MASK.LISTED, `${p.productId}: GONEP on the first complete day, still listed`); }
    assert.deepEqual(ok.result.guards.groupHold, [], "no group fell under 90%: every big group lost under a tenth");
  } finally { b.t.done(); }
});

// ── F2b: the three real bucket groups ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Secret Lair Drop (2576), Prerelease Cards (92) and The List (2715) hold thousands of products each in the real game. A day that lists a group with under 90% of its products, or under 90% of its priced products, or not at all, is a defect of the source for THAT
// group: its rows keep every flag (LISTED, THIN, TRACK), they are not made GONEP, and the numbers the group is held at do not ratchet down. The floor is $1 so that a price that fell to a twentieth WOULD unlist a row if the group were not held.
const CFG1 = { ...TRACK_DEFAULTS, catalogFloorCents: 100, oracleComplete: false } as TrackConfig;
const bucketDay = (): MiniDayOpts => ({ products: [...clones(20, 6_000_000, SLD), ...clones(20, 6_100_000, PRERELEASE), ...clones(20, 6_200_000, THE_LIST), ...clones(20, 6_300_000, 2809)] });   // 2809 is the control: a healthy set
test("F2b: a bucket group that vanished from the day, one under 90% of its products and one under 90% priced are HELD with every flag; a healthy group that lost one product is not", async () => {
  const day1 = bucketDay(); const b = await baseline(day1, CFG1);
  try {
    const cardsIn = (g: number): number[] => [...groupOfCard(b.ctx)].filter(([, s]) => s === g).map(([id]) => id);
    for (const g of [SLD, PRERELEASE, THE_LIST]) assert.ok(cardsIn(g).length >= 18, `group ${g} has ${cardsIn(g).length} catalogue rows on day 1`);
    const was = maskOf(b.ctx); const crash = (p: MiniProduct): MiniProduct => ({ ...p, Normal: p.Normal && { market: (p.Normal.market ?? 0) * 0.05, low: (p.Normal.low ?? 0) * 0.05 }, Foil: p.Foil && { market: (p.Foil.market ?? 0) * 0.05, low: (p.Foil.low ?? 0) * 0.05 } });
    const clonesOf = (g: number): MiniProduct[] => (day1.products ?? []).filter((p) => p.groupId === g);
    const dropped92 = new Set(idsOf(clonesOf(PRERELEASE).slice(0, 4))), unpriced2715 = new Set(idsOf(clonesOf(THE_LIST).slice(0, 4))), dropped2809 = new Set(idsOf(clonesOf(2809).slice(0, 1)));
    // every clone loses 95% of its price, so a group that is NOT held would unlist its rows
    const two = await nextDay(b, { ...day1, hideGroups: new Set([SLD]), drop: new Set([...dropped92, ...dropped2809]), patch: (p) => { const q = (p.productId >= 6_000_000 ? crash(p) : p); return unpriced2715.has(p.productId) ? { ...q, Normal: undefined, Foil: undefined } : q; } }, CFG1);
    assert.deepEqual(two.result.guards.groupHold, [PRERELEASE, SLD, THE_LIST].sort((x, y) => x - y), "the three real groups are held, the control is not");
    const now = maskOf(two.ctx), gone = absentOf(two.ctx), where = groupOfCard(two.ctx);
    // 2576 vanished: its rows are carried as absent with the mask they had
    for (const id of cardsIn(SLD)) { assert.ok(!now.has(id), `${id} is not in today's rows`); assert.equal(gone.get(id), was.get(id), `${id}: the vanished group keeps its published mask (LISTED, no GONEP)`); assert.ok(!(gone.get(id)! & PRICE_MASK.GONEP)); }
    // 92 and 2715: the rows that are there keep every flag although their price fell to a twentieth
    for (const g of [PRERELEASE, THE_LIST]) for (const id of cardsIn(g)) {
      const m = now.get(id) ?? gone.get(id); assert.ok(m !== undefined, `${id} (group ${g}) is still a row`); assert.equal(m & FLAGS, was.get(id)! & FLAGS, `${id} (group ${g}) keeps LISTED / THIN / TRACK`); assert.ok(!(m & PRICE_MASK.GONEP), `${id}: a held row is never GONEP`);
    }
    // the control group (one product of 21 gone, prices down to a fifth) is judged normally: its rows lose LISTED, the vanished one is GONEP
    const ctl = cardsIn(2809).filter((id) => where.get(id) === 2809 || gone.has(id)); assert.ok(ctl.length >= 18);
    let unlisted = 0; for (const id of ctl) { const m = now.get(id); if (m !== undefined && !(m & PRICE_MASK.LISTED)) unlisted++; } assert.ok(unlisted >= 10, `${unlisted} control rows were unlisted: an unheld group is judged on today's prices`);
    for (const id of dropped2809) assert.ok(gone.get(id)! & PRICE_MASK.GONEP, "the control's missing product is GONEP");
    // the group memory does not ratchet down: a held group keeps the counts it was held at
    const mem = new Map(two.result.groups.map(([g, p, pr]) => [g, [p, pr] as [number, number]]));
    for (const g of [SLD, PRERELEASE, THE_LIST]) assert.deepEqual(mem.get(g), b.prev.groups.get(g), `group ${g} is remembered at the numbers it was held at`);
    assert.deepEqual(mem.get(2809), [b.prev.groups.get(2809)![0] - 1, b.prev.groups.get(2809)![1] - 1], "the control group is remembered at today's numbers");
  } finally { b.t.done(); }
});

test("F2b through the whole pipeline: the status record carries the hold, the published tree still lists the vanished group, and the next complete day releases it", async () => {
  const t = tmpRoot(); try {
    const plane = path.join(t.root, "plane"); const day1 = bucketDay();
    const run = async (n: number, o: MiniDayOpts) => { const d = miniMagicDay(path.join(t.root, `d${n}`), o); return bootstrap({ ...importEnv(path.join(t.root, `e${n}`), d), PLANE_DIR: plane, TRACK_FLOOR_CENTS: "500" }, () => new Date(`2026-10-${String(8 + n).padStart(2, "0")}T01:00:00Z`)); };
    const a = await run(1, day1); assert.deepEqual(a.problems, []); const listed1 = a.listed;
    const b = await run(2, { ...day1, stamp: D2, hideGroups: new Set([SLD]) }); assert.deepEqual(b.problems, [], "a day without the biggest bucket group still validates"); assert.equal(b.listed, listed1, "not one row was unlisted");
    const st = JSON.parse(fs.readFileSync(path.join(plane, "status.json"), "utf8")) as StatusFile; assert.deepEqual(st.guards.groupHold, [SLD]); const sldMem = st.groups.find((g) => g[0] === SLD); assert.ok(sldMem && sldMem[1] >= 20, "the group is remembered at the numbers it was held at");
    const c = await run(3, { ...day1, stamp: D3 }); assert.deepEqual(c.problems, []); const st3 = JSON.parse(fs.readFileSync(path.join(plane, "status.json"), "utf8")) as StatusFile; assert.deepEqual(st3.guards.groupHold, [], "the group is back: released");
  } finally { t.done(); }
});

// ── F10, F6 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("F10: more than 5% of the existing rows changing LISTED keeps the old flags; the third consecutive trip, a changed config and IMPORT_ACCEPT_FLAG_CHANGE release it", async () => {
  const extra = clones(1100, 7_000_000, 2809); const b = await baseline({ products: extra }, CFG1);
  try {
    assert.ok(b.prev.maskById.size >= 1000, `${b.prev.maskById.size} rows: the guard judges catalogues of over 1,000 rows`); const was = maskOf(b.ctx);
    const crash = new Set(idsOf(extra.slice(0, 330)));                                                                                    // 30% of the clones fall to a twentieth of their price: far under the $1 floor, so LISTED would go
    const day2: MiniDayOpts = { products: extra, patch: (p) => (crash.has(p.productId) ? { ...p, Normal: p.Normal && { market: (p.Normal.market ?? 0) * 0.05, low: (p.Normal.low ?? 0) * 0.05 }, Foil: p.Foil && { market: (p.Foil.market ?? 0) * 0.05, low: (p.Foil.low ?? 0) * 0.05 } } : p) };
    const free = await nextDay(b, day2, CFG1, { ...b.prev, guardTrips: 99 });                                                              // 99 earlier trips: released ("persisted"); what the day does when nothing stops it
    assert.equal(free.result.guards.flagChange, null); const unlistedFree = [...crash].filter((id) => !(maskOf(free.ctx).get(id)! & PRICE_MASK.LISTED)).length; assert.ok(unlistedFree > 250, `${unlistedFree} rows lose LISTED when the guard is released`);
    const trip = await nextDay(b, day2, CFG1);
    assert.match(trip.result.guards.flagChange ?? "", /^LISTED would change on \d+ of \d+ rows/); const now = maskOf(trip.ctx);
    for (const id of crash) assert.equal(now.get(id)! & FLAGS, was.get(id)! & FLAGS, `${id} keeps its old flags`); assert.equal(trip.result.summary.guards?.flagChange, trip.result.guards.flagChange);
    const third = await nextDay(b, day2, CFG1, { ...b.prev, guardTrips: 2 }); assert.equal(third.result.guards.flagChange, null, "the 3rd consecutive trip is accepted: a real repricing cannot lock the old flags forever");
    const accepted = await nextDay(b, day2, { ...CFG1, acceptFlagChange: true }); assert.equal(accepted.result.guards.flagChange, null);
    const changed = await nextDay(b, day2, CFG1, { ...b.prev, configHash: "another-config" }); assert.equal(changed.result.guards.flagChange, null); assert.equal(changed.result.guards.configChanged, true);
    const small = await nextDay(b, { products: extra, patch: (p) => (idsOf(extra.slice(0, 40)).includes(p.productId) ? { ...p, Normal: p.Normal && { market: (p.Normal.market ?? 0) * 0.05, low: 0.01 }, Foil: undefined } : p) }, CFG1); assert.equal(small.result.guards.flagChange, null, "under 5% of the rows is a market, not a defect");
  } finally { b.t.done(); }
});

test("F6: more catalogue rows than CATALOG_MAX_ROWS, or more tracked units than TRACK_MAX_UNITS, refuses the run", async () => {
  const t = tmpRoot(); try {
    const day = miniMagicDay(t.root); const opts = { cacheDir: day.tcgDir, scryfallCacheDir: day.scryDir, lastUpdated: day.stamp };
    await assert.rejects(importCatalog({ log: quiet, cfg: { ...TRACK_DEFAULTS, catalogMaxRows: 30 }, prev: loadPrevState(memTree()) }, opts), /^Error: F6: \d+ catalogue rows exceed CATALOG_MAX_ROWS 30/);
    await assert.rejects(importCatalog({ log: quiet, cfg: { ...TRACK_DEFAULTS, trackMaxUnits: 5 }, prev: loadPrevState(memTree()) }, opts), /^Error: F6: \d+ tracked units exceed TRACK_MAX_UNITS 5/);
    assert.equal(trackConfigFromEnv({ CATALOG_MAX_ROWS: "30" }).catalogMaxRows, 30, "the caps are the environment's dials");
    await importCatalog({ log: quiet, cfg: TRACK_DEFAULTS, prev: loadPrevState(memTree()) }, opts);
  } finally { t.done(); }
});

// ── GONEP, GONE ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("an absent product is GONEP on the first complete day it is missing and GONE (unlisted, untracked) on the second; it returns whole; a sealed product follows the same two steps", async () => {
  const t = tmpRoot(); try {
    const plane = path.join(t.root, "plane"); const base = bucketDay(); const card = base.products![50]!.productId, sealed = 686671;                 // a clone in Modern Horizons 2 (21 products, so one missing is 95%: not a held group) and the Deadpool Secret Lair bundle (1 of 26 in Secret Lair Drop)
    const run = async (n: number, drop: ReadonlySet<number>) => { const d = miniMagicDay(path.join(t.root, `d${n}`), { ...base, stamp: `2026-10-${String(6 + n).padStart(2, "0")}T20:06:09Z`, drop }); return bootstrap({ ...importEnv(path.join(t.root, `e${n}`), d), PLANE_DIR: plane }, () => new Date(`2026-10-${String(7 + n).padStart(2, "0")}T01:00:00Z`)); };
    const sealedFlags = (): number => { const f = fsTree(path.join(plane, "v1")); for (const file of f.files()) if (/^sl\/list-\d+\.json$/.test(file)) for (const r of (JSON.parse(f.read(file)) as { s: (number | string)[][] }).s) if (r[0] === sealed) return Number(r[7]); return -1; };
    const maskNow = (): number | undefined => loadPrevState(fsTree(path.join(plane, "v1"))).maskById.get(card);
    const a = await run(1, new Set()); assert.deepEqual(a.problems, []); const m1 = maskNow()!; assert.ok(m1 & PRICE_MASK.LISTED && !(m1 & (PRICE_MASK.GONEP | PRICE_MASK.GONE))); const s1 = sealedFlags(); assert.ok(s1 >= 0 && !(s1 & 6));
    const b = await run(2, new Set([card, sealed])); assert.deepEqual(b.problems, []); const m2 = maskNow()!; assert.ok(m2 & PRICE_MASK.GONEP && m2 & PRICE_MASK.LISTED && !(m2 & PRICE_MASK.GONE), "day 1 missing: GONEP, still listed"); assert.equal(sealedFlags() & 6, 4, "the sealed product: GONEP (4)");
    const c = await run(3, new Set([card, sealed])); assert.deepEqual(c.problems, []); const m3 = maskNow()!; assert.ok(m3 & PRICE_MASK.GONE && !(m3 & PRICE_MASK.LISTED) && !(m3 & (PRICE_MASK.TRACKN | PRICE_MASK.TRACKF)), "day 2 missing: GONE, unlisted, untracked"); assert.ok(sealedFlags() & 2, "the sealed product: GONE (2)");
    const rep = goneReport(fsTree(path.join(plane, "v1"))); assert.deepEqual(rep.goneIds, [card], "the report lists the GONE row"); assert.equal(rep.goneSealed, 1); assert.ok(rep.goneWithPrice >= 1, "with the last price it had"); assert.ok(rep.rows > 50 && rep.gonep === 0, JSON.stringify(rep));
    const d = await run(4, new Set()); assert.deepEqual(d.problems, []); const m4 = maskNow()!; assert.ok(m4 & PRICE_MASK.LISTED && !(m4 & (PRICE_MASK.GONEP | PRICE_MASK.GONE)), "back: listed again, the flags cleared"); assert.equal(sealedFlags() & 6, 0);
    const one = await run(5, new Set([card])); assert.deepEqual(one.problems, []); const m5 = maskNow()!; assert.ok(m5 & PRICE_MASK.GONEP && !(m5 & PRICE_MASK.GONE), "a gap of one day starts the count again");
  } finally { t.done(); }
});

// ── the store stage ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// A store that vanishes (its site is down, its platform changed, its feed came back nearly empty) is a failed READ, never a day without offers: its rows stay, its freshness does not advance, and 72 hours after its last good read they read as out of stock.
const TEST_STORE = 10;                                                                                                                      // a store id of the publishable range (the registry arrives with WP04; the importer only needs the id)
interface Staged { cards: OfferStage["cards"]; sealed: OfferStage["sealed"]; reads: OfferStage["reads"] }
function storeCtx(tree: MutableTree, day: string, asOf: string, prev: PrevState): ImportContext {
  const snapshot = snapshotFromTree(tree, day); const tracked = new Set<number>(snapshot.units.map((u) => u.id * 2 + (u.finish === "F" ? 1 : 0)));
  return { log: quiet, day, cfg: TRACK_DEFAULTS, prev, phase: "full", work: tree, snapshot, match: [], joined: new Map(), tracked, offers: { cards: [], sealed: [], reads: [], asOf } };
}
/** The real TCGplayer market (cents) of every unit with one: a store offer in these tests is a fraction of it, never a number made up. */
const marketsOf = (tree: MutableTree): Map<number, number> => { const m = new Map<number, number>(); for (const f of tree.files()) if (f.startsWith("px/")) for (const r of (JSON.parse(tree.read(f)) as { p: (number | null)[][] }).p) { if (r[1] != null) m.set(r[0]! * 2, r[1]); if (r[2] != null) m.set(r[0]! * 2 + 1, r[2]); } return m; };
const result = (matched: number, failed = false): StoreResult => ({ key: "teststore", country: "US", platform: "shopify", products: matched, cards: matched, sealed: 0, inStock: matched, failed, misses: {}, matched });
test("a vanishing store: a failed read keeps its rows and its run row; the rows read as out of stock 72 hours after the last good read, never before; a good read replaces them", async () => {
  const t = tmpRoot(); const plane = path.join(t.root, "plane"); try {
    const d1 = miniMagicDay(path.join(t.root, "d1")); const a = await bootstrap({ ...importEnv(path.join(t.root, "e1"), d1), PLANE_DIR: plane }, NOW); assert.deepEqual(a.problems, []);
    const tree = fsTree(path.join(plane, "v1")); const prev = loadPrevState(tree); const units = [...snapshotFromTree(tree, "2026-10-07").units].map((u) => u.id * 2 + (u.finish === "F" ? 1 : 0)).slice(0, 8); assert.equal(units.length, 8);
    const mk = marketsOf(tree); const read = (at: string): Staged => ({ cards: units.map((uid, i) => ({ uid, market: 0, store: TEST_STORE, priceCents: Math.round(mk.get(uid)! * (0.9 + i * 0.01)), condition: 1, inStock: 1 as const, path: `/p/${uid}` })), sealed: [], reads: [{ store: TEST_STORE, market: 0, ok: true, at }] });
    // good read at t0
    const c0 = storeCtx(tree, "2026-10-07", "2026-10-08T05:00:00Z", prev); Object.assign(c0.offers!, read("2026-10-08T04:00:00Z")); aggregate(c0, [result(8)]);
    const ofRows = (): number => { let n = 0; for (const f of tree.files()) if (f.startsWith("of/")) n += (JSON.parse(tree.read(f)) as { o: unknown[] }).o.length; return n; };
    const runsOf = (): (string | number)[][] => (JSON.parse(tree.read("ss/runs.json")) as { r: (string | number)[][] }).r;
    const flatRows = (): number => { let n = 0; for (const f of tree.files()) if (/^ix\/f-\d+\.json$/.test(f)) n += (JSON.parse(tree.read(f)) as { n: number }).n; return n; };
    assert.equal(ofRows(), 8); assert.equal(flatRows(), 8, "the store picker lists the 8 fresh in-stock offers"); assert.equal(runsOf().length, 1); const un = (uid: number): (number | null)[] | undefined => { for (const f of tree.files()) if (f.startsWith("un/")) { const r = (JSON.parse(tree.read(f)) as { u: [number, (number | null)[], number[], (number | null)[]][] }).u.find((x) => x[0] === uid); if (r) return r[2]; } return undefined; };
    assert.equal(un(units[0]!)![0], 1, "one store has the unit in stock in the US");
    // the store vanishes: no read at all (its site is down, importStores returns a failed result and stages nothing)
    const c1 = storeCtx(tree, "2026-10-07", "2026-10-09T04:00:00Z", prev); aggregate(c1, [result(0, true)]);                    // 24 h after the last good read
    assert.equal(ofRows(), 8, "the rows stay"); assert.equal(runsOf()[0]![2], "2026-10-08T04:00:00Z", "the run row keeps the time of the last GOOD read"); assert.equal(un(units[0]!)![0], 1, "still in stock after 24 h"); assert.equal(flatRows(), 8);
    const c2 = storeCtx(tree, "2026-10-07", "2026-10-10T03:00:00Z", prev); aggregate(c2, [result(0, true)]); assert.equal(un(units[0]!)![0], 1, "47 h: still in stock"); assert.equal(flatRows(), 8);
    const c3 = storeCtx(tree, "2026-10-07", "2026-10-11T05:00:00Z", prev); aggregate(c3, [result(0, true)]); assert.equal(ofRows(), 8, "73 h: the rows are still there"); assert.equal(un(units[0]!)![0], 0, "73 h after the last good read the offers read as out of stock"); assert.equal(flatRows(), 0, "and the store picker no longer lists them (ix/f carries no run time, so the writer applies the 72-hour rule)");
    // a read that was not even attempted (the store is absent from this run altogether) is the same
    const c4 = storeCtx(tree, "2026-10-07", "2026-10-11T06:00:00Z", prev); aggregate(c4, []); assert.equal(ofRows(), 8);
    // the store comes back with a smaller catalogue: the pair's rows are replaced by what it lists now
    const c5 = storeCtx(tree, "2026-10-07", "2026-10-12T05:00:00Z", prev); const back = read("2026-10-12T04:00:00Z"); back.cards = back.cards.slice(0, 3); Object.assign(c5.offers!, back); aggregate(c5, [result(3)]);
    assert.equal(ofRows(), 3, "a good read replaces the pair's rows"); assert.equal(flatRows(), 3); assert.equal(un(units[0]!)![0], 1); assert.equal(un(units[5]!)![0], 0); assert.equal(runsOf()[0]![2], "2026-10-12T04:00:00Z");
  } finally { t.done(); }
});

test("aggregate: one row per (unit, market, store) (in stock, then best condition, then lowest price), the offer budget drops the cheapest units first, an untracked unit gets no row", async () => {
  const t = tmpRoot(); const plane = path.join(t.root, "plane"); try {
    const d1 = miniMagicDay(path.join(t.root, "d1")); await bootstrap({ ...importEnv(path.join(t.root, "e1"), d1), PLANE_DIR: plane }, NOW);
    const units = snapshotFromTree(fsTree(path.join(plane, "v1")), "2026-10-07").units.map((u) => ({ uid: u.id * 2 + (u.finish === "F" ? 1 : 0), id: u.id })); assert.ok(units.length >= 10);
    const run = (cfgPatch: Partial<TrackConfig>, build: (ctx: ImportContext) => void): { rows: Map<number, number[][]>; ctx: ImportContext } => {
      const tree = fsTree(path.join(plane, "v1")); const mem = memTree(tree.files().map((f) => [f, tree.read(f)] as [string, string])); const ctx = storeCtx(mem, "2026-10-07", "2026-10-08T05:00:00Z", loadPrevState(mem)); ctx.cfg = { ...ctx.cfg, ...cfgPatch };
      build(ctx); aggregate(ctx, [result(1)]); const rows = new Map<number, number[][]>();
      for (const f of mem.files()) if (f.startsWith("of/")) for (const o of (JSON.parse(mem.read(f)) as { o: number[][] }).o) { const a = rows.get(o[0]!) ?? []; a.push(o); rows.set(o[0]!, a); }
      return { rows, ctx };
    };
    const mk = marketsOf(fsTree(path.join(plane, "v1"))); const u0 = units[0]!.uid; const real = mk.get(u0)!; const at = (k: number): number => Math.round(real * k); assert.ok(real >= 500, "a tracked unit's market is at least the $5 floor, so 0.9, 1.0 and 1.1 of it are three different prices");
    const offer = (uid: number, price: number, condition: number | null, inStock: 0 | 1, p: string, store = TEST_STORE) => ({ uid, market: 0, store, priceCents: price, condition, inStock, path: p });
    const one = run({}, (ctx) => { ctx.offers!.cards.push(offer(u0, at(0.9), 2, 1, "/b"), offer(u0, at(1.1), 1, 1, "/a"), offer(u0, at(0.1), 0, 0, "/oos"), offer(u0, at(1), 1, 1, "/c"), offer(u0, at(1.2), 1, 1, "/d", TEST_STORE + 1), offer(99_999_999, at(0.5), 1, 1, "/untracked")); ctx.offers!.reads.push({ store: TEST_STORE, market: 0, ok: true, at: "2026-10-08T04:00:00Z" }, { store: TEST_STORE + 1, market: 0, ok: true, at: "2026-10-08T04:00:00Z" }); });
    const mine = one.rows.get(u0)!; assert.equal(mine.length, 2, "one row per store"); const byStore = new Map(mine.map((r) => [r[2]!, r])); assert.deepEqual(byStore.get(TEST_STORE)!.slice(3, 7), [at(1), 1, 1, "/c" as unknown as number], "in stock beats out of stock; among the in-stock, the better condition (NM=0 < LP=1 < MP=2), then the lower price");
    assert.equal(one.rows.has(99_999_999), false, "a unit that is not tracked has no offer row");
    const all = units.slice(0, 8); const pruned = run({ offerRowsBudget: 5 }, (ctx) => { for (const u of all) for (let k = 0; k < 2; k++) ctx.offers!.cards.push(offer(u.uid, mk.get(u.uid)! + k, 1, 1, `/${u.uid}`, TEST_STORE + k)); ctx.offers!.reads.push({ store: TEST_STORE, market: 0, ok: true, at: "2026-10-08T04:00:00Z" }, { store: TEST_STORE + 1, market: 0, ok: true, at: "2026-10-08T04:00:00Z" }); });
    const total = [...pruned.rows.values()].reduce((a, r) => a + r.length, 0); assert.ok(total <= 5 && total > 0, `${total} rows under a budget of 5`); assert.equal(aggregateInfoOf(pruned.ctx).offersPruned, 16 - total);
    const kept = new Set(pruned.rows.keys()); const dropped = all.filter((u) => !kept.has(u.uid)); assert.ok(dropped.length > 0 && kept.size > 0, "some units kept, some dropped, whole units at a time");
  } finally { t.done(); }
});
test("F2c: a store read whose matched count fell under 50% of the last run's is HELD (rows kept, freshness not advanced), and the record says so", async () => {
  const t = tmpRoot(); const plane = path.join(t.root, "plane"); try {
    const d1 = miniMagicDay(path.join(t.root, "d1")); const env = importEnv(path.join(t.root, "e1"), d1, { IMPORT_FORCE: "1" }); const a = await bootstrap({ ...env, PLANE_DIR: plane }, NOW); assert.deepEqual(a.problems, []);
    const tree = fsTree(path.join(plane, "v1")); const ptr = JSON.parse(fs.readFileSync(path.join(plane, "latest.json"), "utf8")) as PointerFile; let status = JSON.parse(fs.readFileSync(path.join(plane, "status.json"), "utf8")) as StatusFile;
    const units = snapshotFromTree(tree, "2026-10-07").units.map((u) => u.id * 2 + (u.finish === "F" ? 1 : 0)).slice(0, 10);
    const mk = marketsOf(tree); const stage = (ctx: ImportContext, n: number, at: string): void => { for (const uid of units.slice(0, n)) ctx.offers!.cards.push({ uid, market: 0, store: TEST_STORE, priceCents: Math.round(mk.get(uid)! * 0.95), condition: 1, inStock: 1, path: `/p/${uid}` }); ctx.offers!.reads.push({ store: TEST_STORE, market: 0, ok: true, at }); };
    const phase = (matched: number, now: Date) => buildPhase(tree, { prev: ptr, prevStatus: status, cutDay: false }, {
      phase: "full", priceDay: "2026-10-07", tcgcsv: ptr.tcgcsv, scryfall: ptr.scryfall, env, now: () => now,
      deps: { importStores: async (ctx) => { stage(ctx, matched, now.toISOString()); return [result(matched)]; }, storeId: () => TEST_STORE },
    });
    // in the daily flow the newest run of the record, when phase 2 starts, is the phase 1 of the same day (it has no store results): the memory of a store comes from the newest run that READ it
    const first = await phase(10, new Date("2026-10-08T04:00:00Z")); status = { ...status, ...first.built.status, runs: [{ at: "2026-10-08T05:00:00.000Z", kind: "catalog", ok: true, seconds: 1, note: "the next day's phase 1" }, ...first.built.status.runs!] } as StatusFile; assert.equal(first.built.status.runs?.[0]?.stores?.[0]?.matched, 10); assert.deepEqual(first.built.status.guards?.storeHold, []);
    const ofRows = (): number => { let n = 0; for (const f of tree.files()) if (f.startsWith("of/")) n += (JSON.parse(tree.read(f)) as { o: unknown[] }).o.length; return n; }; assert.equal(ofRows(), 10);
    const lastRead = (): string => (JSON.parse(tree.read("ss/runs.json")) as { r: string[][] }).r[0]![2]!;
    assert.equal(lastRead(), "2026-10-08T04:00:00.000Z");
    const second = await phase(3, new Date("2026-10-08T16:00:00Z"));                                                                  // 3 of 10 matched: under 50%
    assert.deepEqual(second.built.status.guards?.storeHold, ["teststore|US"], "the read is held"); assert.equal(ofRows(), 10, "its rows stay (the 3 fresh ones are NOT merged either: a failed read changes nothing)"); assert.equal(lastRead(), "2026-10-08T04:00:00.000Z", "freshness did not advance");
    assert.ok(second.built.status.runs?.[0]?.errors?.some((e) => /store hold/.test(e)), "the run record names the hold");
    status = { ...status, ...second.built.status, runs: [{ at: "2026-10-09T03:00:00.000Z", kind: "catalog", ok: true, seconds: 1, note: "the day after's phase 1" }, ...second.built.status.runs!] } as StatusFile;
    const third = await phase(8, new Date("2026-10-09T04:00:00Z")); assert.deepEqual(third.built.status.guards?.storeHold, [], "8 of 10 against the last run's 3: a healthy read"); assert.equal(lastRead(), "2026-10-09T04:00:00.000Z"); assert.equal(ofRows(), 8);
  } finally { t.done(); }
});

test("F10 trips are counted once a day: phase 2 carries the count of phase 1 instead of adding another (else the third consecutive trip would arrive on the second day)", async () => {
  const t = tmpRoot(); const plane = path.join(t.root, "plane"); try {
    const d1 = miniMagicDay(path.join(t.root, "d1")); const env = importEnv(path.join(t.root, "e1"), d1, { IMPORT_FORCE: "1" }); const a = await bootstrap({ ...env, PLANE_DIR: plane }, NOW); assert.deepEqual(a.problems, []);
    const tree = fsTree(path.join(plane, "v1")); const ptr = JSON.parse(fs.readFileSync(path.join(plane, "latest.json"), "utf8")) as PointerFile; const status = JSON.parse(fs.readFileSync(path.join(plane, "status.json"), "utf8")) as StatusFile;
    const tripped = "LISTED would change on 60 of 1100 rows";
    const afterPhase1 = { ...status, guards: { ...status.guards, flagChange: tripped }, config: { ...status.config, guardTrips: { flagChange: 1 } } } as StatusFile;      // the record phase 1 of a tripping day leaves
    const full = await buildPhase(tree, { prev: ptr, prevStatus: afterPhase1, cutDay: false }, { phase: "full", priceDay: "2026-10-07", tcgcsv: ptr.tcgcsv, scryfall: ptr.scryfall, env, now: NOW, deps: { importStores: async () => [], storeId: () => TEST_STORE } });
    assert.equal(full.built.status.guards?.flagChange, tripped, "phase 2 carries the guard record of phase 1");
    assert.equal(full.built.status.config?.guardTrips.flagChange, 1, "one tripping day is one trip, however many phases the day has");
    const quiet = await buildPhase(tree, { prev: ptr, prevStatus: { ...status, config: { ...status.config, guardTrips: { flagChange: 2 } } } as StatusFile, cutDay: false }, { phase: "full", priceDay: "2026-10-07", tcgcsv: ptr.tcgcsv, scryfall: ptr.scryfall, env, now: NOW, deps: { importStores: async () => [], storeId: () => TEST_STORE } });
    assert.equal(quiet.built.status.config?.guardTrips.flagChange, 2, "a day that did not trip leaves the count as phase 1 wrote it");
  } finally { t.done(); }
});

// ── F7 at the pipeline level ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("F7: a day whose tracked units are mostly unpriced publishes its prices and skips the history, and the record says so", async () => {
  const t = tmpRoot(); try {
    const plane = path.join(t.root, "plane");
    const d1 = miniMagicDay(path.join(t.root, "d1")); const a = await bootstrap({ ...importEnv(path.join(t.root, "e1"), d1), PLANE_DIR: plane }, NOW); assert.deepEqual(a.problems, []);
    const hist0 = new Map(fsTree(path.join(plane, "v1")).files().filter((f) => f.startsWith("hist/p") || f.startsWith("hist/t")).map((f) => [f, fsTree(path.join(plane, "v1")).read(f)] as const));
    const keepPriced = new Set(magicFixtures().filter((f) => (f.prices.Normal?.market ?? 0) >= 5 || (f.prices.Foil?.market ?? 0) >= 5).map((f) => f.productId)); assert.ok(keepPriced.size >= 10);
    const d2 = miniMagicDay(path.join(t.root, "d2"), { stamp: D2, patch: (p) => ([...keepPriced].slice(0, Math.ceil(keepPriced.size / 2)).includes(p.productId) ? { ...p, Normal: undefined, Foil: undefined } : p) });
    const b = await bootstrap({ ...importEnv(path.join(t.root, "e2"), d2), PLANE_DIR: plane }, () => new Date("2026-10-09T01:00:00Z")); assert.deepEqual(b.problems, []);
    const s = b.summary as { history?: { skipped?: string }; guards?: { priceSanity?: string } }; assert.match(s.history?.skipped ?? "", /^F7: only \d+ of \d+ tracked units are priced today \(under 80%\)/); assert.match(s.guards?.priceSanity ?? "", /^F7/);
    const t2 = fsTree(path.join(plane, "v1")); for (const [f, text] of hist0) assert.equal(t2.read(f), text, `${f}: the history stayed as it was`);
  } finally { t.done(); }
});
