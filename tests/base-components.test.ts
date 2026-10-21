// The growth release's shared components (the base commit's contracts): ProductGrid's `tiles`, ProductRail, Icon, Section's id and
// Empty's actions. Rendered on the server as a crawler sees them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProductCardData } from "../src/lib/data";
import { Icon, ICON_NAMES } from "../src/components/Icon";
import { ProductGrid as FromCard } from "../src/components/ProductCard";
import { ProductGrid } from "../src/components/ProductGrid";
import { ProductRail } from "../src/components/ProductRail";
import { Empty, Section } from "../src/components/Section";

// The components are compiled with the classic JSX runtime here (tsconfig "jsx": "preserve"; Next uses its own).
(globalThis as unknown as { React: typeof React }).React = React;

const card = (i: number): ProductCardData => ({
  slug: `p-${i}`,
  name: `Product ${i}`,
  productType: "Booster Box",
  setCode: "me4",
  imageUrl: null,
  lowestPriceCents: 20000 + i,
  inStockStores: 2,
  listedStores: 2,
  marketplaceOpen: false,
  medianOpenCents: null,
  releaseDate: "2026-05-22",
});
const cards = (n: number) => Array.from({ length: n }, (_, i) => card(i));
/** A grid's reserved in-feed cell (EbayStrip.tsx EbayFeedTile before its listing is known): invisible, the height of its row. */
const FEED_CELL = /<div aria-hidden="true" class="invisible(?: md:hidden)?"><\/div>/g;
/** …and one that shows on a phone only (a grid too short for a tile from md up, where it is a whole row tall beside 2-3 cards). */
const PHONE_ONLY = /<div aria-hidden="true" class="invisible md:hidden"><\/div>/g;

test("ProductGrid moved to its own file; ProductCard.tsx re-exports it", () => {
  assert.equal(FromCard, ProductGrid);
  const browse = readFileSync(new URL("../src/components/BrowseGrid.tsx", import.meta.url), "utf8");
  assert.match(browse, /<ProductGrid [^\n]*tiles="browse"/, "the browse grid asks for its tile");
  assert.doesNotMatch(browse, /listingsTile/);
});

test("ProductGrid tiles: every surface gets a tile after products 16 and 32, never within the last eight (24 from md up); no surface, no tile", () => {
  const html = (n: number, tiles?: "browse" | "set" | "type" | "deals") => renderToStaticMarkup(React.createElement(ProductGrid, { products: cards(n), region: "au", tiles }));
  for (const t of ["browse", "set", "type", "deals"] as const) {
    const full = html(48, t);
    assert.equal(full.match(FEED_CELL)?.length, 2, `${t}: 48 products, two tiles`);
    assert.equal(full.match(/href="\/au\/p\/p-\d+"/g)?.length, 48, "every product, once");
    const cells = [...full.matchAll(FEED_CELL)].map((m) => m.index!);
    assert.ok(full.indexOf('href="/au/p/p-15"') < cells[0] && cells[0] < full.indexOf('href="/au/p/p-16"'), `${t}: the first after the 16th`);
    assert.ok(full.indexOf('href="/au/p/p-31"') < cells[1] && cells[1] < full.indexOf('href="/au/p/p-32"'), `${t}: the second after the 32nd`);
    assert.equal(full.match(PHONE_ONLY)?.length, 1, `${t}: 48 products, the second tile is phone-only (16 products after it, not 24)`);
    assert.ok(full.search(PHONE_ONLY) === cells[1], "…and it is the second");
    assert.equal(html(24, t).match(FEED_CELL)?.length, 1, `${t}: 24 products, one`);
    assert.equal(html(24, t).match(PHONE_ONLY)?.length, 1, `${t}: 24 products, phone only`);
    assert.equal(html(56, t).match(FEED_CELL)?.length, 2, `${t}: 56 products, two`);
    assert.equal(html(56, t).match(PHONE_ONLY), null, `${t}: 56 products, both on every screen`);
    assert.equal(html(20, t).match(FEED_CELL), null, `${t}: 20 products, none (never within the last eight)`);
    assert.doesNotMatch(full, /data-ad|ebayimg|\/itm\//, "the server HTML holds no listing and no unit, only the reserved cells");
  }
  assert.equal(html(48).match(FEED_CELL), null, "no surface: no tile");
  // with a strip after product 4, the first tile is still after product 16: 12 products below the strip
  const withStrip = renderToStaticMarkup(React.createElement(ProductGrid, { products: cards(48), region: "au", tiles: "set", strip: React.createElement("p", null, "STRIP") }));
  const strip = withStrip.indexOf("STRIP");
  assert.ok(withStrip.indexOf('href="/au/p/p-3"') < strip && strip < withStrip.indexOf('href="/au/p/p-4"'), "the strip after the 4th product");
  assert.ok(strip < withStrip.search(FEED_CELL));
  assert.equal(withStrip.match(FEED_CELL)?.length, 2);
});

test("ProductRail: one scrolling row on a phone, a grid from sm, every card a link, and never an ad unit", () => {
  const html = renderToStaticMarkup(React.createElement(ProductRail, { products: cards(8), region: "uk", label: "In stock instead" }));
  assert.match(html, /^<ul role="list" aria-label="In stock instead" class="scroller [^"]*sm:grid /);
  assert.equal(html.match(/<li /g)?.length, 8);
  assert.equal(html.match(/href="\/uk\/p\/p-\d+"/g)?.length, 8);
  assert.doesNotMatch(html, /data-ad|ebay|tcgplayer/i);
  assert.match(html, /-mx-4 px-4/, "bleeds to the screen edge by default");
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(ProductRail, { products: cards(4), region: "uk", bleed: false })), /-mx-4/);
  assert.equal(renderToStaticMarkup(React.createElement(ProductRail, { products: [], region: "uk" })), "", "nothing to show: nothing rendered");
});

test("Icon: the twelve names, inline SVG in currentColor, decorative unless titled", () => {
  assert.deepEqual([...ICON_NAMES].sort(), ["arrow-right", "calendar", "check", "clock", "close", "info", "menu", "search", "share", "store", "tag", "truck"]);
  for (const name of ICON_NAMES) {
    const svg = renderToStaticMarkup(React.createElement(Icon, { name }));
    assert.match(svg, /^<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"/, name);
    assert.match(svg, /aria-hidden="true"/, name);
    assert.match(svg, /<(path|circle|rect) /, name);
  }
  const titled = renderToStaticMarkup(React.createElement(Icon, { name: "share", title: "Share", size: 16 }));
  assert.match(titled, /role="img" aria-label="Share"/);
  assert.match(titled, /<title>Share<\/title>/);
  assert.doesNotMatch(titled, /aria-hidden/);
});

test("Section takes an id (an in-page anchor); Empty takes actions (internal links), and without them is unchanged", () => {
  assert.match(renderToStaticMarkup(React.createElement(Section, { id: "prices", title: "Prices", children: "x" })), /^<section id="prices" class="mt-14">/);
  assert.match(renderToStaticMarkup(React.createElement(Section, { title: "Prices", children: "x" })), /^<section class="mt-14">/);
  const empty = renderToStaticMarkup(
    React.createElement(Empty, { actions: [{ href: "/au/type/booster-boxes", label: "All booster boxes" }, { href: "/nz", label: "New Zealand" }], children: "Nothing in stock right now." }),
  );
  assert.match(empty, /Nothing in stock right now\./);
  assert.match(empty, /<a class="chip min-h-10" href="\/au\/type\/booster-boxes">All booster boxes<\/a>/);
  assert.match(empty, /href="\/nz">New Zealand<\/a>/);
  assert.equal(renderToStaticMarkup(React.createElement(Empty, { children: "Nothing." })), '<div class="card px-6 py-10 text-center text-muted">Nothing.</div>');
});
