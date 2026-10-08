import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { copyValueCents, finishMarketCents, finishOfRow, infoCopyValueCents } from "../src/lib/collection-conditions";
import { finishFor } from "../src/lib/collection-csv";
import { PRICE_MASK } from "../src/lib/constants";
import { normalizeFoil } from "../src/lib/track";
import { usdCentsToCountry } from "../src/lib/fx";

// ─────────────────────────────────────────────────────────────────────────────
// Foil in the binder. A product has up to two finishes and a row holds ONE of them
// (CollectionCard.isFoil): the Foil copy is the Foil unit of the SAME product, valued
// at its own TCGplayer market price and charted on its own history; the only finish a
// product has is forced on every write (track.ts normalizeFoil); a unit with a single
// thin listing and no market is unpriced, never valued at an asking price. Prices are
// the real ones of tests/fixtures/magic-products.json (US cents).
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const q = (market: number | null, low: number | null) => ({ market, low });
const BIRDS = { n: q(2289, 1749), f: q(398075, 400000), flags: 0 };            // 7th Edition: a Normal copy is $22.89, a Foil one $3,980.75
const SHIVAN = { n: q(91, 40), f: q(null, 89700), flags: 0 };                  // 7th Edition: the Foil has a single $897 listing and no market
const EZIO = { n: null, f: q(710, 621), flags: 0 };                            // Foil Etched: its only finish is Foil
const STINGCASTER_NORMAL_ONLY = { n: q(27, 7), f: null, flags: 0 };            // a product with no Foil row
const mask = (c: { n: unknown; f: unknown }) => (c.n ? PRICE_MASK.HASN : 0) | (c.f ? PRICE_MASK.HASF : 0);

test("a Foil copy is valued at the Foil price of the same product, a Normal copy at the Normal price", () => {
  assert.equal(finishMarketCents(BIRDS, false), 2289);
  assert.equal(finishMarketCents(BIRDS, true), 398075);
  assert.equal(copyValueCents(BIRDS, false, "NM", "US"), 2289);
  assert.equal(copyValueCents(BIRDS, true, "NM", "US"), 398075);
  assert.equal(finishOfRow(true), "F");
  assert.equal(finishOfRow(false), "N");
});

test("the condition multiplier and the market's currency apply to the finish's price", () => {
  assert.equal(copyValueCents(BIRDS, true, "LP", "US"), Math.round(398075 * 0.85));
  assert.equal(copyValueCents(BIRDS, false, "NM", "AU"), Math.round(usdCentsToCountry(2289, "AU") * 1));
  assert.equal(copyValueCents(BIRDS, false, "HP", "UK"), Math.round(usdCentsToCountry(2289, "UK") * 0.55));
  assert.equal(infoCopyValueCents({ hasN: true, hasF: true, marketN: 2289, marketF: 398075 }, true, "NM", "US"), 398075, "the client reduces a card to its finish facts and gets the same number");
});

test("a unit with only a thin listing is unpriced, and a finish the product lacks is unpriced", () => {
  assert.equal(finishMarketCents(SHIVAN, true), null, "Shivan Dragon Foil: a $897 asking price is not a market price");
  assert.equal(copyValueCents(SHIVAN, true, "NM", "US"), null);
  assert.equal(copyValueCents(SHIVAN, false, "NM", "US"), 91);
  assert.equal(copyValueCents(STINGCASTER_NORMAL_ONLY, true, "NM", "US"), null);
});

test("every write forces the only finish a product has", () => {
  assert.equal(normalizeFoil({ mask: mask(BIRDS) }, false), false);
  assert.equal(normalizeFoil({ mask: mask(BIRDS) }, true), true);
  assert.equal(normalizeFoil({ mask: mask(EZIO) }, false), true, "Foil Etched exists only in Foil: a Normal ask is stored as Foil");
  assert.equal(normalizeFoil({ mask: mask(STINGCASTER_NORMAL_ONLY) }, true), false, "no Foil row: a Foil ask is stored as Normal");
  assert.deepEqual(finishFor(EZIO, { isFoil: null, etched: false }), { isFoil: true, warning: null }, "a blank finish on a Foil-only product is its Foil");
  assert.deepEqual(finishFor(STINGCASTER_NORMAL_ONLY, { isFoil: true, etched: false }), { isFoil: false, warning: "has no Foil version; added as non-foil" });
});

test("the binder writes the finish through normalizeFoil on all three paths and keys history by unit", () => {
  const lib = code("src/lib/collection-server.ts");
  assert.match(lib, /normalizeFoil\(\{ mask: maskOfCard\(card\) \}, d\.isFoil \?\? false\)/, "POST /api/collection");
  assert.match(lib, /nextFoil = normalizeFoil\(\{ mask: maskOfCard\(card\) \}, d\.isFoil\)/, "PATCH /api/collection/[id]");
  assert.match(lib, /isFoil: normalizeFoil\(\{ mask: maskOfCard\(card\) \}, w\.isFoil \?\? false\)/, "the paste and CSV import");
  assert.match(lib, /copyValueCents\(r\.card, r\.isFoil, r\.condition, country\)/, "the holding's value is its finish's price");
  assert.match(lib, /unitKey\(h\.cardId, h\.finish\)/, "the chart and the 7-day chip read the unit's own history");
  assert.doesNotMatch(lib, /card\.finish === "Foil"|prisma\.card\./, "no catalogue table: the card is published data");
});

test("the unique key already holds a Foil row and a Normal row of one card, and the share page and CSV carry the finish", () => {
  assert.match(read("prisma/schema.prisma"), /model CollectionCard[\s\S]*?@@unique\(\[userId, cardId, condition, isFoil\]\)/);
  assert.match(code("src/lib/collection-share.ts"), /isFoil: boolean/);
  assert.match(code("src/lib/collection-csv.ts"), /finish: "Foil" \| "Etched" \| ""/);
  assert.match(code("src/components/HoldingsGrid.tsx"), /h\.finishLabel/, "the holdings grid shows the Foil mark");
});
