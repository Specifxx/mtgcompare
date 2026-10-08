// Slugs, set tokens and oracle ordinals are WRITE-ONCE (contract C3), owner WP01b. A published URL never changes: a rename, a new number, a changed abbreviation, a product that vanishes and returns, or a collision with a newcomer moves nothing that exists; a newcomer
// that collides takes the `-p<productId>` form; the slug seed rebuilds the same URLs after a lost branch. Every scenario runs the real importer on the 57 real products of tests/fixtures/magic-products.json (no network); the synthetic additions are clones of a real
// record (same name, group, number, prices) with a new productId, which is exactly what a collision is.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { bootstrap } from "../scripts/bootstrap";
import fs from "node:fs";
import { importCatalog, type SlugSeed } from "../src/lib/import";
import { readSlugSeed } from "../scripts/import";
import { seedOf, writeSeed } from "../scripts/slug-seed";
import { loadPrevState, writeOnceProblems } from "../src/lib/data/plane/prevstate";
import { fsTree, memTree, type TreeView } from "../src/lib/data/plane/tree";
import { withProductSuffix, oracleSlugOf } from "../src/lib/catalog";
import { TRACK_DEFAULTS } from "../src/lib/track";
import { importEnv, magicFixtures, miniMagicDay, tmpRoot, type MiniProduct, type MiniRaw } from "./helpers/publish-harness";

const quiet = (): void => undefined;
const NOW = (): Date => new Date("2026-10-08T01:00:00Z");
const D2 = "2026-10-08T20:06:09Z", D3 = "2026-10-09T20:06:09Z";
interface Ids { slugs: Map<number, string>; oracleSlugs: Map<string, number>; toks: Map<number, string>; setSlugs: Map<number, string> }
const idsOf = (t: TreeView): Ids => {
  const p = loadPrevState(t); return { slugs: p.slugById, oracleSlugs: p.oracleNoBySlug, toks: p.tokBySetId, setSlugs: p.setSlugById };
};
const planeTree = (dir: string): TreeView => fsTree(path.join(dir, "v1"));
const fx = (id: number) => magicFixtures().find((f) => f.productId === id)!;
/** A new product that is a copy of a real one under another productId (TCGplayer listing the same card twice, or a re-listing): same name, group, number, prices. */
const cloneOf = (id: number, newId: number): MiniProduct => { const f = fx(id); return { productId: newId, name: f.name, groupId: f.groupId, number: f.tcgNumber, rarity: f.tcgRarity, Normal: f.prices.Normal, Foil: f.prices.Foil }; };

test("a rename, a new collector number and a new group abbreviation on day 2 move no slug, no set token and no oracle ordinal", async () => {
  const t = tmpRoot(); try {
    const plane = path.join(t.root, "plane");
    const d1 = miniMagicDay(path.join(t.root, "d1")); const a = await bootstrap({ ...importEnv(path.join(t.root, "e1"), d1), PLANE_DIR: plane }, NOW); assert.deepEqual(a.problems, []);
    const one = idsOf(planeTree(plane)); const prev = loadPrevState(planeTree(plane));
    const d2 = miniMagicDay(path.join(t.root, "d2"), { stamp: D2, abbreviation: { 23165: "DRWHO", 2: "7E" }, patch: (p) => (p.productId === 2831 ? { ...p, name: "Birds of Paradise (Retro Frame)", number: "231a" } : p.productId === 496078 ? { ...p, name: "Forest (0206)" } : p) });
    const b = await bootstrap({ ...importEnv(path.join(t.root, "e2"), d2), PLANE_DIR: plane }, () => new Date("2026-10-09T01:00:00Z")); assert.deepEqual(b.problems, [], "the write-once rules hold against day 1");
    const two = idsOf(planeTree(plane));
    for (const [id, slug] of one.slugs) assert.equal(two.slugs.get(id), slug, `product ${id} keeps ${slug}`);
    for (const [slug, no] of one.oracleSlugs) assert.equal(two.oracleSlugs.get(slug), no, `oracle ${slug} keeps ordinal ${no}`);
    for (const [gid, tok] of one.toks) assert.equal(two.toks.get(gid), tok, `set ${gid} keeps token ${tok}`); for (const [gid, s] of one.setSlugs) assert.equal(two.setSlugs.get(gid), s);
    assert.equal(two.slugs.get(2831), "birds-of-paradise-7ed-231", "the renamed product keeps the URL it was published under"); assert.equal(two.toks.get(23165), "who"); assert.equal(two.toks.get(2), "7ed");
    assert.deepEqual(writeOnceProblems(prev, planeTree(plane)), []);
  } finally { t.done(); }
});

test("a newcomer whose slug is taken becomes <slug>-p<productId>, whichever productId is lower: the published row is the first writer and keeps the bare slug", async () => {
  const t = tmpRoot(); try {
    const plane = path.join(t.root, "plane"); const base = "forest-who-205";
    // day 1: three listings of Forest (0205): the lowest productId (496078) takes the bare slug, the others are suffixed in productId order
    const d1 = miniMagicDay(path.join(t.root, "d1"), { products: [cloneOf(496078, 9_000_002), cloneOf(496078, 9_000_001)] });
    const a = await bootstrap({ ...importEnv(path.join(t.root, "e1"), d1), PLANE_DIR: plane }, NOW); assert.deepEqual(a.problems, []);
    const s1 = idsOf(planeTree(plane)).slugs; assert.equal(s1.get(496078), base); assert.equal(s1.get(9_000_001), withProductSuffix(base, 9_000_001)); assert.equal(s1.get(9_000_002), withProductSuffix(base, 9_000_002));
    assert.equal(withProductSuffix(base, 9_000_001), "forest-who-205-p9000001"); assert.equal(new Set(s1.values()).size, s1.size, "every slug is unique");
    const summary1 = a.summary as { magic: { slugSuffixed: number } }; assert.ok(summary1.magic.slugSuffixed >= 2, `${summary1.magic.slugSuffixed} suffixed on day 1`);
    // day 2: a LOWER productId (100) lists the same card: it does not take the bare slug from the published row
    const d2 = miniMagicDay(path.join(t.root, "d2"), { stamp: D2, products: [cloneOf(496078, 9_000_002), cloneOf(496078, 9_000_001), cloneOf(496078, 100)] });
    const b = await bootstrap({ ...importEnv(path.join(t.root, "e2"), d2), PLANE_DIR: plane }, () => new Date("2026-10-09T01:00:00Z")); assert.deepEqual(b.problems, []);
    const s2 = idsOf(planeTree(plane)).slugs; assert.equal(s2.get(496078), base, "first writer keeps the bare slug"); assert.equal(s2.get(100), "forest-who-205-p100"); assert.equal(s2.get(9_000_001), s1.get(9_000_001));
  } finally { t.done(); }
});

test("a product that vanishes for a day and returns keeps its row, its slug and its ordinal (rows are flagged, never deleted, never re-slugged)", async () => {
  const t = tmpRoot(); try {
    const plane = path.join(t.root, "plane"); const id = 8687;                                                                            // Beta Black Lotus
    const run = async (n: number, stamp: string, drop: ReadonlySet<number>): Promise<ReturnType<typeof bootstrap>> => { const d = miniMagicDay(path.join(t.root, `d${n}`), { stamp, drop }); return bootstrap({ ...importEnv(path.join(t.root, `e${n}`), d), PLANE_DIR: plane }, () => new Date(`2026-10-${String(8 + n).padStart(2, "0")}T01:00:00Z`)); };
    const a = await run(1, "2026-10-07T20:06:09Z", new Set()); assert.deepEqual(a.problems, []); const slug = idsOf(planeTree(plane)).slugs.get(id); assert.equal(slug, fx(id).expect.slug);
    const b = await run(2, D2, new Set([id])); assert.deepEqual(b.problems, [], "no ROW_DELETED: the absent product is still a row"); assert.equal(idsOf(planeTree(plane)).slugs.get(id), slug);
    const c = await run(3, D3, new Set()); assert.deepEqual(c.problems, []); assert.equal(idsOf(planeTree(plane)).slugs.get(id), slug);
    assert.equal((c.summary as { magic: { slugSuffixed: number } }).magic.slugSuffixed, 0, "the returning product was not treated as a newcomer that collides with itself");
  } finally { t.done(); }
});

const ctxOf = async (o: Parameters<typeof importCatalog>[1], prev = loadPrevState(memTree())) => (await importCatalog({ log: quiet, cfg: TRACK_DEFAULTS, prev }, o)).ctx;
test("the slug seed rebuilds a lost branch's URLs: a first run takes the seeded slugs, tokens and oracle slugs; a run with a memory ignores the seed", async () => {
  const t = tmpRoot(); try {
    const day = miniMagicDay(t.root); const f = fx(496078); const oracleId = f.scryfall[0]!.oracle_id;
    const seed: SlugSeed = { v: 1, toks: { "23165": "drwho" }, cards: { "496078": "forest-doctor-who-205-legacy" }, oracles: { [oracleId]: "forest-legacy" } };
    const opts = { cacheDir: day.tcgDir, scryfallCacheDir: day.scryDir, lastUpdated: day.stamp };
    const seeded = await ctxOf({ ...opts, slugSeed: seed }); const row = seeded.snapshot.cards.find((c) => c.id === 496078)!;
    assert.equal(row.slug, "forest-doctor-who-205-legacy"); assert.equal(seeded.snapshot.sets.find((s) => s.id === 23165)!.tok, "drwho"); assert.equal(seeded.snapshot.oracles.find((o) => o.scryfallId === oracleId)!.slug, "forest-legacy");
    assert.equal(seeded.snapshot.cards.find((c) => c.id === 2831)!.slug, "birds-of-paradise-7ed-231", "a product the seed does not know is slugged normally");
    // the same files, a memory present: the seed has no say
    const plain = await ctxOf({ ...opts }); const tree = memTree(); for (const f2 of plain.work.files()) tree.write(f2, plain.work.read(f2));
    const natural = plain.snapshot.cards.find((c) => c.id === 496078)!.slug; assert.equal(natural, "forest-who-205");
    const prev = { ...loadPrevState(memTree()), empty: false, slugById: new Map([[496078, natural]]), tokBySetId: new Map([[23165, "who"]]) };
    const again = await ctxOf({ ...opts, slugSeed: seed }, prev); assert.equal(again.snapshot.cards.find((c) => c.id === 496078)!.slug, natural); assert.equal(again.snapshot.sets.find((s) => s.id === 23165)!.tok, "who");
  } finally { t.done(); }
});

// ── oracle slugs ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Two different cards with one name (a real reprint-by-name is rare; the shape is a Sol Ring whose oracle is not the commander staple's). The earliest-released oracle owns the bare slug; the other is <bare>-<first 8 of its Scryfall id>; and once published the
// bare slug is never taken away by a later-appearing older card.
const sol = fx(594545).scryfall[0]!;                                                                                                       // the real Sol Ring record
const otherSol = (releasedAt: string, productId: number, uuid: string): { product: MiniProduct; raw: MiniRaw } => ({
  product: { productId, name: "Sol Ring", groupId: 2156, number: "7", rarity: "P", Normal: { market: 3.1, low: 2.5 } },
  raw: { id: `${uuid.slice(0, 8)}-0000-4000-8000-000000000001`, oracle_id: uuid, name: "Sol Ring", set: "pfdn", collector_number: "7", finishes: ["nonfoil"], rarity: "rare", tcgplayer_id: productId, released_at: releasedAt },
});
test("oracle slugs: the earliest release owns the bare slug on a first run; the namesake is <bare>-<uuid8>; a later-appearing older card does not take a published slug", async () => {
  const t = tmpRoot(); try {
    const plane = path.join(t.root, "plane"); const U = "0badc0de-0000-4000-8000-0000000000aa";
    // day 1: the real Sol Ring (released with its set, 2020-01-01 in the mini day) alone owns "sol-ring"
    const d1 = miniMagicDay(path.join(t.root, "d1")); const a = await bootstrap({ ...importEnv(path.join(t.root, "e1"), d1), PLANE_DIR: plane }, NOW); assert.deepEqual(a.problems, []);
    const one = idsOf(planeTree(plane)); const realNo = one.oracleSlugs.get("sol-ring"); assert.ok(realNo, "sol-ring exists and belongs to the real oracle"); assert.ok(![...one.oracleSlugs.keys()].some((s) => s.startsWith("sol-ring-")));
    // day 2: a namesake with an OLDER release appears: the published slug stays with the real card
    const x = otherSol("1999-01-01", 9_100_001, U);
    const d2 = miniMagicDay(path.join(t.root, "d2"), { stamp: D2, products: [x.product], scryfall: [x.raw] }); const b = await bootstrap({ ...importEnv(path.join(t.root, "e2"), d2), PLANE_DIR: plane }, () => new Date("2026-10-09T01:00:00Z")); assert.deepEqual(b.problems, []);
    const two = idsOf(planeTree(plane)); assert.equal(two.oracleSlugs.get("sol-ring"), realNo, "the bare slug is write-once"); assert.equal(two.oracleSlugs.get(`sol-ring-${U.slice(0, 8)}`) !== undefined, true, "the namesake takes the suffixed form");
    assert.equal(oracleSlugOf({ id: U, name: "Sol Ring" }, true), `sol-ring-${U.slice(0, 8)}`); assert.equal(oracleSlugOf({ id: U, name: "Sol Ring" }, false), "sol-ring");
    const nos = [...two.oracleSlugs.values()]; assert.equal(new Set(nos).size, nos.length, "ordinals are unique"); assert.equal(two.oracleSlugs.get(`sol-ring-${U.slice(0, 8)}`), Math.max(...[...one.oracleSlugs.values()]) + 1, "a new oracle takes the next ordinal after the highest ever published");
    // the same two cards on a FIRST run: the older release owns the bare slug
    const d3 = miniMagicDay(path.join(t.root, "d3"), { products: [x.product], scryfall: [x.raw] }); const c = await bootstrap({ ...importEnv(path.join(t.root, "e3"), d3), PLANE_DIR: path.join(t.root, "plane-3") }, NOW); assert.deepEqual(c.problems, []);
    const three = idsOf(planeTree(path.join(t.root, "plane-3"))); const bare = three.oracleSlugs.get("sol-ring"); assert.ok(bare !== undefined && three.oracleSlugs.has(`sol-ring-${sol.oracle_id.slice(0, 8)}`), "the real card (released later) is the suffixed one when both are new");
  } finally { t.done(); }
});

test("a state restored from the branch `state` (slugs and ordinals, no tree to remember Scryfall ids) still gives every published oracle its slug and ordinal back", async () => {
  const t = tmpRoot(); try {
    const plane = path.join(t.root, "plane"); const d1 = miniMagicDay(path.join(t.root, "d1")); await bootstrap({ ...importEnv(path.join(t.root, "e1"), d1), PLANE_DIR: plane }, NOW);
    const published = loadPrevState(planeTree(plane)); assert.ok(published.oracleNoBySlug.size > 20 && !published.empty);
    const ctx = await ctxOf({ cacheDir: d1.tcgDir, scryfallCacheDir: d1.scryDir, lastUpdated: d1.stamp }, published);                           // NO tree: only PrevState
    const got = new Map(ctx.snapshot.oracles.map((o) => [o.slug, o.no] as const));
    for (const [slug, no] of published.oracleNoBySlug) assert.equal(got.get(slug), no, `oracle ${slug} keeps ordinal ${no}`);
    for (const c of ctx.snapshot.cards) assert.equal(c.slug, published.slugById.get(c.id), `product ${c.id}`);
  } finally { t.done(); }
});

test("data/slug-seed.json: seedOf a published tree and a rebuild from NOTHING reproduces every card slug, set token and oracle slug (a lost branch loses no URL); without the seed the namesake swaps", async () => {
  const t = tmpRoot(); try {
    const plane = path.join(t.root, "plane"); const U = "0badc0de-0000-4000-8000-0000000000bb"; const x = otherSol("1999-01-01", 9_100_002, U);
    const all: Parameters<typeof miniMagicDay>[1] = { products: [cloneOf(496078, 9_000_001), x.product], scryfall: [x.raw] };
    // the history that made the URLs: day 1 had the real Sol Ring and a doubled Forest; the older namesake arrived on day 2 and took the suffixed slug
    const d1 = miniMagicDay(path.join(t.root, "d1"), { products: [cloneOf(496078, 9_000_001)] }); await bootstrap({ ...importEnv(path.join(t.root, "e1"), d1), PLANE_DIR: plane }, NOW);
    const d2 = miniMagicDay(path.join(t.root, "d2"), { ...all, stamp: D2 }); const b = await bootstrap({ ...importEnv(path.join(t.root, "e2"), d2), PLANE_DIR: plane }, () => new Date("2026-10-09T01:00:00Z")); assert.deepEqual(b.problems, []);
    const published = planeTree(plane); const ids = idsOf(published); assert.ok(ids.oracleSlugs.has(`sol-ring-${U.slice(0, 8)}`) && ids.oracleSlugs.has("sol-ring"));
    // the seed holds only what the sources cannot reproduce
    const seed = seedOf(published); assert.equal(seed.v, 1); assert.equal(seed.toks["23165"], "who"); assert.equal(seed.cards["9000001"], "forest-who-205-p9000001"); assert.equal(seed.cards["496078"], "forest-who-205"); assert.equal(seed.oracles[U], `sol-ring-${U.slice(0, 8)}`); assert.equal(seed.oracles[sol.oracle_id], "sol-ring");
    assert.ok(Object.keys(seed.cards).length < 10, "a handful of collision slugs, not the catalogue");
    const file = path.join(t.root, "slug-seed.json"); writeSeed(seed, file); assert.deepEqual(readSlugSeed(file), seed, "the file round-trips"); assert.equal(readSlugSeed(path.join(t.root, "missing.json")), null); fs.writeFileSync(file, '{"v":2}'); assert.equal(readSlugSeed(file), null, "an unknown version is ignored");
    const opts = { cacheDir: d2.tcgDir, scryfallCacheDir: d2.scryDir, lastUpdated: d2.stamp };
    const withSeed = await ctxOf({ ...opts, slugSeed: seed }); const without = await ctxOf({ ...opts });
    for (const c of withSeed.snapshot.cards) assert.equal(c.slug, ids.slugs.get(c.id), `product ${c.id}: the seeded rebuild keeps its URL`);
    for (const s2 of withSeed.snapshot.sets) assert.equal(s2.tok, ids.toks.get(s2.id), `set ${s2.id}`);
    assert.deepEqual(withSeed.snapshot.oracles.map((o) => o.slug).filter((slug) => !ids.oracleSlugs.has(slug)), [], "every oracle slug of the rebuild is one that was published (the ordinals are the rebuild's own: only the state branch remembers them)");
    const bare = (c: typeof withSeed): string | undefined => c.snapshot.oracles.find((o) => o.scryfallId === U)?.slug; assert.equal(bare(withSeed), `sol-ring-${U.slice(0, 8)}`); assert.equal(bare(without), "sol-ring", "no seed: the older card is first on a rebuild and would take the bare slug the real Sol Ring was published under");
  } finally { t.done(); }
});
