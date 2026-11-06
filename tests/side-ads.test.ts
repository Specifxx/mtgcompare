// The side rails (components/SideAds.tsx, ported from DexCompare 2026-11-06: eBay down the far left, TCGplayer down the far right).
// Pinned: browser-only from 1280px (nothing in the server HTML, no layout shift), ten tiles that scroll, the placements, no Amazon.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PLACEMENTS } from "../src/lib/affiliate";
import { MAX_TILES, MIN_WIDTH, TILE_H, mergeListings, railFits } from "../src/components/SideAds";

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");

test("side rails: wide screens only, the same width in the hook and the class, drawn in the browser after a matchMedia check", () => {
  assert.equal(MIN_WIDTH, 1280, "every regular 16:9 and 16:10 screen (owner, 2026-11-06)");
  assert.match(src("app/globals.css"), /max-width: min\(1480px, calc\(100vw - 320px\)\)/, "the shell leaves the rails their room");
  const s = src("components/SideAds.tsx");
  assert.match(s, /^"use client";/, "a client component");
  assert.match(s, /min-\[1280px\]:flex/, "the CSS gate says the same width");
  assert.match(s, /window\.matchMedia\(`\(min-width: \$\{MIN_WIDTH\}px\)`\)/, "mounted only when the viewport fits");
  assert.match(s, /const \[fit, setFit\] = useState\(false\);[\s\S]*if \(!fit\) return null;/, "nothing is rendered before the check or when nothing fits (no SSR markup)");
  assert.match(s, /"fixed z-30 hidden flex-col/, "fixed beside the shell: takes no space, below the header (z-40) and the quick view (z-50)");
  for (const p of ["listings-side", "tcgplayer-strip-side"]) assert.ok((PLACEMENTS as readonly string[]).includes(p), `${p} is a placement`);
  assert.match(s, /useListings\(\{ region, context: "sealed", placement, min: 1, eager: true \}\)/, "the eBay rail shares the home strip's sealed request");
  assert.match(s, />Ad<\/span>/, "labelled Ad");
  assert.match(s, /rel=\{REL_SPONSORED\}/, "sponsored links");
  assert.doesNotMatch(s, /amazon/i, "no Amazon in a rail");
});

test("side rails: up to ten tiles that scroll inside the rail, popular sealed first, no listing twice", () => {
  assert.equal(MAX_TILES, 10);
  assert.ok(!railFits(300), "too short for one whole tile: no rail");
  assert.ok(railFits(720), "a 1280×720 window has rails");
  assert.ok(TILE_H > 160 && TILE_H < 240, `a tile is ${TILE_H}px tall`);
  assert.match(src("components/SideAds.tsx"), /overflow-y-auto/, "the list scrolls");
  const item = (id: string) => ({ id }) as never;
  const ready = (ids: string[]) => ({ status: "ready", a: { items: ids.map(item) } }) as never;
  const merged = mergeListings([ready(["a", "b", "c", "d", "e", "f", "g", "h"]), ready(["c", "i", "j", "k", "l"]), { status: "none" } as never]);
  assert.deepEqual(merged.map((i: { id: string }) => i.id), ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]);
});

test("the region layout mounts the rails once, after the footer; the server HTML of a page never holds them", () => {
  const layout = src("app/[region]/layout.tsx");
  assert.match(layout, /<Footer region=\{r\.region\}( listed=\{listed\})? \/>\s*\{\/\*[\s\S]*?\*\/\}\s*<SideAds region=\{r\.region\} tiles=\{tcg\} \/>/, "after the footer, the pre-footer strip's tiles");
  assert.equal(layout.match(/<SideAds /g)?.length, 1);
});
