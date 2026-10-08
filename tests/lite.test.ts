// The pure hydrator from published rows to a CardLite (contract 7.2) and the transition shim (7.9). Owner WP02.
// Critique 5 (VERIFIED on the 2026-10-07 snapshot): 1,171 of 98,796 priced class-0 rows are low-only; 9 of the top 10 and 59 of the top 100 by "market else low" were single listings (449401: $203,067.70). MARKET ONLY ranks; the low is only displayed.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PRICE_MASK } from "../src/lib/constants";
import { headlineFinish, liteFromRow, pageOf, rowFromPlane, type CardLiteRow } from "../src/lib/data/lite";
import { BrowseIndex } from "../src/lib/data/plane/browse-index";
import { fsSource } from "../src/lib/data/plane/source";
import { fsTree } from "../src/lib/data/plane/tree";
import type { CatRow, PxRow, UnRow } from "../src/lib/data/plane/formats";
import { CatalogShimError, buildCatalog, shimAllowed } from "../src/lib/data/catalog-shim";
import { miniCards, miniFull } from "./helpers/plane-tree";

const fixtures = JSON.parse(fs.readFileSync(path.resolve(__dirname, "fixtures/magic-products.json"), "utf8")) as { productId: number; prices: Record<string, { market: number | null; low: number | null }> }[];
const row = (o: Partial<CardLiteRow> = {}): CardLiteRow => ({ id: 1, slug: "a-s-1", name: "A", alt: null, setId: 1, sc: "tst", number: "1", rarity: "R", cls: 0, treat: "", label: null, flags: 0, oracleNo: 5, scryId: null, colors: 1, mv: 2.4, ptype: 1, setTok: "tst", marketN: 1000, marketF: 2500, lowN: 900, lowF: 2300, mask: PRICE_MASK.LISTED | PRICE_MASK.HASN | PRICE_MASK.HASF, shown: "N", low: null, stores: null, change7d: null, change30d: null, high90: null, ...o });

test("MARKET ONLY: marketUsd is the market of the shown finish and null for a low-only unit; valueUsd is what is displayed, lowOnly says it is a thin low", () => {
  const market = liteFromRow(row()); assert.equal(market.marketUsd, 1000); assert.equal(market.valueUsd, 1000); assert.equal(market.lowOnly, false);
  const fx = fixtures.find((f) => f.productId === 449401)!; const p = fx.prices.Normal!; assert.equal(p.market, null);
  const thin = liteFromRow(row({ marketN: null, lowN: Math.round(p.low! * 100), mask: PRICE_MASK.LISTED | PRICE_MASK.HASN | PRICE_MASK.LOWN }));
  assert.equal(thin.marketUsd, null, "a $203k single listing is not a market"); assert.equal(thin.valueUsd, 20_306_770); assert.equal(thin.lowOnly, true);
  const foil = liteFromRow(row({ shown: "F" })); assert.equal(foil.marketUsd, 2500); assert.equal(foil.headFinish, "F"); assert.deepEqual(foil.n, { market: 1000, low: 900 }); assert.deepEqual(foil.f, { market: 2500, low: 2300 });
  assert.equal(liteFromRow(row({ marketN: null, lowN: null, mask: PRICE_MASK.LISTED })).valueUsd, null);
});
test("flags, aliases and per-market aggregates: listed / top / thin bits, tracked bits, colours, cost clamp, image flag, null aggregates for an untracked unit", () => {
  const l = liteFromRow(row({ mask: PRICE_MASK.LISTED | PRICE_MASK.TOP | PRICE_MASK.THIN | PRICE_MASK.TRACKN, mv: 120, treat: "borderless showcase", label: "Borderless", low: [800, null, 750, null, null, null], stores: [3, 0, 1, 0, 0, 0] }));
  assert.equal(l.listed, true); assert.equal(l.top, true); assert.equal(l.thin, true); assert.equal(l.tracked, 1); assert.deepEqual(l.treat, ["borderless", "showcase"]); assert.equal(l.variant, "Borderless"); assert.equal(l.cost, 99, "mana value clamps to 0..99");
  assert.deepEqual(l.low, { US: 800, AU: null, UK: 750, SG: null, CA: null, EU: null }); assert.deepEqual(l.stores, { US: 3, AU: 0, UK: 1, SG: 0, CA: 0, EU: 0 });
  const none = liteFromRow(row({ oracleNo: null })); assert.equal(none.cost, null, "an unjoined product has no mana value to show"); assert.equal(none.low.US, null); assert.equal(none.stores.US, 0); assert.equal(none.hasImage, false);
  assert.equal(liteFromRow(row({ sc: null, setTok: "dd2" })).setCode, "DD2", "setCode = (sc ?? tok) upper-case");
});
test("headlineFinish: HEADF means Foil; rowFromPlane picks the finish a query named and the unit's own aggregates and changes", () => {
  assert.equal(headlineFinish(PRICE_MASK.HASN), "N"); assert.equal(headlineFinish(PRICE_MASK.HASF | PRICE_MASK.HEADF), "F");
  const cat: CatRow = [7, "x-7", "X", 0, 3, "tst", "7", 0, "R", 0, "", 0, 1, 1, 5, 0, 0, 0, 2, 3, 1];
  const px: PxRow = [7, 1000, 2500, 900, 2300, PRICE_MASK.LISTED | PRICE_MASK.HASN | PRICE_MASK.HASF | PRICE_MASK.TRACKN | PRICE_MASK.TRACKF, 1.5, -2, 1100, 4.5, 8, 2600];
  const un: UnRow[] = [[14, [800, null, null, null, null, null], [2, 0, 0, 0, 0, 0], [810, null, null, null, null, null]], [15, [2200, null, null, null, null, null], [1, 0, 0, 0, 0, 0], [2210, null, null, null, null, null]]];
  const n = liteFromRow(rowFromPlane(cat, px, "tst", un)); assert.equal(n.headFinish, "N"); assert.equal(n.marketUsd, 1000); assert.equal(n.change7d, 1.5); assert.equal(n.change30d, -2); assert.equal(n.high90Usd, 1100); assert.equal(n.low.US, 800); assert.equal(n.stores.US, 2);
  const f = liteFromRow(rowFromPlane(cat, px, "tst", un, "F")); assert.equal(f.headFinish, "F"); assert.equal(f.marketUsd, 2500); assert.equal(f.change7d, 4.5); assert.equal(f.change30d, 8); assert.equal(f.high90Usd, 2600); assert.equal(f.low.US, 2200); assert.equal(f.stores.US, 1);
  const bare = liteFromRow(rowFromPlane(cat, undefined, "tst")); assert.equal(bare.marketUsd, null); assert.equal(bare.listed, false);
});
test("pageOf: a page past the last returns the last page with capped true; pages never drop below 1", () => {
  assert.deepEqual(pageOf([], 0, 1, 24), { total: 0, pages: 1, page: 1, items: [], capped: false }); const p = pageOf([], 50, 9, 24); assert.equal(p.pages, 3); assert.equal(p.page, 3); assert.equal(p.capped, true);
});
test("the shim refuses in a production deployment, runs in dev, test and preview, and builds the old Catalog from the browse index (listed class 0 only)", async () => {
  assert.equal(shimAllowed({ VERCEL_ENV: "production" }), false); assert.equal(shimAllowed({ VERCEL_ENV: "preview" }), true); assert.equal(shimAllowed({}), true);
  assert.match(new CatalogShimError().message, /transition shim/); assert.equal(new CatalogShimError().name, "CatalogShimError");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shim-")); const t = fsTree(path.join(dir, "v1")); const src = miniFull({ day: 2 }); for (const f of src.files()) t.write(f, src.read(f));
  try {
    const sets = (JSON.parse(src.read("meta/sets.json")).sets as unknown[][]).map((r) => ({ id: r[0] as number, slug: r[1] as string, tok: r[2] as string, code: r[3] as string, name: r[4] as string, tcgName: "", kind: "expansion" as const, releasedOn: r[7] as string, bucket: false, cardCount: 0, trackedCount: 0, sealedCount: 0 }));
    const ix = await BrowseIndex.load(fsSource(dir), sets, { withStores: false }); const cat = buildCatalog(ix, sets, "2026-01-03T00:00:00Z");
    const listed0 = miniCards({ day: 2 }).filter((c) => c.mask & PRICE_MASK.LISTED); assert.equal(cat.cards.length, listed0.length); assert.equal(cat.complete, true); assert.equal(cat.byId.size, cat.cards.length);
    assert.equal(cat.bySlug.get(listed0[0]!.slug)!.id, listed0[0]!.id); assert.equal(cat.setById.get(100)!.slug, "set-100"); assert.equal(cat.setBySlug.get("set-101")!.id, 101); assert.equal(cat.pricesAt, "2026-01-03T00:00:00Z");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ══ the other shapes the loaders assemble from published rows (detail page, tile of a set board, oracle, family), over real products ═══════════════════════════════════════════════════════════════════════════════════
import { detailFromPlane, DETAIL_OFFER_CAP, familyKey, familyMembers, miniFromBoard, miniOf, oracleFromRow, oracleMiniOf } from "../src/lib/data/lite";
import type { BoardRow, OfferTuple, OracleRow, SetRow, StoreRunsFile } from "../src/lib/data/plane/formats";
import type { StoreRegistry } from "../src/lib/offer-read";
import { realMiniTree } from "./helpers/data-source";

const storeFx = JSON.parse(fs.readFileSync(path.resolve(__dirname, "fixtures/store-ids.json"), "utf8")) as { stores: { id: number; key: string; kind: string }[] };
const registry: StoreRegistry = {
  sourceOfStoreId: (id) => { const s = storeFx.stores.find((x) => x.id === id); return s ? (s.kind === "feed" ? `feed:${s.key}` : `store:${s.key}`) : null; },
  offerUrl: (id, market, p) => { const s = storeFx.stores.find((x) => x.id === id); return s ? `https://${s.key}.example${p}${market === "US" ? "" : `?country=${market}`}` : null; },
};
const tree = realMiniTree(), AT = "2026-10-07T21:41:07Z", NOW = Date.parse("2026-10-08T09:00:00Z");
const rowsOf = (id: number): { cat: CatRow; px: PxRow; un: UnRow[] } => {
  const b = Math.floor(id / 256), d = `${Math.floor(b / 64)}/${b}.json`, uns = tree.has(`un/${d}`) ? (JSON.parse(tree.read(`un/${d}`)) as { u: UnRow[] }).u.filter((u) => Math.floor(u[0] / 2) === id) : [];
  return { cat: (JSON.parse(tree.read(`cat/${d}`)) as { c: CatRow[] }).c.find((r) => r[0] === id)!, px: (JSON.parse(tree.read(`px/${d}`)) as { p: PxRow[] }).p.find((r) => r[0] === id)!, un: uns };
};
const setRows = (JSON.parse(tree.read("meta/sets.json")) as { sets: SetRow[] }).sets;
const setOf = (id: number) => { const r = setRows.find((s) => s[0] === id)!; return { id: r[0], slug: r[1], tok: r[2], code: r[3], name: r[4], tcgName: r[4], kind: r[6] as never, releasedOn: null, bucket: false, cardCount: r[10], trackedCount: r[11], sealedCount: r[12] }; };

test("detailFromPlane: Birds of Paradise (7th Edition, $22.89 Normal and $3,980.75 Foil) has a unit per tracked finish, its store rows judged by the run of their store, and the TCGplayer rows dated by the publish", () => {
  const { cat, px, un } = rowsOf(2831), of: OfferTuple[] = [[2831 * 2, 0, 10, 1749, 0, 1, "/p/2831"], [2831 * 2, 0, 11, 2289, 1, 1, "/q/2831"], [2831 * 2 + 1, 0, 10, 400_000, 0, 1, "/f/2831"], [2831 * 2, 0, 999, 100, 0, 1, "/gone"]];
  const runs: StoreRunsFile = { v: 1, at: AT, r: [[10, 0, "2026-10-07T21:41:07Z", 1, 1, 1, 1, 0, 0], [11, 0, "2026-10-07T21:41:07Z", 0, 1, 1, 1, 0, 0]] };
  const d = detailFromPlane({ cat, px, un, of, set: setOf(cat[4]), origin: null, oracle: null, family: [], runs, pricesAt: AT }, { registry, now: NOW });
  assert.equal(d.slug, "birds-of-paradise-7ed-231"); assert.equal(d.marketUsd, 2289); assert.equal(d.tracked, 3); assert.deepEqual(d.units.map((u) => u.finish), ["N", "F"]);
  const k10 = storeFx.stores.find((s) => s.id === 10)!.key, k11 = storeFx.stores.find((s) => s.id === 11)!.key;
  assert.deepEqual(d.offers.map((o) => `${o.source}/${o.finish}/${o.priceCents}/${o.inStock ? "in" : "out"}`), ["tcgplayer/N/1749/in", `store:${k10}/N/1749/in`, `store:${k11}/N/2289/out`, "tcgplayer/F/400000/in", `store:${k10}/F/400000/in`], "cheapest first (ties by store id: TCGplayer is store 0); a failed run's rows are out of stock, never dropped; a retired store id is dropped; eBay is never a row");
  assert.ok(d.offers.every((o) => o.shippingCents === null && (o.storeId === 0 ? o.updatedAt === AT : true))); assert.equal(d.pricesAt, AT);
  const stale = detailFromPlane({ cat, px, un, of, set: setOf(cat[4]), origin: null, oracle: null, family: [], runs: { ...runs, r: [[10, 0, "2026-10-04T00:00:00Z", 1, 1, 1, 1, 0, 0]] }, pricesAt: AT }, { registry, now: NOW });
  assert.ok(stale.offers.filter((o) => o.storeId === 10).every((o) => !o.inStock), "72 hours without a run: out of stock"); assert.ok(stale.offers.filter((o) => o.storeId === 0).every((o) => o.inStock));
  const many = detailFromPlane({ cat, px, un, of: Array.from({ length: 260 }, (_, i) => [2831 * 2, 1, 10, 3000 + i, 0, 1, `/au/${i}`] as OfferTuple), set: setOf(cat[4]), origin: null, oracle: null, family: [], runs, pricesAt: AT }, { registry, now: NOW });
  assert.equal(many.offers.length, DETAIL_OFFER_CAP); assert.equal(many.offers[0]!.priceCents, 1749);
});
test("detailFromPlane: an untracked card has no units and one TCGplayer row per finish; a low-only card is shown with its low", () => {
  const c = rowsOf(238617); const d = detailFromPlane({ ...c, of: [], set: setOf(c.cat[4]), origin: null, oracle: null, family: [], runs: null, pricesAt: AT }, { registry, now: NOW });
  assert.deepEqual(d.units, []); assert.deepEqual(d.offers.map((o) => [o.finish, o.priceCents]), [["F", 187], ["N", 199]]); assert.equal(d.tcgName, "Counterspell"); assert.equal(d.fnum, null); assert.equal(d.rootId, null);
  const l = rowsOf(449401); const low = detailFromPlane({ ...l, of: [], set: setOf(l.cat[4]), origin: null, oracle: null, family: [], runs: null, pricesAt: AT }, { registry, now: NOW });
  assert.equal(low.marketUsd, null); assert.equal(low.valueUsd, 20_306_770); assert.equal(low.lowOnly, true); assert.equal(low.offers[0]!.priceCents, 20_306_770);
});
test("miniFromBoard: a row of st/<setId> becomes the tile of its headline unit (Normal first; a foil-only row heads with Foil; a low-only row is flagged)", () => {
  const set = { id: 23019, tok: "ltr" }, mask = 256 | 1 | 2 | 8, row: BoardRow = [487805, "the-one-ring-ltr-246", "The One Ring", "246", "M", 0, "", 0, 64, "ltr", 11619, 14000, 10001, 13000, mask, 0, 0, null];
  const m = miniFromBoard(row, set); assert.deepEqual([m.id, m.setId, m.setCode, m.headFinish, m.marketUsd, m.valueUsd, m.lowOnly, m.tracked, m.thin, m.scryId, m.alt], [487805, 23019, "LTR", "N", 11619, 11619, false, 1, false, null, null]);
  const f = miniFromBoard([1, "a", "A", 0, "R", 0, "etched", "x", 1, 0, null, 500, null, 450, 256 | 2 | 4 | 2048, 0, 0, null], set); assert.deepEqual([f.headFinish, f.marketUsd, f.valueUsd, f.setCode, f.number, f.thin, f.treat, f.label], ["F", 500, 500, "LTR", null, true, ["etched"], "x"]);
  const lo = miniFromBoard([2, "b", "B", "1", "R", 0, "", 0, 0, 0, null, null, 20_306_770, null, 256 | 1 | 32, 0, 0, null], set); assert.deepEqual([lo.marketUsd, lo.valueUsd, lo.lowOnly], [null, 20_306_770, true]);
  assert.deepEqual(Object.keys(miniOf(liteFromRow(row2lite()))).sort(), Object.keys(m).sort());
});
const row2lite = (): CardLiteRow => ({ id: 1, slug: "a", name: "A", alt: null, setId: 1, sc: "ltr", number: "1", rarity: "R", cls: 0, treat: "", label: null, flags: 0, oracleNo: 1, scryId: null, colors: 0, mv: 0, ptype: 9, setTok: "ltr", marketN: 100, marketF: null, lowN: 90, lowF: null, mask: 256 | 1, shown: "N", low: null, stores: null, change7d: null, change30d: null, high90: null });
test("oracleFromRow and oracleMiniOf: keywords are the space-separated tokens, an absent layout is normal, the name key is folded; familyMembers groups the products of one Scryfall printing (the base and its etched twin)", () => {
  const r: OracleRow = [16326, "00000000-0000-0000-0000-000000000000", "lightning-bolt", "Lightning Bolt", "{R}", 1, "Instant", 8, 8, "NNLLLLLLLLNLLNLLNLLLLL", 157, 0, 0, 0, 0, "Lightning Bolt deals 3 damage to any target.", "", 0, 61];
  const o = oracleFromRow(r); assert.deepEqual([o.layout, o.keywords, o.faces, o.pt, o.edhrecRank, o.nPrint], ["normal", [], 1, null, 157, 61]); assert.deepEqual(oracleFromRow([...r.slice(0, 12), "split", 0, 0, 0, "flash double-strike", 2, 1] as unknown as OracleRow).keywords, ["flash", "double-strike"]);
  assert.equal(oracleMiniOf(oracleFromRow([...r.slice(0, 3), "Fire // Ice", ...r.slice(4)] as unknown as OracleRow)).nameKey, "fire ice");
  const base = rowsOf(238617).cat, twin: CatRow = [...base] as CatRow; twin[0] = 240803; twin[1] = "counterspell-mh2-267-foil-etched"; twin[16] = 238617; twin[12] = 1; twin[10] = "etched";
  assert.equal(familyKey(base), 238617); assert.equal(familyKey(twin), 238617); const px = (id: number): PxRow | undefined => (id === 240803 ? [240803, null, 700, null, 650, 256 | 2 | 4] : rowsOf(238617).px);
  assert.deepEqual(familyMembers(base, [base, twin], px).map((m) => [m.id, m.hasN, m.hasF, m.treat]), [[240803, false, true, ["etched"]]]); assert.deepEqual(familyMembers(twin, [base, twin], px).map((m) => m.id), [238617]); assert.deepEqual(familyMembers(base, [base], px), []);
});
