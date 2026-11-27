import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { hotChart, hotMove, hotName } from "../src/lib/hot100";
import type { PriceHistory } from "../src/lib/price-history";

// The weekly Hot 100 (owner, 2026-11-18): real risers only, two or more stores on both days, last week's place from the same history.
const D = 20_400;
const h = (series: Record<string, [number, number | null, number][]>): PriceHistory => ({ v: 1, since: D - 30, through: D, series: { US: series } });

test("ranks real risers only, biggest first, and keeps the honest count", () => {
  const c = hotChart(
    h({
      flat: [[D - 30, 1000, 3]],
      up10: [[D - 30, 1000, 3], [D - 1, 1100, 3]],
      up30: [[D - 30, 1000, 3], [D, 1300, 2]],
      oneStore: [[D - 30, 1000, 1], [D, 1300, 1]],
      misfiled: [[D - 30, 1000, 3], [D, 2000, 3]],
      down: [[D - 30, 1000, 3], [D, 900, 3]],
      tiny: [[D - 30, 10000, 3], [D, 10050, 3]],
      soldOut: [[D - 30, 1000, 3], [D, null, 0]],
    }),
    "US",
  )!;
  assert.deepEqual(c.rows.map((r) => r.slug), ["up30", "up10"]);
  assert.equal(c.rows[0].pct, 30);
  assert.equal(hotName(c.rows.length), "Hot 2");
});

test("last week's place is worked out the same way seven days earlier", () => {
  const c = hotChart(
    h({
      a: [[D - 20, 1000, 3], [D - 8, 1300, 3], [D, 1400, 3]],
      b: [[D - 20, 1000, 3], [D - 9, 1100, 3], [D, 1600, 3]],
      c: [[D - 20, 1000, 3], [D - 1, 1050, 3]],
    }),
    "US",
  )!;
  assert.deepEqual(c.rows.map((r) => [r.slug, r.lastRank]), [["b", 2], ["a", 1], ["c", null]]);
  assert.equal(hotMove(c.rows[0], c.lastWeekSize), "▲1");
  assert.equal(hotMove(c.rows[1], c.lastWeekSize), "▼1");
  assert.equal(hotMove(c.rows[2], c.lastWeekSize), "New");
  assert.equal(c.through, new Date(D * 86_400_000).toISOString().slice(0, 10));
});

test("no week of history, no chart; caps at 100", () => {
  assert.equal(hotChart({ v: 1, since: D - 3, through: D, series: {} }, "US"), null);
  const many = Object.fromEntries(Array.from({ length: 150 }, (_, i) => [`p${i}`, [[D - 10, 1000, 3], [D, 1020 + i, 3]] as [number, number, number][]]));
  assert.equal(hotChart(h(many), "US")!.rows.length, 100);
});

test("the page and its share card read the same chart (only lib/og/hot100-card.tsx fetches, for photos)", () => {
  for (const f of ["src/app/[region]/hot-100/page.tsx", "src/app/og/hot-100/[region]/route.tsx"]) {
    const src = fs.readFileSync(f, "utf8");
    assert.match(src, /const history = readPriceHistory\(\);/);
    assert.match(src, /hotChart\(history, r\.market\)/);
    assert.match(src, /hotDrops\(history, r\.market/);
    assert.doesNotMatch(src, /fetch\(/);
  }
});

test("the Hot 100 share card asks for small photos and draws only PNG or JPEG", async () => {
  const { thumbUrl, photoData } = await import("../src/lib/og/hot100-card");
  assert.equal(thumbUrl("https://tcgplayer-cdn.tcgplayer.com/product/243657_in_1000x1000.jpg"), "https://tcgplayer-cdn.tcgplayer.com/product/243657_200w.jpg");
  assert.equal(thumbUrl("https://cdn.shopify.com/s/files/1/x.png?v=1"), "https://cdn.shopify.com/s/files/1/x.png?v=1&width=300");
  assert.equal(await photoData(null), null);
  assert.equal(await photoData("http://example.com/x.jpg"), null);
  assert.equal(await photoData("data:image/webp;base64,AAAA"), null);
  assert.equal(await photoData("data:image/png;base64,AAAA"), "data:image/png;base64,AAAA");
});

test("the biggest drops: the same week and rules mirrored, biggest fall first (owner, 2026-11-20)", async () => {
  const { hotDrops } = await import("../src/lib/hot100");
  const d = hotDrops(
    h({
      up: [[D - 30, 1000, 3], [D, 1300, 3]],
      down10: [[D - 30, 1000, 3], [D - 1, 900, 3]],
      down30: [[D - 30, 1000, 3], [D, 700, 2]],
      oneStore: [[D - 30, 1000, 1], [D, 700, 1]],
      misfiled: [[D - 30, 2000, 3], [D, 900, 3]],
      tiny: [[D - 30, 10000, 3], [D, 9950, 3]],
      soldOut: [[D - 30, 1000, 3], [D, null, 0]],
    }),
    "US",
  );
  assert.deepEqual(d.map((r) => [r.slug, r.rank, r.pct]), [["down30", 1, -30], ["down10", 2, -10]]);
  assert.deepEqual(hotDrops({ v: 1, since: D - 3, through: D, series: {} }, "US"), []);
});

test("the region home's Most popular shelf links the region's Hot 100 as words at its foot (merch, 2026-11-27), never from the hero", () => {
  const page = fs.readFileSync(new URL("../src/app/[region]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /more=\{\{ href: `\/\$\{r\.region\}\/hot-100`/, "Most popular links /<region>/hot-100");
  assert.match(page, /label: "This week's Hot 100"/);
  const hero = fs.readFileSync(new URL("../src/components/home/Hero.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(hero, /hot-100/, "the hero stays words, search and ways in");
});
