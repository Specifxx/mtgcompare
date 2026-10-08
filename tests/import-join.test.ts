// The join and the derived Card fields, end to end through importCatalog on REAL Magic products (owner WP01b). The 57 products of tests/fixtures/magic-products.json carry their expected slug, set token, class, rarity, finishes, etched flag, star twin, origin set, reskin name and link
// level; the importer must reproduce every one. The scenarios the fixtures cannot hold (a variant whose base product is not in the list, a fallback join, an oracle-name link) are built on a real record: the same name, group, number and prices, with the Scryfall row that makes the case.
import test from "node:test";
import assert from "node:assert/strict";
import { importCatalog, type ImportContext } from "../src/lib/import";
import { loadPrevState } from "../src/lib/data/plane/prevstate";
import { memTree } from "../src/lib/data/plane/tree";
import { CARD_FLAGS, LINK, PRICE_MASK, nkey, nsort } from "../src/lib/constants";
import { TRACK_DEFAULTS } from "../src/lib/track";
import { magicFixtures, miniMagicDay, tmpRoot, type MiniDayOpts } from "./helpers/publish-harness";

const quiet = (): void => undefined;
async function run(o: MiniDayOpts = {}, prev = loadPrevState(memTree())): Promise<{ ctx: ImportContext; summary: NonNullable<Awaited<ReturnType<typeof importCatalog>>["result"]["summary"]["magic"]>; all: Awaited<ReturnType<typeof importCatalog>> }> {
  const t = tmpRoot(); try {
    const day = miniMagicDay(t.root, o);
    const all = await importCatalog({ log: quiet, cfg: TRACK_DEFAULTS, prev }, { cacheDir: day.tcgDir, scryfallCacheDir: day.scryDir, lastUpdated: day.stamp });
    return { ctx: all.ctx, summary: all.result.summary.magic!, all };
  } finally { t.done(); }
}
const LEVEL = ["none", "id", "etched", "fallback", "variant", "oracle-name"];
const cardOf = (ctx: ImportContext, id: number) => { const i = ctx.snapshot.cards.findIndex((c) => c.id === id); return i < 0 ? null : { c: ctx.snapshot.cards[i]!, p: ctx.snapshot.prices[i]! }; };

test("each of the 57 real products becomes the Card row its fixture expects (slug, set token, class, rarity, finishes, etched, star twin, origin set, reskin name, link)", async () => {
  const { ctx } = await run();
  const tok = new Map(ctx.snapshot.sets.map((s) => [s.id, s.tok])); let rows = 0, notRows = 0;
  for (const f of magicFixtures()) {
    if (!f.tcgRarity) continue;                                                           // sealed products have their own test below
    const e = f.expect as Record<string, unknown>; const got = cardOf(ctx, f.productId);
    if (!got) { assert.notEqual(e.cls, 0, `${f.productId} ${f.name}: a class-0 product must be a catalogue row`); notRows++; continue; }
    rows++; const { c, p } = got;
    assert.equal(c.slug, e.slug, `${f.productId} slug`); assert.equal(tok.get(c.setId), e.setTok, `${f.productId} set token`); assert.equal(c.cls, e.cls, `${f.productId} class`);
    if (e.cls === 0 && e.link !== "variant" && e.link !== "fallback") assert.equal(c.rarity, e.rarity, `${f.productId} rarity`);
    assert.equal(!!(p.mask & PRICE_MASK.HASN), e.hasN, `${f.productId} has Normal`); assert.equal(!!(p.mask & PRICE_MASK.HASF), e.hasF, `${f.productId} has Foil`);
    assert.equal(!!(c.flags & CARD_FLAGS.ETCHED), e.etched, `${f.productId} etched (rule E)`); assert.equal(!!(c.flags & CARD_FLAGS.STAR), e.star, `${f.productId} star twin`);
    if (e.displayName) assert.equal(c.name, e.displayName, `${f.productId} display name`);
    if (e.cls === 0 && e.alt !== undefined) assert.equal(c.alt, e.alt, `${f.productId} reskin name`);
    if (e.fnum) assert.equal(c.fnum, e.fnum, `${f.productId} star number`);
    if (e.sc && e.link !== "variant" && e.link !== "fallback") assert.equal(c.sc, e.sc, `${f.productId} origin set`);
    if (e.link === "id" || e.link === "etched" || e.link === "none") assert.equal(LEVEL[c.link], e.cls === 0 ? e.link : "none", `${f.productId} link level`);
    // the row takes the number SCRYFALL prints (a suffixed collector number such as 155s keeps its letter); the nkey/nsort in the fixture describe the number as the importer's reference reads it, so the row is held to its own number, not to the TCGplayer one
    assert.equal(c.nkey, nkey(c.number), `${f.productId} the row's nkey is the nkey of the number it shows`); assert.equal(c.nsort, nsort(c.number), `${f.productId} the row's nsort is the nsort of the number it shows`);
  }
  assert.ok(rows >= 35 && notRows >= 5, `${rows} rows, ${notRows} products that are not rows`);
});

test("the Magic counters of the run: 2 shared pairs, an etched anomaly, the three name-etched products, reskins and the classes", async () => {
  const { ctx, summary } = await run();
  assert.equal(summary.sharedPairs, 2, "two 7th Edition cards (Birds of Paradise 231 and 3077): the nonfoil printing and its foil star twin share one TCGplayer id");
  assert.equal(summary.etchedAnomalies, 1, "594545 Sol Ring has both a tcgplayer_id and an etched id (the full 2026-10-07 data has two: the fixture keeps no etched id for 286677 Inquisitor Greyfax)");
  for (const id of [251776]) assert.ok(cardOf(ctx, id)!.c.flags & CARD_FLAGS.ETCHED, `${id} is Foil Etched by rule E although its Scryfall row lacks the etched finish`);
  for (const id of [594545, 286677]) assert.ok(!(cardOf(ctx, id)!.c.flags & CARD_FLAGS.ETCHED), `${id} is not etched`);
  assert.ok(summary.reskins >= 5, `reskins ${summary.reskins}`); assert.ok((summary.classCounts.token ?? 0) >= 5 && (summary.classCounts.art ?? 0) >= 1 && (summary.classCounts.oversized ?? 0) >= 1 && (summary.classCounts.helper ?? 0) >= 1, JSON.stringify(summary.classCounts));
  assert.ok(summary.join.id >= 40 && summary.join.etched === 3, `join.id counts every product joined by a Scryfall id, etched included: ${JSON.stringify(summary.join)}`);
});

test("the shared tcgplayer_id of a 7th Edition card is ONE Card: the Normal unit is the plain printing, the Foil unit the star printing", async () => {
  const { ctx } = await run(); const c = cardOf(ctx, 2831)!.c;
  assert.equal(c.slug, "birds-of-paradise-7ed-231"); assert.equal(c.number, "231"); assert.equal(c.fnum, "231★"); assert.ok(c.flags & CARD_FLAGS.STAR); assert.equal(c.sc, "7ed");
});

test("a variant product (a Rainbow Foil twin) joins the printing its BASE product holds by id and carries the family root; its own treatment comes from its own name", async () => {
  const fx = magicFixtures().find((f) => f.productId === 557904)!;                       // Encore Electromancer - Snapcaster Mage (Rainbow Foil), Secret Lair Drop Series
  const base = { productId: 900_001, name: "Encore Electromancer - Snapcaster Mage", groupId: fx.groupId, number: fx.tcgNumber, rarity: fx.tcgRarity, Normal: fx.prices.Normal, Foil: fx.prices.Foil };
  const row = { id: "00000000-0000-4000-8000-000000000801", oracle_id: "00000000-0000-4000-8000-0000000000aa", name: "Snapcaster Mage", set: "sld", collector_number: "808", finishes: ["nonfoil", "foil"], rarity: "rare", tcgplayer_id: 900_001, flavor_name: "Encore Electromancer" };
  const { ctx } = await run({ products: [base], scryfall: [row] });
  const v = cardOf(ctx, 557904)!.c, b = cardOf(ctx, 900_001)!.c;
  assert.equal(v.link, LINK.VARIANT); assert.equal(b.link, LINK.ID); assert.equal(v.rootId, 900_001); assert.equal(b.rootId, 900_001, "the root is a member of its own family"); assert.equal(v.sc, "sld"); assert.equal(v.oracleNo, b.oracleNo); assert.ok(v.oracleNo);
  assert.ok(v.treat.split(" ").includes("rainbow"), "the Rainbow Foil pattern comes from the product's own name"); assert.ok(!b.treat.split(" ").includes("rainbow"));
});

test("the fallback join: no tcgplayer_id on Scryfall, the group's set, the collector number (promo suffix stripped) and the name pick exactly one free printing", async () => {
  const fx = magicFixtures().find((f) => f.productId === 719572)!;                       // The Theorist, Jace Beleren, Promo Pack: Reality Fracture, TCGplayer number 43
  const row = { id: "00000000-0000-4000-8000-0000000043aa", oracle_id: "00000000-0000-4000-8000-0000000043bb", name: "The Theorist, Jace Beleren", set: "pfra", collector_number: "43p", finishes: ["nonfoil", "foil"], rarity: "rare", tcgplayer_id: null as number | null };
  const { ctx, summary } = await run({ scryfall: [row] });
  const c = cardOf(ctx, fx.productId)!.c;
  assert.equal(c.link, LINK.FALLBACK); assert.equal(c.sc, "pfra"); assert.equal(c.number, "43p", "Card.number is Scryfall's collector number"); assert.ok(c.oracleNo); assert.ok(summary.join.fallback >= 1);
});

test("two free printings that answer the same number and name are AMBIGUOUS: skipped, never guessed", async () => {
  const mk = (id: string, cn: string) => ({ id: `00000000-0000-4000-8000-00000000${id}`, oracle_id: "00000000-0000-4000-8000-0000000043bb", name: "The Theorist, Jace Beleren", set: "pfra", collector_number: cn, finishes: ["nonfoil"], rarity: "rare", tcgplayer_id: null as number | null });
  const { ctx } = await run({ scryfall: [mk("00000043c1", "43p"), mk("00000043c2", "43s")] });
  const c = cardOf(ctx, 719572)!.c; assert.notEqual(c.link, LINK.FALLBACK); assert.equal(c.sc, null);
});

test("an oracle-name link (no printing found) gives the oracle and nothing else: the origin set, the Scryfall number and the scan stay TCGplayer's", async () => {
  const fx = magicFixtures().find((f) => f.productId === 485192)!;                       // Sword of _ and _ is a Playtest card nobody has: use a product whose name is a real oracle name
  const base = magicFixtures().find((f) => f.productId === 457193)!;                    // Fire // Ice (Double Masters 2022)
  const oracle = base.scryfall[0]!;
  const ghost = { productId: 900_002, name: "Fire // Ice (Display Commander)", groupId: base.groupId, number: "999", rarity: "R", Normal: base.prices.Normal, Foil: base.prices.Foil };
  const { ctx } = await run({ products: [ghost] });
  const c = cardOf(ctx, 900_002)!.c; const o = cardOf(ctx, base.productId)!.c;
  assert.equal(c.link, LINK.ORACLE_NAME); assert.equal(c.oracleNo, o.oracleNo); assert.equal(c.sc, null); assert.equal(c.scryId, null); assert.equal(c.number, "999");
  void fx; void oracle;
});

test("a token or art card never gets an oracle, whatever Scryfall says: class != 0 means link NONE (C11)", async () => {
  const { ctx } = await run();
  const t = cardOf(ctx, 165632)!;                                                       // the $215 Lunar New Year Treasure token, joined by id to a Scryfall token row
  assert.equal(t.c.cls, 1); assert.equal(t.c.link, LINK.NONE); assert.equal(t.c.oracleNo, null); assert.ok(t.p.mask & PRICE_MASK.THIN, "a special is always THIN");
  assert.equal(cardOf(ctx, 478655), null, "a 59-cent double-sided token is not a catalogue row (specials enter at $20)");
});

test("a Scryfall layout that turns a class-0 product into a token demotes it (and is counted)", async () => {
  const p = { productId: 900_003, name: "Zombie", groupId: 2092, number: "9", rarity: "C", Normal: { market: 25.5, low: 20 } };
  const row = { id: "00000000-0000-4000-8000-0000000009aa", oracle_id: "00000000-0000-4000-8000-0000000009bb", name: "Zombie", set: "ust", collector_number: "9", layout: "token", finishes: ["nonfoil"], rarity: "common", tcgplayer_id: 900_003 };
  const { ctx, summary } = await run({ products: [p], scryfall: [row] });
  const c = cardOf(ctx, 900_003)!.c; assert.equal(c.cls, 1); assert.equal(c.oracleNo, null); assert.ok(summary.classDemoted >= 1);
});

test("sealed products: always in the sealed catalogue, with their TCGplayer price, their kind and write-once slugs", async () => {
  const { ctx } = await run(); const s = ctx.snapshot.sealed.find((x) => x.id === 686671)!;
  assert.ok(s, "the Deadpool Secret Lair Drop bundle"); assert.equal(s.kind, "Secret Lair Drop"); assert.ok(s.marketUsd && s.marketUsd > 0); assert.ok(s.slug.length > 0 && s.slug.length <= 90);
});

test("the oracle ordinals are dense, unique and carry the Scryfall oracle id; an unjoined product has no oracle", async () => {
  const { ctx } = await run(); const nos = ctx.snapshot.oracles.map((o) => o.no);
  assert.equal(new Set(nos).size, nos.length); assert.deepEqual([...nos].sort((a, b) => a - b), nos.map((_, i) => i + 1));
  assert.equal(cardOf(ctx, 485192)!.c.oracleNo, null); assert.equal(cardOf(ctx, 485192)!.c.link, LINK.NONE);
});
