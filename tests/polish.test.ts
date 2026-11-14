// The polish pass of 2026-11-14 (DECISIONS.md): faults a first-time visitor meets, fixed in the shared styles and components. Each
// test pins the fault's cause, so it cannot come back unnoticed. Nothing here touches a paid row, an ad block, a URL or metadata.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { Footer, footerColumns } from "../src/components/Footer";
import { ShopMenuPanel } from "../src/components/HeaderNav";
import { MenuSheet } from "../src/components/MobileMenu";
import { Section } from "../src/components/Section";
import { ThemeToggle } from "../src/components/ThemeToggle";
import { navGroups } from "../src/lib/nav";

(globalThis as unknown as { React: typeof React }).React = React;

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");
const css = src("app/globals.css");

function render(el: React.ReactElement): string {
  const router = { push() {}, replace() {}, refresh() {}, prefetch() {}, back() {}, forward() {} };
  const err = console.error;
  console.error = () => {};
  try {
    return renderToStaticMarkup(React.createElement(AppRouterContext.Provider, { value: router as never }, el));
  } finally {
    console.error = err;
  }
}

/** One rule's body, by its exact selector at the start of a line. */
function rule(selector: string): string {
  const at = css.indexOf(`\n${selector} {`);
  assert.ok(at >= 0, `${selector} is in globals.css`);
  return css.slice(at, css.indexOf("}", at));
}

test("no page is wider than its window: the widest header dropdown stays inside it below xl", () => {
  // Four columns are 46rem (736px) and hang from the third nav item, whose left edge is 382px from the window's at 1024-1247px wide:
  // 382 + 736 = 1118px, and a closed panel is only `invisible`, so every page scrolled sideways from 1024px to 1117px.
  const wide = render(React.createElement(ShopMenuPanel, { columns: ["a", "b", "c", "d"].map((title) => ({ title, links: [{ href: `/us/${title}`, label: title }] })), kind: "sets" }));
  assert.match(wide, /class="grid max-w-\[calc\(100vw-2rem\)\] [^"]*\bw-\[46rem\] lg:max-xl:-ml-40\b/);
  const shift = 160; // -ml-40
  assert.ok(382 + 736 - shift <= 1024 - 16, "inside a 1024px window, with a margin");
  assert.ok(382 - shift >= 0, "and not off its left edge");
  // The narrower panels fit as they are (279 + 640 = 919px): no shift.
  const three = render(React.createElement(ShopMenuPanel, { columns: ["a", "b", "c"].map((title) => ({ title, links: [{ href: `/us/${title}`, label: title }] })) }));
  assert.doesNotMatch(three, /-ml-/);
});

test("the focus ring keeps a button's own shape", () => {
  // The rule is outside the layers: a radius in it out-ranks every rounded-* class, so a round button turned square on focus.
  const ring = rule(":focus-visible");
  assert.match(ring, /outline: 2px solid rgb\(var\(--brand\)\)/);
  assert.doesNotMatch(ring, /border-radius/);
  assert.match(css, /\n:where\(a, summary\):focus-visible \{\s*border-radius: 6px;/, "a bare link's soft corners weigh nothing");
});

test("a chip answers a press, not under reduced motion, and the buttons paid rows share are as they were", () => {
  assert.match(css, /\.chip \{\s*@apply [^;]*\bactive:scale-\[0\.97\]/);
  const reduce = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduce, /\.chip:active \{\s*transform: none;/);
  // Every .btn-* is a paid row's button somewhere (eBay's, TCGplayer's, Amazon's): their rule is the one on main, to the letter.
  assert.match(css, /\.btn \{\s*@apply inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50;\s*\}/);
});

test("the footer: a wrapped link keeps its distance, and the guides have a row of their own", () => {
  const html = render(React.createElement(Footer, { region: "us" }));
  // Twenty sentence-long titles were one of four narrow columns: a ribbon 1,000px tall on a phone and 1,500px on a desktop.
  assert.match(html, /<nav aria-label="Footer: Guides" class="col-span-2 sm:col-span-4"><h2 class="eyebrow mb-2">Guides<\/h2><ul class="gap-x-6 text-sm sm:columns-2 lg:columns-3">/);
  assert.match(html, /class="grid grid-cols-2 gap-x-6 gap-y-8 grid-flow-row-dense sm:grid-cols-4"/, "the short column after them moves up");
  // The HTML's order is the one footerColumns gives: only the drawing moves.
  const titles = [...html.matchAll(/<nav aria-label="Footer: ([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(titles, footerColumns("us").map((c) => c.title));
  const links = [...html.matchAll(/<li class="break-inside-avoid"><a class="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(links.length > 40);
  for (const c of links) assert.equal(c, "flex min-h-10 items-center py-1.5 leading-5 text-muted transition-colors hover:text-ink sm:min-h-8");
  // 20px of text and 6px above and below: a one-line link is still exactly 32px from sm, and 40px on a phone.
  assert.equal(20 + 2 * 6, 32);
});

test("the phone menu's title is never cut: the name, then the region's flag and code", () => {
  const sheet = render(React.createElement(MenuSheet, { region: "uk", groups: navGroups("uk", "2026-10-28"), pathname: "/uk", onClose() {} }));
  assert.match(sheet, /<span class="truncate">MTG Compare<\/span><span class="shrink-0 [^"]*" title="United Kingdom">/);
  assert.match(sheet, /UK<span class="sr-only"> \(United Kingdom\)<\/span>/, "the whole name is still read out");
  assert.doesNotMatch(sheet, /MTG Compare United Kingdom/);
});

test("small targets: the theme switch, a section's link and the hero's pill are 40px", () => {
  assert.match(render(React.createElement(ThemeToggle)), /class="chip min-h-10 shrink-0 cursor-pointer px-2\.5 lg:min-h-9 "/);
  const section = render(React.createElement(Section, { title: "Latest sets", href: "/us/sets", linkLabel: "All sets", children: null }));
  // The negative margin keeps the words on the heading's line: only the target grows.
  assert.match(section, /<a class="-my-2\.5 inline-flex min-h-10 shrink-0 items-center [^"]*" href="\/us\/sets">All sets →<\/a>/);
  assert.match(css, /\.hero-pill \{\s*@apply [^;]*\bmin-h-10\b/);
});

test("the theme a visitor chose holds on a page React draws whole (a 404 under a region)", () => {
  const toggle = src("components/ThemeToggle.tsx");
  assert.match(toggle, /if \(root\.hasAttribute\("data-theme"\)\) return;/, "only when the boot script did not run");
  assert.match(toggle, /root\.setAttribute\("data-theme", themeFrom\(saved\)\)/);
});

test("a phone's search box takes the room beside it while the visitor types", () => {
  assert.match(css, /@media \(max-width: 639\.98px\) \{[^@]*\.hdr-search:focus-within ~ button\.chip,\s*\.hdr-search:focus-within ~ details \{\s*display: none;/);
  // What it hides are the theme switch (a .chip button) and the region switcher (a <details>), which follow the box in the header.
  const header = src("components/Header.tsx");
  assert.ok(header.indexOf('className="hdr-search') < header.indexOf("<ThemeToggle />"));
  assert.ok(header.indexOf("<ThemeToggle />") < header.indexOf("<RegionSwitcher"));
  assert.match(src("components/RegionSwitcher.tsx"), /<details ref=\{ref\} className="relative shrink-0">/);
});

test("a product's name: three lines on a phone's two-column grid, two from sm", () => {
  assert.match(css, /\.pc-name \{\s*@apply line-clamp-3 [^;]*\bsm:line-clamp-2;/);
});

test("the search that finds nothing says what was searched and what to try", () => {
  const grid = src("components/BrowseGrid.tsx");
  assert.match(grid, /No sealed product matches &ldquo;\{q\.trim\(\)\}&rdquo;\./);
  assert.match(grid, /Check the spelling, or try just the set’s name or the product type/);
  // The marketplaces' box under it is the same component with the same placement.
  assert.match(grid, /\{elsewhere && <MarketplaceSearch region=\{region\} query=\{elsewhere\} placement="browse-empty" \/>\}/);
});

test("the region home's facts line never ends a row on a dot", () => {
  const home = src("app/[region]/page.tsx");
  assert.match(home, /<span aria-hidden="true" className="max-\[479px\]:hidden">\s*·\s*<\/span>\s*<span className="max-\[479px\]:basis-full">checked/);
});
