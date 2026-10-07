import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CHASE_POOLS,
  DEFAULT_PACKS,
  PER_BOX_DEFAULTS,
  cheapestBoxOffer,
  computeEv,
  derivedRates,
  oneInPacks,
  poolOf,
  poolStats,
  verdictFor,
  type PoolKey,
} from "../src/lib/box-ev";
import { CARDS_PER_PACK, PACKS_PER_BOX, PACK_SLOTS, PULL_RATES, PACK_SOURCES } from "../src/lib/pack-composition";

// ─────────────────────────────────────────────────────────────────────────────
// Box EV (RiftCompare's tests/box-ev.test.ts and tests/pack-composition.test.ts,
// for One Piece). Bandai publishes no pull rates: every default is a community
// estimate, marked unsourced with its pages listed, and set LOW on purpose.
// ─────────────────────────────────────────────────────────────────────────────

const c = (printing: string, rarity: string | null, valueCents: number | null = null) => ({ printing, rarity, valueCents });
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("a standard card lands in its printed rarity; chase printings get their own pools", () => {
  assert.equal(poolOf(c("standard", "C")), "Common");
  assert.equal(poolOf(c("standard", "UC")), "Uncommon");
  assert.equal(poolOf(c("standard", "R")), "Rare");
  assert.equal(poolOf(c("standard", "L")), "Leader");
  assert.equal(poolOf(c("standard", "SR")), "SuperRare");
  assert.equal(poolOf(c("standard", "SEC")), "SecretRare");
  assert.equal(poolOf(c("alt", "SR")), "Parallel", "a Parallel of any rarity is the Parallel pool");
  assert.equal(poolOf(c("alt", "L")), "Parallel");
  assert.equal(poolOf(c("sp", "SR")), "SP");
  assert.equal(poolOf(c("treasure", "TR")), "Treasure");
  assert.equal(poolOf(c("manga", "SEC")), "Manga");
});

test("promos, reprints, special foils and DON!! are not pulls from a set's packs", () => {
  for (const p of ["promo", "reprint", "foil", "don"]) assert.equal(poolOf(c(p, "SR")), null, p);
  assert.equal(poolOf(c("standard", "PR")), null, "a promo rarity on a standard printing is not a pack pool");
  assert.equal(poolOf(c("standard", null)), null);
});

test("the average divides by EVERY card in the pool, not just the priced ones; no outlier cap", () => {
  const s = poolStats([c("alt", "SR", 1000), c("alt", "R", null), c("alt", "C", 0), c("alt", "L", 3000)]);
  const p = s.get("Parallel")!;
  assert.equal(p.total, 4);
  assert.equal(p.priced, 2);
  assert.equal(p.avgCents, 1000, "(1000 + 3000) / 4 — unpriced cards count as zero");
  assert.equal(p.topCents, 3000);
  const chase = poolStats([c("manga", "SEC", 500_000), c("manga", "SR", 1000)]).get("Manga")!;
  assert.equal(chase.avgCents, 250_500, "the expensive chase card is the signal, not noise");
});

test("the defaults are the low end: Leader 5, SR 7, SEC 0.5, Parallel 2 a box; SP and Treasure 1 a case; Manga 1 per 3 cases", () => {
  assert.equal(PER_BOX_DEFAULTS.Leader, 5);
  assert.equal(PER_BOX_DEFAULTS.SuperRare, 7);
  assert.equal(PER_BOX_DEFAULTS.SecretRare, 0.5);
  assert.equal(PER_BOX_DEFAULTS.Parallel, 2);
  assert.equal(PER_BOX_DEFAULTS.SP, 1 / 12);
  assert.equal(PER_BOX_DEFAULTS.Treasure, 1 / 12);
  assert.equal(PER_BOX_DEFAULTS.Manga, 1 / 36);
  assert.equal(DEFAULT_PACKS, 24);
});

const ALL = new Map<PoolKey, number>([
  ["Common", 40], ["Uncommon", 30], ["Rare", 20], ["Leader", 6], ["SuperRare", 12], ["SecretRare", 2],
  ["Parallel", 25], ["SP", 6], ["Treasure", 1], ["Manga", 3],
]);

test("rates: Common and Uncommon per pack; the rest per box over the box's packs; Rare + SR + SEC fill the one rare slot", () => {
  const r = derivedRates({ counts: ALL, packs: 24 });
  assert.equal(r.Common, 7);
  assert.equal(r.Uncommon, 3);
  assert.equal(r.Leader, 5 / 24);
  assert.equal(r.SuperRare, 7 / 24);
  assert.ok(Math.abs(r.Rare + r.SuperRare + r.SecretRare - 1) < 1e-12, "one rare-or-better card a pack");
  assert.equal(r.Manga, 1 / 36 / 24);
  // A 20-pack box gets the same hits per BOX.
  const small = derivedRates({ counts: ALL, packs: 20 });
  assert.ok(Math.abs(small.SuperRare * 20 - 7) < 1e-12);
  assert.ok(Math.abs(small.Parallel * 20 - 2) < 1e-12);
  // A pool with no cards in this set gets 0.
  const none = derivedRates({ counts: new Map<PoolKey, number>([["Common", 5]]), packs: 24 });
  for (const p of CHASE_POOLS) assert.equal(none[p], 0);
  assert.equal(none.Rare, 0);
});

test("a Manga card at $1,000 cannot dominate EV at a 1-in-36-boxes rate", () => {
  const stats = poolStats([
    ...Array.from({ length: 40 }, () => c("standard", "C", 10)),
    ...Array.from({ length: 30 }, () => c("standard", "UC", 15)),
    ...Array.from({ length: 20 }, () => c("standard", "R", 50)),
    ...Array.from({ length: 12 }, () => c("standard", "SR", 500)),
    ...Array.from({ length: 6 }, () => c("standard", "L", 100)),
    ...Array.from({ length: 25 }, () => c("alt", "SR", 1500)),
    c("manga", "SEC", 100_000),
  ]);
  const counts = new Map([...stats].map(([k, v]) => [k, v.total]));
  const ev = computeEv({ stats, rates: derivedRates({ counts, packs: 24 }), packs: 24, boxPriceCents: 10_000 });
  const manga = ev.lines.find((l) => l.pool === "Manga")!;
  assert.ok(manga.share < 0.25, `Manga is ${(manga.share * 100).toFixed(1)}% of EV`);
  // $1,000 at 1/36 a box is about $27.78 of a box's EV, not $1,000.
  assert.ok(Math.abs(manga.contributionCents * 24 - 100_000 / 36) < 50);
  assert.ok(ev.evBoxCents < 15_000, "a box of mostly bulk, not a set sum");
});

test("EV is rate × average, summed, then × packs; shares sum to 1; the ratio is EV over price", () => {
  const stats = poolStats([c("standard", "C", 10), c("standard", "R", 100), c("alt", "SR", 2400)]);
  const rates = { Common: 7, Rare: 1, Parallel: 2 / 24 };
  const ev = computeEv({ stats, rates, packs: 24, boxPriceCents: 10_000 });
  assert.equal(ev.evPackCents, Math.round(7 * 10 + 100 + (2 / 24) * 2400));
  assert.equal(ev.evBoxCents, Math.round((7 * 10 + 100 + (2 / 24) * 2400) * 24));
  assert.ok(Math.abs(ev.lines.reduce((a, l) => a + l.share, 0) - 1) < 1e-9);
  assert.equal(ev.ratio, ev.evBoxCents / 10_000);
  assert.equal(computeEv({ stats, rates: {}, packs: 24, boxPriceCents: 0 }).lines.every((l) => l.share === 0), true, "zero EV: shares of 0, not NaN");
  assert.equal(computeEv({ stats, rates, packs: 24, boxPriceCents: 0 }).ratio, null);
});

test("no verdict when the paying pools are mostly unpriced; chase-heavy EV is not called positive", () => {
  const unpriced = poolStats([c("standard", "C", null), c("standard", "C", null), c("standard", "C", null), c("standard", "R", 100)]);
  const ev = computeEv({ stats: unpriced, rates: { Common: 7, Rare: 1 }, packs: 24, boxPriceCents: 10_000 });
  assert.equal(ev.pricedShare, 0.25);
  const v = verdictFor(ev.ratio, { pricedShare: ev.pricedShare, chaseShare: ev.chaseShare });
  assert.match(v!.text, /Too few cards/);
  assert.equal(verdictFor(0.2, { pricedShare: 0.25 })!.tone, "flat", "never 'price is well above EV' on missing prices");
  // Every card priced: the usual verdicts apply.
  assert.equal(verdictFor(0.5, { pricedShare: 1, chaseShare: 0.1 })!.tone, "down");
  // A $4,800 Parallel carrying the EV: positive ratio, but not a green light.
  const skew = poolStats([c("standard", "C", 10), c("alt", "SR", 480_000)]);
  const sk = computeEv({ stats: skew, rates: { Common: 7, Parallel: 2 / 24 }, packs: 24, boxPriceCents: 10_000 });
  assert.ok(sk.chaseShare >= 0.9 && sk.ratio! > 1.1);
  const sv = verdictFor(sk.ratio, { pricedShare: sk.pricedShare, chaseShare: sk.chaseShare })!;
  assert.equal(sv.tone, "flat");
  assert.match(sv.text, /handful of chase cards/);
});

test("verdicts at RiftCompare's thresholds; '1 in N packs' for fractional rates", () => {
  assert.equal(verdictFor(null), null);
  assert.equal(verdictFor(1.2)!.tone, "up");
  assert.equal(verdictFor(1.0)!.tone, "up");
  assert.equal(verdictFor(0.9)!.tone, "flat");
  assert.equal(verdictFor(0.5)!.tone, "down");
  assert.match(verdictFor(0.5)!.text, /buying the singles you want is cheaper/);
  assert.equal(oneInPacks(1 / 288), "≈ 1 in 288 packs");
  assert.equal(oneInPacks(2), null);
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

test("pack composition: 12 cards, every estimate unsourced with its pages listed, never dressed up as published", () => {
  assert.equal(CARDS_PER_PACK, 12);
  assert.equal(PACKS_PER_BOX, 24);
  for (const s of PACK_SLOTS) {
    assert.equal(s.sourced, false, `${s.key}: Bandai publishes no pack contents`);
    assert.ok(s.sources.length > 0);
  }
  for (const r of PULL_RATES) {
    assert.equal(r.sourced, false, `${r.key}: Bandai publishes no rates`);
    assert.ok(r.sources.length > 0 && r.sources.every((u) => /^https:\/\//.test(u)));
    assert.ok(Math.abs(r.onePerPacks - 24 / r.perBox) < 0.01, `${r.key}: one in N packs matches its per-box figure`);
  }
  assert.ok(Object.values(PACK_SOURCES).some((u) => u.includes("tcgtalk.com")));
  assert.ok(Object.values(PACK_SOURCES).some((u) => u.includes("slab-z.com")));
  assert.ok(Object.values(PACK_SOURCES).some((u) => u.includes("bountytcg.app")));
  assert.ok(Object.values(PACK_SOURCES).some((u) => u.includes("one-piece-tcg.com")));
});

test("the page and calculator say the rates are community estimates set low, and the old set-sum page redirects", () => {
  const page = read("src/app/tools/box-ev/page.tsx");
  assert.match(page, /export const revalidate = 86400/);
  const calc = read("src/components/BoxEvCalculator.tsx");
  assert.match(calc, /Bandai publishes no pull rates/);
  assert.match(calc, /set low on purpose/);
  assert.match(read("next.config.js"), /source: "\/tools\/box-value", destination: "\/tools\/box-ev", permanent: true/);
});
