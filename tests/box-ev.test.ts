import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BOOSTER_SET_KINDS,
  CHASE_POOLS,
  boxSetLabel,
  cheapestBoxOffer,
  computeEv,
  defaultBoxSet,
  derivedRates,
  hasComputedEv,
  isReleased,
  oneInPacks,
  openingEv,
  poolOf,
  poolStats,
  unvaluedSlots,
  verdictFor,
  type PoolKey,
  type PoolRow,
} from "../src/lib/box-ev";
import { BOOSTER_TYPES, DRAFT_BOOSTER, PLAY_BOOSTER, boosterTypeOf, cardsInPack } from "../src/lib/pack-composition";

// ─────────────────────────────────────────────────────────────────────────────
// Box EV for Magic. The slot structure is the one Wizards of the Coast
// publishes (Play Booster); nothing is a community estimate. The cards below
// are real Modern Horizons 3 products and their TCGplayer market prices in
// cents (TCGCSV group 23444, 2026-10-07).
// ─────────────────────────────────────────────────────────────────────────────

const MH3 = {
  mountain: { rarity: "L", treat: [], cents: 24 },                                // Mountain (0307)
  ripple: { rarity: "L", treat: ["ripple"], cents: 22 },                          // Mountain (0503) (Ripple Foil), foil only
  spawnToken: { rarity: "T", treat: [], cents: 35 },
  flare: { rarity: "R", treat: [], cents: 362 },                                  // Flare of Denial
  flareRetro: { rarity: "R", treat: ["retro"], cents: 658 },
  flareBorderless: { rarity: "R", treat: ["borderless"], cents: 1024 },
  nadu: { rarity: "R", treat: [], cents: 33 },                                    // Nadu, Winged Wisdom
  naduBorderless: { rarity: "R", treat: ["borderless"], cents: 50 },
  naduEtched: { rarity: "R", treat: ["etched"], cents: 229 },                     // foil-only product
  labyrinth: { rarity: "M", treat: [], cents: 1319 },                             // Ugin's Labyrinth
  labyrinthBorderless: { rarity: "M", treat: ["borderless"], cents: 2036 },
  tower: { rarity: "M", treat: [], cents: 3049 },                                 // Phyrexian Tower
  towerBorderless: { rarity: "M", treat: ["borderless"], cents: 4413 },
  binding: { rarity: "M", treat: [], cents: 76 },                                 // Ugin's Binding
} as const;
const card = (k: keyof typeof MH3) => ({ rarity: MH3[k].rarity, treat: [...MH3[k].treat], valueCents: MH3[k].cents });
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("a standard card lands in its printed rarity; chase treatments get their own pools", () => {
  assert.equal(poolOf(card("flare")), "Rare");
  assert.equal(poolOf(card("labyrinth")), "Mythic");
  assert.equal(poolOf(card("mountain")), "Land");
  assert.equal(poolOf({ rarity: "C", treat: [] }), "Common");
  assert.equal(poolOf({ rarity: "U", treat: [] }), "Uncommon");
  assert.equal(poolOf(card("flareRetro")), "AltRare", "a retro frame rare is a Booster Fun rare");
  assert.equal(poolOf(card("flareBorderless")), "AltRare");
  assert.equal(poolOf(card("labyrinthBorderless")), "AltMythic");
  assert.equal(poolOf({ rarity: "U", treat: ["showcase"] }), "AltCommon");
  assert.equal(poolOf(card("naduEtched")), "SpecialFoil", "etched is a foil-only product whatever its rarity");
  assert.equal(poolOf(card("ripple")), "SpecialFoil");
  assert.equal(poolOf({ rarity: "M", treat: ["serial"] }), "SpecialFoil");
});

test("tokens, promos, stamped cards, editions and specials are not pulls from a set's boosters", () => {
  assert.equal(poolOf(card("spawnToken")), null);
  assert.equal(poolOf({ rarity: "S", treat: [] }), null);
  assert.equal(poolOf({ rarity: "P", treat: [] }), null);
  for (const t of ["prerelease", "promopack", "thelist", "secretlair", "buyabox", "bundle"]) assert.equal(poolOf({ rarity: "R", treat: [t] }), null, t);
  assert.equal(poolOf({ rarity: "R", treat: ["ce"] }), null, "a Collector's Edition card");
  assert.equal(poolOf({ rarity: "R", treat: ["lang-ja"] }), null);
  assert.equal(poolOf({ rarity: null, treat: [] }), null);
});

test("the average divides by EVERY card in the pool, not just the priced ones; no outlier cap", () => {
  const s = poolStats([card("labyrinthBorderless"), card("towerBorderless"), { rarity: "M", treat: ["borderless"], valueCents: null }, { rarity: "M", treat: ["borderless"], valueCents: 0 }]);
  const p = s.get("AltMythic")!;
  assert.equal(p.total, 4);
  assert.equal(p.priced, 2);
  assert.equal(p.avgCents, Math.round((2036 + 4413) / 4), "unpriced cards count as zero");
  assert.equal(p.topCents, 4413);
});

test("the Play Booster table is the published structure: 14 cards, rare 6 in 7 and mythic 1 in 7", () => {
  assert.equal(PLAY_BOOSTER.cardsPerPack, 14);
  assert.equal(cardsInPack(PLAY_BOOSTER), 14);
  assert.equal(PLAY_BOOSTER.source?.url, "https://magic.wizards.com/en/news/making-magic/nuts-and-bolts-16-play-boosters");
  const rare = PLAY_BOOSTER.slots.find((s) => s.key === "rare")!;
  assert.deepEqual(rare.pools, [{ pool: "Rare", weight: 6 / 7 }, { pool: "Mythic", weight: 1 / 7 }]);
  for (const s of PLAY_BOOSTER.slots) {
    assert.equal(s.sourced, true, s.key);
    if (s.pools.length) assert.ok(Math.abs(s.pools.reduce((a, m) => a + m.weight, 0) - 1) < 1e-12, `${s.key} weights sum to 1`);
  }
  // The wildcard slots have no published split: listed, valued at nothing.
  assert.deepEqual(unvaluedSlots(PLAY_BOOSTER).map((s) => s.key), ["wild", "foil"]);
  // An unconfirmed structure says so.
  assert.ok(DRAFT_BOOSTER.slots.every((s) => s.sourced === false));
  assert.equal(DRAFT_BOOSTER.source, null);
  assert.equal(cardsInPack(DRAFT_BOOSTER), 14, "ten commons, three uncommons, one rare slot as listed (the 15th card is the basic land slot of older sets)");
});

test("which sealed products have a modelled booster", () => {
  assert.equal(boosterTypeOf("Modern Horizons 3 - Play Booster Display")?.key, "play");
  assert.equal(boosterTypeOf("Modern Horizons 3 - Play Booster Pack")?.key, "play");
  assert.equal(boosterTypeOf("Core Set 2021 - Draft Booster Display")?.key, "draft");
  for (const n of ["Modern Horizons 3 - Collector Booster Display", "Modern Horizons 3 - Bundle", "Modern Horizons 3 - Prerelease Pack", "Foundations Jumpstart - Booster Display", "Modern Horizons 3 - Commander Deck - Eldrazi Incursion"]) assert.equal(boosterTypeOf(n), null, n);
  assert.equal(BOOSTER_TYPES.length, 2);
});

const ALL = new Map<PoolKey, number>([["Common", 80], ["Uncommon", 100], ["Rare", 60], ["Mythic", 20], ["Land", 6], ["AltRare", 30], ["AltMythic", 10], ["SpecialFoil", 8]]);

test("Play Booster rates per pack: slot count times weight; a pool with no cards in the set gets 0", () => {
  const r = derivedRates({ counts: ALL, booster: PLAY_BOOSTER });
  assert.equal(r.Common, 7);
  assert.equal(r.Uncommon, 3);
  assert.equal(r.Rare, 6 / 7);
  assert.equal(r.Mythic, 1 / 7);
  assert.equal(r.Land, 1);
  for (const p of CHASE_POOLS) assert.equal(r[p], 0, `${p}: Wizards publishes no split, so no value is assumed`);
  const noMythic = derivedRates({ counts: new Map<PoolKey, number>([["Common", 5], ["Rare", 5]]), booster: PLAY_BOOSTER });
  assert.equal(noMythic.Mythic, 0);
  assert.equal(noMythic.Uncommon, 0);
  assert.ok(Object.values(derivedRates({ counts: ALL, booster: null })).every((v) => v === 0));
});

test("EV is rate x average, summed, then x packs; shares sum to 1; the ratio is EV over price", () => {
  const stats = poolStats([card("flare"), card("nadu"), card("labyrinth"), card("tower"), card("binding"), card("mountain")]);
  const rates = { Rare: 6 / 7, Mythic: 1 / 7, Land: 1 };
  const ev = computeEv({ stats, rates, packs: 30, boxPriceCents: 20_000 });
  const rareAvg = Math.round((362 + 33) / 2), mythAvg = Math.round((1319 + 3049 + 76) / 3);   // pool averages are whole cents
  const pack = (6 / 7) * rareAvg + (1 / 7) * mythAvg + 24;
  assert.equal(ev.evPackCents, Math.round(pack));
  assert.equal(ev.evBoxCents, Math.round(pack * 30));
  assert.ok(Math.abs(ev.lines.reduce((a, l) => a + l.share, 0) - 1) < 1e-9);
  assert.equal(ev.ratio, ev.evBoxCents / 20_000);
  assert.equal(computeEv({ stats, rates: {}, packs: 30, boxPriceCents: 0 }).lines.every((l) => l.share === 0), true, "zero EV: shares of 0, not NaN");
  assert.equal(computeEv({ stats, rates, packs: 30, boxPriceCents: 0 }).ratio, null);
});

test("a $44 borderless mythic cannot dominate at a rate no slot gives it", () => {
  const stats = poolStats([card("towerBorderless"), card("labyrinthBorderless"), card("tower"), card("labyrinth"), card("flare"), card("mountain"), { rarity: "C", treat: [], valueCents: 10 }, { rarity: "U", treat: [], valueCents: 15 }]);
  const counts = new Map([...stats].map(([k, v]) => [k, v.total]));
  const ev = computeEv({ stats, rates: derivedRates({ counts, booster: PLAY_BOOSTER }), packs: 30, boxPriceCents: 15_000 });
  assert.equal(ev.chaseShare, 0, "no published slot yields a Booster Fun pool");
  // The visitor can give the wildcard a rate; the chase pool then shows up on its own line.
  const withWild = computeEv({ stats, rates: { ...derivedRates({ counts, booster: PLAY_BOOSTER }), AltMythic: 0.02 }, packs: 30, boxPriceCents: 15_000 });
  const alt = withWild.lines.find((l) => l.pool === "AltMythic")!;
  assert.equal(alt.avgCents, Math.round((4413 + 2036) / 2));
  assert.ok(alt.share > 0 && alt.chase);
});

test("no verdict when the paying pools are mostly unpriced; chase-heavy EV is not called positive", () => {
  const unpriced = poolStats([{ rarity: "C", treat: [], valueCents: null }, { rarity: "C", treat: [], valueCents: null }, { rarity: "C", treat: [], valueCents: null }, card("flare")]);
  const ev = computeEv({ stats: unpriced, rates: { Common: 7, Rare: 1 }, packs: 30, boxPriceCents: 10_000 });
  assert.equal(ev.pricedShare, 0.25);
  assert.match(verdictFor(ev.ratio, { pricedShare: ev.pricedShare, chaseShare: ev.chaseShare })!.text, /Too few cards/);
  assert.equal(verdictFor(0.2, { pricedShare: 0.25 })!.tone, "flat");
  assert.equal(verdictFor(0.5, { pricedShare: 1, chaseShare: 0.1 })!.tone, "down");
  const skew = poolStats([{ rarity: "C", treat: [], valueCents: 10 }, { rarity: "M", treat: ["borderless"], valueCents: 400_000 }]);
  const sk = computeEv({ stats: skew, rates: { Common: 7, AltMythic: 1 / 40 }, packs: 30, boxPriceCents: 10_000 });
  assert.ok(sk.chaseShare >= 0.9 && sk.ratio! > 1.1);
  const sv = verdictFor(sk.ratio, { pricedShare: sk.pricedShare, chaseShare: sk.chaseShare })!;
  assert.equal(sv.tone, "flat");
  assert.match(sv.text, /handful of chase cards/);
});

test("verdict thresholds; '1 in N packs' for fractional rates", () => {
  assert.equal(verdictFor(null), null);
  assert.equal(verdictFor(1.2)!.tone, "up");
  assert.equal(verdictFor(1.0)!.tone, "up");
  assert.equal(verdictFor(0.9)!.tone, "flat");
  assert.equal(verdictFor(0.5)!.tone, "down");
  assert.equal(oneInPacks(1 / 288), "≈ 1 in 288 packs");
  assert.equal(oneInPacks(2), null);
  assert.ok(BOOSTER_SET_KINDS.has("expansion") && BOOSTER_SET_KINDS.has("core") && !BOOSTER_SET_KINDS.has("commander"));
});

test("the box price starts at the cheapest in-stock tracked STORE offer: never a TCGplayer reference or eBay", () => {
  const offers = [
    { source: "tcgplayer", market: "US", priceCents: 9000, inStock: true, url: "t" },
    { source: "ebay", market: "US", priceCents: 8000, inStock: true, url: "e" },
    { source: "store:capefear", market: "US", priceCents: 11000, inStock: true, url: "c" },
    { source: "store:danireon", market: "US", priceCents: 10500, inStock: false, url: "d" },
    { source: "store:cherry", market: "AU", priceCents: 100, inStock: true, url: "a" },
  ];
  assert.equal(cheapestBoxOffer(offers, "US")?.source, "store:capefear");
  assert.equal(cheapestBoxOffer(offers, "UK"), null);
});

test("the page and calculator say what is published and what is left at zero, and the old set-sum page redirects", () => {
  assert.match(read("src/app/tools/box-ev/page.tsx"), /export const dynamic = "force-dynamic"/);
  const calc = read("src/components/BoxEvCalculator.tsx");
  assert.match(calc, /Wizards of the Coast publishes the slot structure/);
  assert.match(calc, /valued at zero/);
  assert.doesNotMatch(calc, /Bandai|One Piece|community estimate/);
  // The /tools hub's FAQ answers "Is a Magic booster box worth opening?" (visible and as FAQPage JSON-LD): it said Bandai and "community estimates" until 2026-10-09.
  const hub = read("src/app/tools/page.tsx");
  assert.match(hub, /Wizards of the Coast publishes the slot structure of its boosters/);
  assert.match(hub, /valued at zero until you give it a rate/);
  assert.doesNotMatch(hub, /Bandai|One Piece|community estimate/);
  assert.match(read("next.config.js"), /source: "\/tools\/box-value", destination: "\/tools\/box-ev", permanent: true/);
});

// ─────────────────────────────────────────────────────────────────────────────
// Which set the calculator opens on. Real pool rows of the published plane
// (price day 2026-10-08), aggregated exactly as /tools/box-ev aggregates them:
// Star Trek (TRK, out 2026-11-13) is the newest set with a Play Booster box and
// was the set the page opened on, with 24 previewed cards at pre-order prices;
// Reality Fracture (FRA, out 2026-10-02) and The Hobbit (HOB, 2026-08-14) are out.
// ─────────────────────────────────────────────────────────────────────────────
const TODAY = "2026-10-09";
const row = (pool: PoolKey, avgUsdCents: number, topUsdCents: number, priced: number, total: number): PoolRow => ({ pool, avgUsdCents, topUsdCents, priced, total });
const TRK_POOLS: PoolRow[] = [row("Common", 299, 299, 2, 2), row("Uncommon", 256, 299, 6, 7), row("Rare", 1932, 3132, 3, 4), row("Mythic", 1324, 5297, 1, 4), row("AltRare", 0, 0, 0, 2), row("AltMythic", 0, 0, 0, 5)];
const FRA_POOLS: PoolRow[] = [row("Common", 22, 115, 71, 71), row("Uncommon", 26, 111, 109, 109), row("Rare", 111, 848, 64, 64), row("Mythic", 877, 4023, 26, 26), row("Land", 22, 34, 20, 20), row("AltCommon", 107, 926, 15, 15), row("AltRare", 192, 1252, 64, 64), row("AltMythic", 1944, 7714, 36, 36), row("SpecialFoil", 28748, 65665, 23, 24)];
const HOB_POOLS: PoolRow[] = [row("Common", 14, 27, 60, 60), row("Uncommon", 19, 31, 55, 55), row("Rare", 65, 385, 53, 53), row("Mythic", 798, 3168, 15, 15), row("Land", 17, 21, 10, 10), row("AltCommon", 26, 36, 12, 12), row("AltRare", 191, 1300, 50, 50), row("AltMythic", 145818, 2450000, 17, 17), row("SpecialFoil", 5782, 45477, 39, 39)];
const PLAY_BOX = [{ key: "play", packs: 30 }];
const boxSet = (setCode: string, setName: string, releasedOn: string | null, pools: PoolRow[]) => ({ setCode, setName, releasedOn, released: isReleased(releasedOn, TODAY), pools, boosters: PLAY_BOX });
const TRK = boxSet("TRK", "Star Trek", "2026-11-13", TRK_POOLS);
const FRA = boxSet("FRA", "Reality Fracture", "2026-10-02", FRA_POOLS);
const HOB = boxSet("HOB", "The Hobbit", "2026-08-14", HOB_POOLS);

test("a set is out from its release day (UTC); a set with no date counts as out", () => {
  assert.equal(isReleased("2026-11-13", TODAY), false, "Star Trek");
  assert.equal(isReleased("2026-10-02", TODAY), true, "Reality Fracture");
  assert.equal(isReleased("2026-11-13", "2026-11-13"), true, "release day itself");
  assert.equal(isReleased(null, TODAY), true);
});

test("why the release date decides: an unreleased set's preview cards make a large, 'computed' and meaningless EV", () => {
  const trk = openingEv(TRK);
  // 7 x 299 + 3 x 256 + 6/7 x 1932 + 1/7 x 1324 a pack (no Land pool; the Booster Fun pools have no published rate), x 30 packs.
  const pack = 7 * 299 + 3 * 256 + (6 / 7) * 1932 + (1 / 7) * 1324;
  assert.equal(trk.evBoxCents, Math.round(pack * 30));
  assert.ok(trk.evBoxCents > 100_000, "over US$1,000 a box from 24 previewed cards");
  assert.equal(trk.pricedShare, 12 / 17);
  assert.equal(hasComputedEv(trk), true, "its numbers alone pass: only the release date tells it apart");
  const fra = openingEv(FRA);
  assert.equal(fra.evBoxCents, Math.round((7 * 22 + 3 * 26 + (6 / 7) * 111 + (1 / 7) * 877 + 22) * 30));
  assert.equal(hasComputedEv(fra), true);
});

test("the calculator opens on the newest RELEASED set with a computed EV, never on Star Trek", () => {
  assert.equal(defaultBoxSet([TRK, FRA, HOB])?.setCode, "FRA");
  // A released set whose paying pools are still mostly unpriced (Star Trek's real mythic rows: 1 of 4 priced) is passed over.
  const thin = { ...TRK, setCode: "THIN", released: true, pools: TRK_POOLS.filter((p) => p.pool === "Mythic" || p.pool === "AltMythic") };
  assert.equal(hasComputedEv(openingEv(thin)), false);
  assert.equal(defaultBoxSet([TRK, thin, HOB])?.setCode, "HOB");
  // Fallbacks: the newest released set, then the first set; never nothing while there is a set.
  assert.equal(defaultBoxSet([TRK, thin])?.setCode, "THIN");
  assert.equal(defaultBoxSet([TRK])?.setCode, "TRK");
  assert.equal(defaultBoxSet([]), null);
});

test("the picker labels a set that is not out yet, with its date", () => {
  assert.equal(boxSetLabel(TRK), "Star Trek (TRK) · unreleased, out Nov 13, 2026");
  assert.equal(boxSetLabel(FRA), "Reality Fracture (FRA)");
  assert.equal(boxSetLabel({ ...TRK, releasedOn: null }), "Star Trek (TRK) · unreleased");
});

test("the page decides release and the opening set on the server; the calculator labels, opens there and gives an unreleased set no verdict", () => {
  const page = read("src/app/tools/box-ev/page.tsx");
  assert.match(page, /released: isReleased\(s\.releasedOn, today\)/);
  assert.match(page, /<BoxEvCalculator sets=\{sets\} offers=\{boxOffers\} initialSetCode=\{defaultBoxSet\(sets\)\?\.setCode\} \/>/);
  const calc = read("src/components/BoxEvCalculator.tsx");
  assert.match(calc, /const opening = sets\.find\(\(s\) => s\.setCode === initialSetCode\) \?\? sets\[0\];/);
  assert.match(calc, /useState\(opening\?\.setCode \?\? ""\)/);
  assert.match(calc, /<option key=\{s\.setCode\} value=\{s\.setCode\}>\{boxSetLabel\(s\)\}<\/option>/);
  assert.match(calc, /const verdict = set\.released \? verdictFor\(/);
  assert.match(calc, /is not out until/);
  assert.match(calc, /evForPools\(\{ pools: set\.pools, booster, packs, overrides, boxPriceCents: priceUsdCents \}\)/, "one EV function for the calculator and the opening-set choice");
});
