import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DAILY_MAX_RATIO, DAILY_MIN_RATIO, DAILY_ROUNDS, buildPuzzle, isRight, nextStreak, puzzleFor, puzzleNumber, shareResult, upcomingPuzzles, type DailyItem } from "../src/lib/daily";
import { toDailyItems } from "../src/lib/daily-data";
import type { ProductCardData } from "../src/lib/data";

const items: DailyItem[] = Array.from({ length: 300 }, (_, i) => ({ slug: `p${i}`, name: `Product ${i}`, type: "Booster Box", image: "x.jpg", cents: 500 + ((i * 7919) % 20000) }));

test("puzzle numbers start at 1 on the epoch and never move", () => {
  assert.equal(puzzleNumber("2026-11-03"), 1);
  assert.equal(puzzleNumber("2026-11-04"), 2);
  assert.equal(puzzleNumber("2027-11-03"), 366);
});

test("a day's puzzle is ten fair pairs, the same whatever the catalogue's order", () => {
  const p = buildPuzzle(items, "2026-11-10")!;
  assert.equal(p.rounds.length, DAILY_ROUNDS);
  const slugs = p.rounds.flat().map((c) => c.slug);
  assert.equal(new Set(slugs).size, slugs.length, "no product twice");
  for (const [a, b] of p.rounds) {
    const hi = Math.max(a.cents, b.cents), lo = Math.min(a.cents, b.cents);
    assert.ok(hi >= lo * DAILY_MIN_RATIO && hi <= lo * DAILY_MAX_RATIO);
  }
  assert.deepEqual(buildPuzzle([...items].reverse(), "2026-11-10"), p, "order of the catalogue doesn't matter");
  assert.notDeepEqual(buildPuzzle(items, "2026-11-11")!.rounds, p.rounds, "a new day is a new puzzle");
});

test("adding one product leaves most of a day's pairs alone", () => {
  const a = buildPuzzle(items, "2026-11-10")!.rounds.map((r) => r.map((c) => c.slug).join("-"));
  const b = buildPuzzle([...items, { ...items[0], slug: "brand-new" }], "2026-11-10")!.rounds.map((r) => r.map((c) => c.slug).join("-"));
  assert.ok(a.filter((x) => b.includes(x)).length >= 7);
});

test("single packs under 5 and a thin catalogue make no puzzle", () => {
  assert.equal(buildPuzzle(items.map((c) => ({ ...c, cents: 450 })), "2026-11-10"), null);
  assert.equal(buildPuzzle(items.slice(0, 8), "2026-11-10"), null);
});

test("the client finds today's puzzle, else the newest carried", () => {
  const ps = upcomingPuzzles(items, "2026-11-10");
  assert.equal(puzzleFor(ps, "2026-11-12")!.day, "2026-11-12");
  assert.equal(puzzleFor(ps, "2026-12-30")!.day, ps.at(-1)!.day);
});

test("scoring, streaks and the share text", () => {
  const r: [DailyItem, DailyItem] = [{ ...items[0], cents: 5000 }, { ...items[1], cents: 1000 }];
  assert.equal(isRight(r, 0), true);
  assert.equal(isRight(r, 1), false);
  assert.deepEqual(nextStreak(null, 5), { last: 5, count: 1 });
  assert.deepEqual(nextStreak({ last: 4, count: 3 }, 5), { last: 5, count: 4 });
  assert.deepEqual(nextStreak({ last: 2, count: 3 }, 5), { last: 5, count: 1 });
  assert.deepEqual(nextStreak({ last: 5, count: 4 }, 5), { last: 5, count: 4 });
  const t = shareResult("MTG Compare", 12, [true, false, true], 4, "https://x/au/daily?utm_source=share&utm_medium=daily");
  assert.equal(t, "MTG Compare Price Duel #12 · 2/3\n🟩🟥🟩\n🔥 4 day streak\nhttps://x/au/daily?utm_source=share&utm_medium=daily");
  assert.doesNotMatch(t, /\$/, "the share text never spoils a price");
});

test("the pool is in-stock store products with a photo and a price: never a sold-out or TCGplayer-only row", () => {
  const base: ProductCardData = { slug: "a", name: "A", productType: "Booster Box", setCode: null, imageUrl: "a.jpg", lowestPriceCents: 10000, inStockStores: 2, listedStores: 2, marketplaceOpen: false, medianOpenCents: null, releaseDate: null };
  const out = toDailyItems([
    base,
    { ...base, slug: "sold", inStockStores: 0 },
    { ...base, slug: "tcg-only", inStockStores: 0, marketplaceOpen: true },
    { ...base, slug: "no-photo", imageUrl: null },
    { ...base, slug: "no-price", lowestPriceCents: null },
  ]);
  assert.deepEqual(out.map((i) => i.slug), ["a"]);
  assert.equal(out[0].cents, 10000);
});

test("the page is force-dynamic, in the sitemap, the menu and the footer", () => {
  assert.match(fs.readFileSync("src/app/[region]/daily/page.tsx", "utf8"), /export const dynamic = "force-dynamic"/);
  assert.match(fs.readFileSync("src/lib/sitemap.ts", "utf8"), /\/daily`/);
  assert.match(fs.readFileSync("src/lib/nav.ts", "utf8"), /s\("daily"/);
  assert.match(fs.readFileSync("src/components/Footer.tsx", "utf8"), /s\("daily"/);
});
