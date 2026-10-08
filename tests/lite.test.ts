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
