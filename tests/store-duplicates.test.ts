// The one-row-per-(store, product, finish) rule (contract 9.7, critique budget 5), pinned with the 9 REAL duplicate keys the matcher prototype produced over page 1 of 113 stores (19,291 matched keys, 8 stores).
// A PostgreSQL batch upsert with two rows for one key dies (ON CONFLICT cannot affect a row twice), and the published offer file would carry two rows for one (unit, market, store): so the stage reduces to one row per
// key BEFORE it stages anything, by (in stock first, best condition first, lowest price, lowest path), and counts the losers in StoreResult.duplicatesCollapsed.
//
// Each case below is the store, the TCGplayer product and finish the key names, and the listings that answered it with the variants of that finish (handles, prices and stock as the stores printed them on 2026-10-07; the
// recorded answers are those of matcher/proto2-results.json). What the test pins is the rule, so the winner of every case is stated with its reason.
import { test } from "node:test";
import assert from "node:assert/strict";
import { uidOf, type Finish } from "../src/lib/constants";
import type { ImportContext } from "../src/lib/import";
import { collapseOffers, type OfferDraft } from "../src/lib/match";
import { memTree } from "../src/lib/data/plane/tree";
import { MARKET_INDEX } from "../src/lib/country";
import { buildStageIndex, newTally, offerDraftOf, stageTally, type ShopifyVariant } from "../src/lib/store-import";
import { storeByKey } from "../src/lib/stores";

interface Case { store: string; product: number; finish: Finish; listings: { handle: string; variants: [string, string, boolean][] }[] }
const CASES: Case[] = [
  { store: "mysterymtg", product: 641870, finish: "N", listings: [
      { handle: "sliver-overlord-showcase-special-guests-641871", variants: [["Near Mint / English / Normal", "32.25", false]] },
      { handle: "sliver-overlord-showcase-special-guests-641870", variants: [["Near Mint / English / Normal", "30.75", true]] },
  ] },
  { store: "manamarket", product: 509578, finish: "F", listings: [
      { handle: "sarah-jane-smith-doctor-who", variants: [["Near Mint", "1.00", false], ["Lightly Played", "0.80", false], ["Moderately Played", "0.60", false], ["Damaged", "0.25", false], ["Heavily Played", "0.40", false]] },
      { handle: "sarah-jane-smith-surge-foil-doctor-who", variants: [["Near Mint Foil", "2.00", false], ["Lightly Played Foil", "1.60", false], ["Moderately Played Foil", "1.20", false], ["Damaged Foil", "0.50", false], ["Heavily Played Foil", "0.80", false]] },
  ] },
  { store: "hairytarantula", product: 285790, finish: "F", listings: [
      { handle: "abaddon-the-despoiler-universes-beyond-warhammer-40-000", variants: [["Near Mint Foil", "2.50", false], ["Lightly Played Foil", "2.20", false], ["Moderately Played Foil", "1.90", false], ["Heavily Played Foil", "1.60", false], ["Damaged Foil", "0.80", false]] },
      { handle: "abaddon-the-despoiler-surge-foil-universes-beyond-warhammer-40-000", variants: [["Near Mint Foil", "15.20", false], ["Lightly Played Foil", "13.40", false], ["Moderately Played Foil", "11.40", false], ["Heavily Played Foil", "9.90", false], ["Damaged Foil", "5.00", false]] },
  ] },
  { store: "cryptmtg", product: 285790, finish: "F", listings: [
      { handle: "abaddon-the-despoiler-universes-beyond-warhammer-40-000", variants: [["Near Mint Foil", "3.00", false], ["Lightly Played Foil", "2.50", false], ["Moderately Played Foil", "2.25", true], ["Heavily Played Foil", "1.75", false], ["Damaged Foil", "1.50", false], ["Near Mint Foil French", "3.00", false], ["Lightly Played Foil French", "2.50", false], ["Moderately Played Foil French", "2.25", false], ["Heavily Played Foil French", "1.75", false], ["Damaged Foil French", "1.50", false]] },
      { handle: "abaddon-the-despoiler-surge-foil-universes-beyond-warhammer-40-000", variants: [["Near Mint Foil", "17.99", true], ["Lightly Played Foil", "15.49", false], ["Moderately Played Foil", "13.49", false], ["Heavily Played Foil", "10.99", false], ["Damaged Foil", "8.99", false], ["Near Mint Foil French", "17.99", false], ["Lightly Played Foil French", "15.49", false], ["Moderately Played Foil French", "13.49", false], ["Heavily Played Foil French", "10.99", false], ["Damaged Foil French", "8.99", false]] },
  ] },
  { store: "battlebearkl", product: 589326, finish: "N", listings: [
      { handle: "archmage-of-runes-fdn-30-rare-near-mint-englisch", variants: [["Default Title", "4.00", true]] },
      { handle: "archmage-of-runes-fdn-30-rare-excellent-englisch", variants: [["Default Title", "4.00", true]] },
  ] },
  { store: "ggmorley", product: 552445, finish: "F", listings: [
      { handle: "azlask-the-swelling-scourge-borderless-ripple-foil-modern-horizons-3-commander", variants: [["Near Mint Foil", "27.00", false], ["Lightly Played Foil", "21.60", false], ["Moderately Played Foil", "16.20", false], ["Heavily Played Foil", "10.80", false], ["Damaged Foil", "5.40", false]] },
      { handle: "azlask-the-swelling-scourge-borderless-modern-horizons-3-commander", variants: [["Near Mint Foil", "3.60", false], ["Lightly Played Foil", "2.90", false], ["Moderately Played Foil", "2.20", false], ["Heavily Played Foil", "1.40", false], ["Damaged Foil", "0.70", false]] },
  ] },
  { store: "ggmorley", product: 708247, finish: "F", listings: [
      { handle: "bilbos-ring-borderless-surge-foil-the-hobbit-eternal-legal", variants: [["Near Mint Foil", "42.60", false], ["Lightly Played Foil", "34.10", false], ["Moderately Played Foil", "25.60", false], ["Heavily Played Foil", "17.10", false], ["Damaged Foil", "8.60", false]] },
      { handle: "bilbos-ring-borderless-the-hobbit-eternal-legal", variants: [["Near Mint Foil", "17.20", false], ["Lightly Played Foil", "13.80", false], ["Moderately Played Foil", "10.30", false], ["Heavily Played Foil", "6.90", false], ["Damaged Foil", "3.50", false]] },
  ] },
  { store: "carddynasty", product: 10361, finish: "N", listings: [
      { handle: "biorhythm-247-ons-1", variants: [["Near Mint", "46.49", true]] },
      { handle: "biorhythm-247-ons", variants: [["Near Mint", "44.99", true]] },
  ] },
  { store: "paradoxtcg", product: 238610, finish: "F", listings: [
      { handle: "scalding-tarn-retro-foil-etched-modern-horizons-2", variants: [["Near Mint Foil", "62.70", true], ["Lightly Played Foil", "53.30", false], ["Moderately Played Foil", "43.89", false], ["Heavily Played Foil", "31.35", false], ["Damaged Foil", "18.81", false]] },
      { handle: "scalding-tarn-modern-horizons-2", variants: [["Near Mint Foil", "62.90", false], ["Lightly Played Foil", "53.46", false], ["Moderately Played Foil", "44.03", false], ["Heavily Played Foil", "31.45", false], ["Damaged Foil", "18.87", false]] },
  ] },
];
/** The winner of each key, and why. */
const WINNER: Record<string, [handle: string, why: string]> = {
  "mysterymtg.641870.N": ["sliver-overlord-showcase-special-guests-641870", "in stock beats out of stock, though it is the dearer-looking twin: the other one's only Normal variant is sold out"],
  "manamarket.509578.F": ["sarah-jane-smith-doctor-who", "both sold out: the lower price"],
  "hairytarantula.285790.F": ["abaddon-the-despoiler-universes-beyond-warhammer-40-000", "both sold out: the lower price (the Surge Foil twin asks 6x)"],
  "cryptmtg.285790.F": ["abaddon-the-despoiler-surge-foil-universes-beyond-warhammer-40-000", "both in stock: the better condition (Near Mint) wins over the cheaper Moderately Played copy"],
  "battlebearkl.589326.N": ["archmage-of-runes-fdn-30-rare-excellent-englisch", "equal in stock, condition (none stated) and price: the lowest path"],
  "ggmorley.552445.F": ["azlask-the-swelling-scourge-borderless-modern-horizons-3-commander", "both sold out: the lower price"],
  "ggmorley.708247.F": ["bilbos-ring-borderless-the-hobbit-eternal-legal", "both sold out: the lower price"],
  "carddynasty.10361.N": ["biorhythm-247-ons", "both Near Mint in stock: the lower price"],
  "paradoxtcg.238610.F": ["scalding-tarn-retro-foil-etched-modern-horizons-2", "in stock beats out of stock"],
};
const keyOf = (c: Case): string => `${c.store}.${c.product}.${c.finish}`;
const variants = (l: Case["listings"][number]): ShopifyVariant[] => l.variants.map(([title, price, available]) => ({ title, price, available }));
const draftsOf = (c: Case): OfferDraft[] => c.listings.flatMap((l) => { const d = offerDraftOf(c.product, c.finish, variants(l), `/products/${l.handle}`); return d ? [d] : []; });

test("there are exactly the 9 real duplicate keys, one per case, in 8 stores", () => {
  assert.equal(CASES.length, 9);
  assert.equal(new Set(CASES.map(keyOf)).size, 9);
  assert.equal(new Set(CASES.map((c) => c.store)).size, 8);
  assert.deepEqual(Object.keys(WINNER).sort(), CASES.map(keyOf).sort());
  for (const c of CASES) assert.equal(c.listings.length, 2, keyOf(c));
});

for (const c of CASES) {
  test(`${keyOf(c)}: two listings, one row; ${WINNER[keyOf(c)]![1]}`, () => {
    const drafts = draftsOf(c);
    assert.equal(drafts.length, 2);
    const { rows, collapsed } = collapseOffers(drafts);
    assert.equal(collapsed, 1);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.path, `/products/${WINNER[keyOf(c)]![0]}`);
    assert.equal(rows[0]!.productId, c.product);
    assert.equal(rows[0]!.finish, c.finish);
    // Order does not matter: the same listings the other way round give the same row.
    assert.deepEqual(collapseOffers([...drafts].reverse()).rows, rows);
  });
}

test("the stage stages one row per key and counts the losers: duplicatesCollapsed, then the registry id, the market and the condition index", () => {
  for (const c of CASES) {
    const store = storeByKey(c.store)!;
    const ctx = { offers: { cards: [], sealed: [], reads: [] } } as unknown as Pick<ImportContext, "offers">;
    const si = buildStageIndex({ match: [], work: memTree(), tracked: new Set([uidOf(c.product, c.finish)]) });
    const t = newTally();
    t.drafts.push(...draftsOf(c));
    const staged = stageTally(ctx, store, t, si);
    assert.equal(staged.collapsed, 1, keyOf(c));
    assert.equal(staged.cards, 1);
    assert.equal(ctx.offers!.cards.length, 1);
    const row = ctx.offers!.cards[0]!;
    assert.equal(row.uid, uidOf(c.product, c.finish));
    assert.equal(row.store, store.id);
    assert.equal(row.market, MARKET_INDEX[store.country]);
    assert.equal(row.path, `/products/${WINNER[keyOf(c)]![0]}`);
    assert.ok(row.condition === null || (row.condition >= 0 && row.condition <= 4));
    assert.equal(row.inStock, staged.inStock);
  }
});
