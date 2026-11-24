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

test("ProductGrid on a listing: one continuous list, the sort and filter bar, no ad cell inside, the strip under it (owner, 2026-11-23)", () => {
  const html = (n: number, tiles?: "browse" | "set" | "type" | "deals") => renderToStaticMarkup(React.createElement(ProductGrid, { products: cards(n), region: "au", tiles }));
  for (const t of ["browse", "set", "type", "deals"] as const) {
    const full = html(48, t);
    assert.equal(full.match(FEED_CELL), null, `${t}: no sponsored cell among the products`);
    assert.equal(full.match(/href="\/au\/p\/p-\d+"/g)?.length, 48, "every product, once");
    assert.match(full, /aria-label="Sort and filter"/, `${t}: the sort and filter bar`);
    assert.match(full, /data-gp=/, "each card carries its facts for the bar");
  }
  assert.doesNotMatch(html(48), /aria-label="Sort and filter"/, "no surface (a shelf): no bar");
  const withStrip = renderToStaticMarkup(React.createElement(ProductGrid, { products: cards(48), region: "au", tiles: "set", strip: React.createElement("p", null, "STRIP") }));
  assert.ok(withStrip.indexOf("STRIP") > withStrip.indexOf('href="/au/p/p-47"'), "the strip under the last product");
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
  // More air between a page's blocks (the minimal look, 2026-11-13: 64px, 80px from sm; it was 56px).
  assert.match(renderToStaticMarkup(React.createElement(Section, { id: "prices", title: "Prices", children: "x" })), /^<section id="prices" class="mt-16 sm:mt-20">/);
  assert.match(renderToStaticMarkup(React.createElement(Section, { title: "Prices", children: "x" })), /^<section class="mt-16 sm:mt-20">/);
  // A page that sets its own distance (the first block under a hero sits closer) passes the whole class.
  assert.match(renderToStaticMarkup(React.createElement(Section, { title: "Prices", className: "reveal mt-8 sm:mt-12", children: "x" })), /^<section class="reveal mt-8 sm:mt-12">/);
  const empty = renderToStaticMarkup(
    React.createElement(Empty, { actions: [{ href: "/au/type/play-booster-boxes", label: "All booster boxes" }, { href: "/nz", label: "New Zealand" }], children: "Nothing in stock right now." }),
  );
  assert.match(empty, /Nothing in stock right now\./);
  assert.match(empty, /<a class="chip min-h-10" href="\/au\/type\/play-booster-boxes">All booster boxes<\/a>/);
  assert.match(empty, /href="\/nz">New Zealand<\/a>/);
  assert.equal(renderToStaticMarkup(React.createElement(Empty, { children: "Nothing." })), '<div class="card px-6 py-10 text-center text-muted">Nothing.</div>');
});
