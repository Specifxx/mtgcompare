// The data-driven posts of 2026-10-14 (owner WP17): the movers report, the cheapest mythic rares by colour, the Commander staples price list and
// the cheapest booster boxes. The selection rules (src/lib/blog/select.ts) run on REAL products of tests/fixtures/magic-products.json (their
// TCGCSV ids, names, slugs, groups and 2026-10-07 prices, Scryfall's Oracle ids): what the fixture does not carry (a card's colour, a weekly
// change, a store listing) is set per test and says so. The loaders run over the published trees the other loader tests use.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import React from "react";
import { CARD_FLAGS, FORMAT_INDEX, ORACLE_FLAGS, PRICE_MASK, fold } from "../src/lib/constants";
import { MARKETS, type Country } from "../src/lib/country";
import type { CardLite, OracleMini, SealedLite, SetLite } from "../src/lib/data";
import { liteFromRow } from "../src/lib/data/lite";
import { resetPlaneForTests } from "../src/lib/data/plane/runtime";
import {
  COLOUR_GROUPS,
  COMMANDER_STAPLES,
  MOVER_FLOOR_CENTS,
  STAPLES_CHOSEN_ON,
  cheapestBoxes,
  cheapestPerCard,
  identityGroup,
  moverList,
  newestExpansions,
  perPack,
  stapleRows,
  stapleStatus,
  stapleSummary,
  type Staple,
} from "../src/lib/blog/select";
import { POSTS, postBySlug } from "../src/lib/blog";
import type { PostContext } from "../src/lib/blog/types";
import { collectMentions } from "../src/components/blog/mentions";
import { realMiniTree, writePlaneDir } from "./helpers/data-source";
import { writeFixtureTree } from "../scripts/smoke-pages";

// The posts are TSX built with the classic runtime under tsx: a build needs React in scope.
(globalThis as { React?: unknown }).React = React;

// ── real products ────────────────────────────────────────────────────────────────────────────────────────────────────────────
interface FixtureProduct {
  productId: number; name: string; groupId: number;
  prices: Partial<Record<"Normal" | "Foil", { market: number | null; low: number | null }>>;
  expect: { slug: string; setTok: string; cls: number | "sealed"; rarity: string | null; nkey: string | null; etched: boolean; displayName: string | null; alt: string | null; sc: string | null };
  scryfall: { id: string; oracle_id: string }[];
}
const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/magic-products.json"), "utf8")) as FixtureProduct[];
const ORACLE_NO = new Map([...new Set(FIXTURE.flatMap((p) => p.scryfall.map((s) => s.oracle_id)))].sort().map((o, i) => [o, i + 1] as const));
const cents = (v: number | null | undefined): number | null => (v == null ? null : Math.round(v * 100));
interface Extra { colors?: number; oracleNo?: number | null; change7d?: number | null; change30d?: number | null; treat?: string; label?: string | null; low?: (number | null)[] }
/** A CardLite of a real product, hydrated by the loaders' own liteFromRow: the mask follows the fixture's prices (Normal first, a low-only unit flagged). */
function lite(id: number, x: Extra = {}): CardLite {
  const p = FIXTURE.find((f) => f.productId === id);
  if (!p) throw new Error(`no fixture product ${id}`);
  const n = p.prices.Normal, f = p.prices.Foil;
  let mask = PRICE_MASK.LISTED;
  if (n) mask |= PRICE_MASK.HASN | (n.market == null ? PRICE_MASK.LOWN : 0) | ((n.market ?? 0) >= 5 ? PRICE_MASK.TRACKN : 0);
  if (f) mask |= PRICE_MASK.HASF | (f.market == null ? PRICE_MASK.LOWF : 0) | ((f.market ?? 0) >= 5 ? PRICE_MASK.TRACKF : 0);
  if (!n || (n.market == null && f?.market != null)) mask |= PRICE_MASK.HEADF;
  return liteFromRow({
    id, slug: p.expect.slug, name: p.expect.displayName ?? p.name, alt: p.expect.alt, setId: p.groupId, sc: p.expect.sc, number: p.expect.nkey, rarity: p.expect.rarity ?? "C",
    cls: p.expect.cls as number, treat: x.treat ?? "", label: x.label ?? null, flags: CARD_FLAGS.TCGIMG | (p.expect.etched ? CARD_FLAGS.ETCHED : 0),
    oracleNo: x.oracleNo === undefined ? ORACLE_NO.get(p.scryfall[0]?.oracle_id ?? "") ?? null : x.oracleNo, scryId: p.scryfall[0]?.id ?? null, colors: x.colors ?? 0, mv: 0, ptype: 0, setTok: p.expect.setTok,
    marketN: cents(n?.market), marketF: cents(f?.market), lowN: cents(n?.low), lowF: cents(f?.low), mask, shown: mask & PRICE_MASK.HEADF ? "F" : "N",
    low: x.low ?? null, stores: x.low ? x.low.map((v) => (v == null ? 0 : 2)) : null, change7d: x.change7d ?? null, change30d: x.change30d ?? null, high90: null,
  });
}
const ids = (cs: readonly CardLite[]): number[] => cs.map((c) => c.id);

// ── movers ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("movers: priced class-0 units at or above the floor, the right way, one row per card, largest move first (changes are test inputs)", () => {
  const erayo = lite(12430, { change7d: 40.2 });
  const feed = [
    erayo,
    lite(541332, { change7d: 25 }),                 // Ezio Auditore da Firenze (Foil Etched): a foil-only product, ranked by its Foil unit
    lite(2831, { change7d: 18.5 }),                 // Birds of Paradise (7th Edition), US$22.89
    lite(496078, { change7d: 60 }),                 // a 25-cent Forest: under the 50-cent floor however far it moves (Counterspell at US$3.94 cleared it on 2026-10-17)
    lite(165632, { change7d: 90 }),                 // Treasure Token (2018 Lunar New Year), US$215.24: a token never counts
    lite(8989, { change7d: 50 }),                   // Black Lotus (Unlimited): only a single US$18,149.99 listing, low only, never ranked
    lite(560662, { change7d: -5 }),                 // African Swallow - Birds of Paradise: a fall is not a riser
    lite(12430, { change7d: 40.2 }),                // the same product again: one row per card
  ];
  const up = moverList(feed, "up", 7);
  assert.deepEqual(ids(up), [12430, 541332, 2831], "Erayo, Ezio Auditore da Firenze, Birds of Paradise");
  assert.equal(up[1]!.headFinish, "F", "the foil-only product is shown in the unit it is priced in");
  assert.ok(up.every((c) => (c.marketUsd ?? 0) >= MOVER_FLOOR_CENTS && !c.lowOnly && c.cls === 0));
  const down = moverList([lite(456592, { change7d: -12 }), lite(692998, { change7d: -8 }), lite(80110, { change7d: -30 }), lite(2831, { change7d: 3 })], "down", 7);
  assert.deepEqual(ids(down), [456592, 692998], "Megatron - Blightsteel Colossus and Stingcaster Mage; a 10-cent common is under the floor; a riser is not a faller");
  // ties go to the dearer card; the 30-day lists read the 30-day change only
  const tie = moverList([lite(12430, { change7d: 10 }), lite(560662, { change7d: 10 })], "up", 7);
  assert.deepEqual(ids(tie), [560662, 12430], "African Swallow (US$44.23) before Erayo (US$23.21)");
  assert.deepEqual(ids(moverList([lite(2831, { change7d: 50, change30d: null }), lite(12430, { change7d: null, change30d: 12 })], "up", 30)), [12430]);
  assert.equal(moverList(feed, "up", 7, { n: 1 }).length, 1);
});

// ── cheapest mythics by colour ───────────────────────────────────────────────────────────────────────────────────────────────
test("cheapest per card: the cheapest priced printing of each Oracle card, cheapest first; low-only units and tokens never; an unjoined product is its own card", () => {
  const rows = cheapestPerCard([
    lite(536485),                                   // Case of the Locked Hothouse, Prerelease (foil only, US$7.32)
    lite(533889),                                   // Case of the Locked Hothouse, Murders at Karlov Manor (US$3.96): the same Oracle card, cheaper
    lite(560662),                                   // African Swallow - Birds of Paradise (US$44.23): Birds of Paradise's Oracle card
    lite(2831),                                     // Birds of Paradise, 7th Edition (US$22.89)
    lite(449401),                                   // Living Artifact (Retro Frame): one US$203,067.70 listing, low only
    lite(542621),                                   // Food // Copy token: class 1
    lite(80110),                                    // Royal Herbalist (US$0.10)
    lite(496078, { oracleNo: null }),               // Forest (Doctor Who) as an unjoined product (US$0.25)
  ], 10);
  assert.deepEqual(rows.map((c) => c.id), [80110, 496078, 533889, 2831]);
  assert.deepEqual(cheapestPerCard([lite(2831), lite(560662)], 1).map((c) => c.id), [2831], "n caps the rows");
});

test("newest expansions: released expansions with enough printings, newest first; promos, buckets, masters sets, small and future sets are not read", () => {
  const set = (id: number, name: string, kind: SetLite["kind"], releasedOn: string | null, cardCount: number, bucket = false): SetLite => ({ id, slug: String(id), tok: String(id), code: String(id), name, tcgName: name, kind, releasedOn, bucket, cardCount, trackedCount: 0, sealedCount: 0 });
  const sets = [
    set(23874, "Murders at Karlov Manor", "expansion", "2024-02-09", 446),
    set(24220, "FINAL FANTASY", "expansion", "2025-06-13", 584),
    set(23587, "Edge of Eternities", "expansion", "2025-08-01", 391),
    set(23331, "Duskmourn: House of Horror", "expansion", "2024-09-27", 432),
    set(23019, "Universes Beyond: Doctor Who", "expansion", "2023-10-13", 1014),
    set(2848, "Modern Horizons 2", "masters", "2021-06-18", 836),
    set(92, "Prerelease Cards", "promo", "2026-10-07", 4006, true),
    set(1, "A promo sheet filed early", "expansion", "2025-07-01", 12),
  ];
  assert.deepEqual(newestExpansions(sets, "2026-10-14").map((s) => s.name), ["Edge of Eternities", "FINAL FANTASY", "Duskmourn: House of Horror", "Murders at Karlov Manor"]);
  assert.deepEqual(newestExpansions(sets, "2025-07-01", 2).map((s) => s.name), ["FINAL FANTASY", "Duskmourn: House of Horror"], "a set released after today is not read yet");
  assert.deepEqual(COLOUR_GROUPS.map((g) => g.key), ["white", "blue", "black", "red", "green", "multicolor", "colorless"]);
  assert.deepEqual(COLOUR_GROUPS.map((g) => g.colors.mode), ["exact", "exact", "exact", "exact", "exact", "multi", "colorless"]);
});

// ── Commander staples ────────────────────────────────────────────────────────────────────────────────────────────────────────
const commanderLegal = (c: "L" | "B" | "N" | "?"): string => { const s = "?".repeat(22).split(""); s[FORMAT_INDEX.commander] = c; return s.join(""); };
const oracle = (no: number, name: string, identity: number, legal: string, flags = 0): OracleMini => ({ no, slug: fold(name).replace(/ /g, "-"), name, nameKey: fold(name), colors: identity, identity, typeLine: "", nPrint: 1, legal, flags });

test("the curated list: 25 to 40 staples with unique names, none on the Commander banned list as it stood when it was chosen", () => {
  assert.ok(COMMANDER_STAPLES.length >= 25 && COMMANDER_STAPLES.length <= 40, `${COMMANDER_STAPLES.length} staples`);
  assert.equal(new Set(COMMANDER_STAPLES.map((s) => fold(s.name))).size, COMMANDER_STAPLES.length);
  assert.match(STAPLES_CHOSEN_ON, /^\d{4}-\d{2}-\d{2}$/);
  // banned in Commander on or before the day the list was chosen (the September 2024 four and long-standing entries); later bans are the runtime check's job (stapleStatus)
  const banned = ["Dockside Extortionist", "Jeweled Lotus", "Mana Crypt", "Nadu, Winged Wisdom", "Black Lotus", "Time Walk", "Ancestral Recall", "Tinker", "Flash", "Fastbond", "Paradox Engine", "Primeval Titan", "Hullbreacher", "Iona, Shield of Emeria", "Erayo, Soratami Ascendant", "Griselbrand", "Tolarian Academy"].map(fold);
  assert.deepEqual(COMMANDER_STAPLES.filter((s) => banned.includes(fold(s.name))), []);
});

test("staples: a name resolves to its Oracle card and is priced at the printing given; a ban, an unknown name and a missing price are told apart", () => {
  const list: Staple[] = [
    { name: "Sol Ring", role: "Ramp" },
    { name: "Counterspell", role: "Counterspell" },
    { name: "Erayo, Soratami Ascendant", role: "Card draw" },  // a real Commander ban, with a real printing
    { name: "Demonic Tutor", role: "Tutor" },                    // resolves, no printing given here
    { name: "Rhystic Study", role: "Card draw" },                // no Oracle card in this map
    { name: "Living Artifact", role: "Recursion" },              // priced only by one listing
    { name: "Treasure", role: "Ramp" },                          // a token product is never a staple's printing
  ];
  const oracles = new Map([
    oracle(1, "Sol Ring", 0, commanderLegal("L")),
    oracle(2, "Counterspell", 2, commanderLegal("?")),            // unknown legality is not "not legal"
    oracle(3, "Erayo, Soratami Ascendant", 2, commanderLegal("B")),
    oracle(4, "Demonic Tutor", 4, commanderLegal("L"), ORACLE_FLAGS.GAME_CHANGER),
    oracle(5, "Living Artifact", 16, commanderLegal("L")),
    oracle(6, "Treasure", 0, commanderLegal("L")),
  ].map((o) => [o.nameKey, o] as const));
  const printings = new Map<number, CardLite>([[1, lite(594545)], [2, lite(238617)], [3, lite(12430)], [5, lite(449401)], [6, lite(165632)]]);
  const rows = stapleRows(list, oracles, printings, fold);
  assert.deepEqual(rows.map(stapleStatus), ["priced", "priced", "banned", "unpriced", "unknown", "low-only", "unpriced"]);
  assert.equal(rows[0]!.card!.id, 594545, "Sol Ring at the printing given (the Buy-a-Box promo is the fixture's only one)");
  const s = stapleSummary(rows);
  assert.equal(s.totalCents, 788 + 394, "only priced rows are totalled; a single listing never is");
  assert.deepEqual([s.under1, s.under5], [0, 1]);
  assert.deepEqual(s.dearest.map((r) => r.staple.name), ["Sol Ring", "Counterspell"]);
  assert.deepEqual(s.banned.map((r) => r.staple.name), ["Erayo, Soratami Ascendant"]);
  assert.deepEqual(s.unknown.map((r) => r.staple.name), ["Rhystic Study"]);
  assert.deepEqual(s.gameChangers.map((r) => r.staple.name), ["Demonic Tutor"]);
  assert.deepEqual(s.shown.map((r) => r.staple.name), ["Sol Ring", "Counterspell", "Demonic Tutor", "Living Artifact", "Treasure"], "banned and unknown names are never in a table");
  assert.deepEqual([0, 2, 4, 1 | 16, 31].map(identityGroup), ["colorless", "blue", "black", "multicolor", "multicolor"]);
});

// ── cheapest boxes ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const box = (id: number, name: string, o: { usd?: number | null; low?: Partial<Record<Country, number>>; packs?: number | null; presale?: boolean }): SealedLite => ({
  id, slug: `box-${id}`, name, setId: null, kind: "Booster Box", packCount: o.packs ?? null, releasedOn: "2025-01-01", presale: o.presale ?? false, marketUsd: o.usd ?? null, lowTcg: null,
  low: Object.fromEntries(MARKETS.map((m) => [m, o.low?.[m] ?? null])) as Record<Country, number | null>,
  stores: Object.fromEntries(MARKETS.map((m) => [m, o.low?.[m] != null ? 3 : 0])) as Record<Country, number>, change7d: null,
});

test("cheapest boxes: in stock in the market asked (a listing and a store), cheapest listing first; pre-orders never; the cost per pack only with a pack count (prices are test inputs)", () => {
  const boxes = [
    box(1, "Duskmourn: House of Horror Play Booster Display", { usd: 13999, low: { US: 12999, AU: 21999 }, packs: 36 }),
    box(2, "Foundations Jumpstart Booster Display", { usd: 9999, low: { US: 10999 }, packs: 24 }),
    box(3, "An upcoming set Play Booster Display", { usd: 14999, low: { US: 8999 }, packs: 36, presale: true }),
    box(4, "Bloomburrow Collector Booster Display", { usd: 27999, low: { AU: 39999 }, packs: 12 }),
    box(5, "A box with no pack count", { usd: 9999, low: { US: 10999 } }),
  ];
  assert.deepEqual(cheapestBoxes(boxes, "US").map((b) => b.id), [2, 5, 1], "the pre-order is left out; a tie on the listing goes to the lower market, then the lower id");
  assert.deepEqual(cheapestBoxes(boxes, "AU").map((b) => b.id), [1, 4]);
  assert.deepEqual(cheapestBoxes(boxes, "UK"), []);
  assert.equal(perPack(12999, 36), 361);
  assert.equal(perPack(10999, null), null);
});

// ── the posts themselves ─────────────────────────────────────────────────────────────────────────────────────────────────────
const NEW_SLUGS = ["magic-card-price-movers", "cheapest-magic-mythic-rares-by-colour", "commander-staples-prices", "cheapest-magic-booster-boxes"];
function baseCtx(over: Partial<PostContext> = {}): PostContext {
  return {
    cat: { pricesAt: "2026-10-14T21:41:07Z" }, stats: { cards: 0, tracked: 0, units: 0, oracles: 0, sets: 0, sealed: 0, pricedByMarket: { US: 0, AU: 0, UK: 0, SG: 0, CA: 0, EU: 0 }, pricesAt: "2026-10-14T21:41:07Z" },
    site: { lastImportAt: null, storeOffers: [], ebayLive: false }, index: [], sets: [], setById: new Map(),
    overview: { at: "", basket: { n: 0, totalUsd: 0, avg: 0, median: 0 }, advancing: 0, declining: 0, constituents: [], sets: [] },
    records: Object.fromEntries(MARKETS.map((m) => [m, { gaps: [], highs: [], lows: [] }])) as unknown as PostContext["records"],
    top: [], topFoil: [], rarities: [], newest: null, boards: [], boxes: [], releases: [],
    movers: { up7: [], down7: [], up30: [], down30: [] }, mythics: { sets: [], groups: [], treated: [] }, staples: [], cheapBoxes: [], starTrek: null, country: "US", ...over,
  };
}

test("the four posts are registered newest first, dated, blog posts with FAQs and three related links", () => {
  // The four, in this order, right after the release posts (the Star Trek pair, which lead while the release is ahead).
  const at = POSTS.findIndex((p) => p.slug === "magic-card-price-movers");
  assert.ok(POSTS.slice(0, at).every((p) => p.slug.includes("star-trek")), "only the release posts come before the four");
  assert.deepEqual(POSTS.slice(at, at + 4).map((p) => p.slug), ["magic-card-price-movers", "commander-staples-prices", "cheapest-magic-mythic-rares-by-colour", "cheapest-magic-booster-boxes"]);
  for (const slug of NEW_SLUGS) {
    const p = postBySlug(slug)!;
    assert.equal(p.date, "2026-10-14", slug);
    assert.equal(p.category ?? "blog", "blog", slug);
    assert.ok((p.faq?.length ?? 0) >= 4, slug);
    assert.equal(p.related.length, 3, slug);
    assert.ok(p.related.every((r) => /^\/(?!\/)/.test(r.href)), slug);
  }
});

test("a section that could not be read (null) or holds nothing builds a short honest post, never a throw and never a table of nothing", () => {
  for (const slug of NEW_SLUGS) {
    const p = postBySlug(slug)!;
    for (const ctx of [baseCtx({ movers: null, mythics: null, staples: null, cheapBoxes: null }), baseCtx()]) {
      const b = p.build(ctx);
      assert.ok(b.lede, slug);
      assert.ok(b.heroCards.length <= 3, slug);
      assert.ok(b.sections.every((s) => s.id && s.title), slug);
    }
    assert.deepEqual(p.build(baseCtx({ movers: null, mythics: null, staples: null, cheapBoxes: null })).heroCards, [], slug);
  }
  const movers = postBySlug("magic-card-price-movers")!.build(baseCtx({ index: [{ day: "2026-10-08", value: 1000, totalUsd: 1, cardCount: 1 }] }));
  assert.deepEqual(movers.sections.map((s) => s.id), ["method"], "no history yet: the method, and a lede that says when the tables fill in");
});

test("the movers post: risers and fallers tables of real cards, the finish named, the month only when it exists; the shop strip finds the cards", () => {
  const up7 = [lite(12430, { change7d: 40.2 }), lite(541332, { change7d: 25 }), lite(496078, { change7d: 60 })];
  const down7 = [lite(456592, { change7d: -12 })];
  const b = postBySlug("magic-card-price-movers")!.build(baseCtx({ movers: { up7, down7, up30: [], down30: [] } }));
  assert.deepEqual(b.sections.map((s) => s.id), ["risers", "fallers", "why", "reading", "method"]);
  assert.equal(b.sections[0]!.title, "The 2 biggest risers this week", "the 25-cent Forest is under the floor");
  assert.deepEqual(b.heroCards.map((c) => c.id), [12430, 456592, 541332]);
  const m = collectMentions(b.sections.map((s) => s.body));
  for (const c of [...up7.slice(0, 2), ...down7]) assert.ok(m.cards.includes(c.slug), c.slug);
  const month = postBySlug("magic-card-price-movers")!.build(baseCtx({ movers: { up7, down7, up30: [lite(2831, { change30d: 9 })], down30: [] } }));
  assert.ok(month.sections.some((s) => s.id === "month"));
});

test("the colour post: one section per colour that has a priced mythic, the special frames, and a note naming the colours left out", () => {
  // Brazen Borrower (Commander: Wilds of Eldraine, US$1.61) and the Borderless Spider-Gwen, Web-Warrior - Najeela (US$4.86) are real mythic rares; the set row is a test input
  const mythics = { sets: [{ id: 23874, slug: "mkm-murders-at-karlov-manor", tok: "mkm", code: "MKM", name: "Murders at Karlov Manor", tcgName: "Murders at Karlov Manor", kind: "expansion", releasedOn: "2024-02-09", bucket: false, cardCount: 446, trackedCount: 0, sealedCount: 0 } as SetLite], groups: [{ key: "blue", cards: [lite(513650, { colors: 2 })] }], treated: [lite(652038, { colors: 16 | 1 | 2 | 4 | 8, treat: "borderless", label: "Borderless" })] };
  const b = postBySlug("cheapest-magic-mythic-rares-by-colour")!.build(baseCtx({ mythics }));
  assert.deepEqual(b.sections.map((s) => s.id), ["blue", "special-frames", "why", "buying", "coverage"]);
  assert.deepEqual(b.heroCards.map((c) => c.id), [513650]);
  assert.equal(b.summary.length, 4);
});

test("the staples post: grouped by colour identity, colourless first; a ban is named in the method, never tabled", () => {
  const rows = stapleRows(
    [{ name: "Sol Ring", role: "Ramp" }, { name: "Counterspell", role: "Counterspell" }, { name: "Erayo, Soratami Ascendant", role: "Card draw" }],
    new Map([oracle(1, "Sol Ring", 0, commanderLegal("L")), oracle(2, "Counterspell", 2, commanderLegal("L")), oracle(3, "Erayo, Soratami Ascendant", 2, commanderLegal("B"))].map((o) => [o.nameKey, o] as const)),
    new Map<number, CardLite>([[1, lite(594545)], [2, lite(238617)], [3, lite(12430)]]),
    fold,
  );
  const b = postBySlug("commander-staples-prices")!.build(baseCtx({ staples: rows }));
  assert.deepEqual(b.sections.map((s) => s.id), ["staples-colorless", "staples-blue", "where-the-money-goes", "how-chosen", "saving"]);
  const m = collectMentions(b.sections.map((s) => s.body));
  assert.ok(m.cards.includes(lite(594545).slug) && m.cards.includes(lite(238617).slug), m.cards.join(","));
  assert.ok(!m.cards.includes(lite(12430).slug), "the banned card is not in a table");
});

test("the boxes post: the visitor's market, every market's cheapest, and the TCGplayer ranking", () => {
  const all = [box(1, "Duskmourn: House of Horror Play Booster Display", { usd: 13999, low: { US: 12999, AU: 21999 }, packs: 36 }), box(2, "Foundations Jumpstart Booster Display", { usd: 9999, low: { US: 10999 }, packs: 24 })];
  const b = postBySlug("cheapest-magic-booster-boxes")!.build(baseCtx({ cheapBoxes: all, country: "AU" }));
  assert.deepEqual(b.sections.map((s) => s.id), ["your-market", "by-market", "tcgplayer", "why-cheap", "before-you-buy"]);
  assert.equal(collectMentions(b.sections.map((s) => s.body)).sealed[0], "box-1");
});

// ── the loaders, over published trees ────────────────────────────────────────────────────────────────────────────────────────
async function withTree<T>(dir: string, run: () => Promise<T>): Promise<T> {
  const was = process.env.PLANE_DIR; process.env.PLANE_DIR = dir; resetPlaneForTests();
  try { return await run(); } finally { if (was === undefined) delete process.env.PLANE_DIR; else process.env.PLANE_DIR = was; resetPlaneForTests(); fs.rmSync(dir, { recursive: true, force: true }); }
}

test("loadStaples over the real products: Sol Ring and Counterspell resolve by name to their printings; the other names are reported, never guessed", async () => {
  await withTree(writePlaneDir(realMiniTree()), async () => {
    const { loadStaples } = await import("../src/lib/blog/context");
    const rows = await loadStaples();
    assert.equal(rows.length, COMMANDER_STAPLES.length);
    const by = new Map(rows.map((r) => [r.staple.name, r]));
    assert.equal(by.get("Sol Ring")!.card?.id, 594545, "the fixture's only Sol Ring is the Buy-a-Box promo");
    assert.equal(by.get("Counterspell")!.card?.id, 238617);
    assert.ok(rows.filter((r) => !["Sol Ring", "Counterspell"].includes(r.staple.name)).every((r) => stapleStatus(r) === "unknown"));
  });
});

test("postContext over a full published tree: every post builds; the optional sections are built once per data commit", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "blog-posts-"));
  writeFixtureTree(dir);
  await withTree(dir, async () => {
    const { postContext, perCommit } = await import("../src/lib/blog/context");
    const ctx = await postContext("US");
    assert.ok(ctx.movers && ctx.mythics && ctx.staples && ctx.cheapBoxes && ctx.starTrek, "every section was read");
    assert.ok(ctx.starTrek.oracles instanceof Map && Array.isArray(ctx.starTrek.shocks) && Array.isArray(ctx.starTrek.keywords), "the Star Trek lookups read the published tree");
    assert.ok(ctx.mythics.sets.length > 0 && ctx.mythics.groups.some((g) => g.cards.length > 0));
    for (const p of POSTS) {
      const b = p.build(ctx);
      assert.ok(b.heroCards.length <= 3, p.slug);
      assert.ok(p.title(ctx).length > 10, p.slug);
    }
    let builds = 0;
    const once = () => perCommit("test-once", async () => ++builds);
    assert.deepEqual([await once(), await once()], [1, 1], "a second request reads the memo");
    let tries = 0;
    const flaky = () => perCommit("test-flaky", async () => { tries++; if (tries === 1) throw new Error("the host refused"); return "ok"; });
    assert.equal(await flaky(), null, "a failed build is null for this request");
    assert.equal(await flaky(), "ok", "and is not kept: the next request builds again");
  });
});
