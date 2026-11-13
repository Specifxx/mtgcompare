// The desktop "All sealed" dropdown (components/ShopMenu.tsx): category-first links, all to pages that exist, in the header's HTML.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { Header, headerNavItems } from "../src/components/Header";
import { dealsMenuColumns, guidesMenuColumns, setsMenuColumns, shopMenuColumns } from "../src/components/ShopMenu";
import { TYPE_BY_SLUG } from "../src/lib/sealed-title";
import { SET_BY_SLUG, SETS } from "../src/lib/sets";
import { menuSets } from "../src/lib/release";
import { navGroups } from "../src/lib/nav";

(globalThis as unknown as { React: typeof React }).React = React;
const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} };
const render = (el: React.ReactElement) => renderToStaticMarkup(React.createElement(AppRouterContext.Provider, { value: router as never }, el));

test("shop menu: by product, by set, by value; every link is a real region path", () => {
  const cols = shopMenuColumns("au", "2026-10-28");
  assert.deepEqual(cols.map((c) => c.title), ["By product", "By set", "By value"]);
  for (const l of cols.flatMap((c) => c.links)) {
    assert.match(l.href, /^\/au\//, l.href);
    const type = /^\/au\/type\/([^/]+)$/.exec(l.href)?.[1];
    if (type) assert.ok(TYPE_BY_SLUG.has(type), `type page ${type}`);
    const set = /^\/au\/sets\/([^/]+)$/.exec(l.href)?.[1];
    if (set) assert.ok(SET_BY_SLUG.has(set), `set page ${set}`);
  }
});

test("shop menu: the newest released set leads; a pre-order is labelled, never first", () => {
  const sets = shopMenuColumns("us", "2026-10-28")[1].links;
  assert.equal(sets[0].label, "Reality Fracture");
  assert.ok(sets.some((s) => s.label === "Star Trek (pre-order)"));
  assert.equal(sets.at(-1)!.href, "/us/sets");
  const after = shopMenuColumns("us", "2026-11-20")[1].links;
  assert.equal(after[0].label, "Star Trek");
});

test("header: the dropdown sits with All sealed inside the desktop nav, as plain links", () => {
  const html = render(React.createElement(Header, { region: "uk" }));
  const nav = /<nav class="hidden items-center gap-0\.5 lg:flex" aria-label="Main">([\s\S]*?)<\/nav>/.exec(html)?.[1] ?? "";
  assert.match(nav, /<div class="group relative" data-open="false"><a [^>]*href="\/uk\/sealed"[^>]*>All sealed<\/a><button type="button" data-nav-trigger="true" aria-label="All sealed menu" aria-haspopup="true" aria-expanded="false"/);
  assert.match(nav, /data-menu="shop"/);
  assert.match(nav, /href="\/uk\/type\/play-booster-boxes"[^>]*>Play booster boxes<\/a>/);
  assert.match(nav, /data-nav-panel="true" class="[^"]*invisible/, "closed panels stay in the HTML, hidden until opened by hover, click or keyboard");
});

test("menus skip a set no store lists yet: its set page is a 404, so the link was dead site-wide (2026-11-03)", () => {
  const all = shopMenuColumns("us", "2026-11-03");
  const listed = new Set(SETS.slice(1, 12).map((s) => s.code)); // everything but the newest set
  const some = shopMenuColumns("us", "2026-11-03", listed);
  const hrefs = (cols: ReturnType<typeof shopMenuColumns>) => cols.flatMap((c) => c.links.map((l) => l.href));
  assert.ok(hrefs(all).includes(`/us/sets/${SETS[0].slug}`), "without a listing set, every set is eligible");
  assert.ok(!hrefs(some).includes(`/us/sets/${SETS[0].slug}`), "the unlisted set is not linked");
  assert.ok(hrefs(some).includes(`/us/sets/${SETS[1].slug}`), "the next listed set takes its place");
  assert.deepEqual(menuSets(3, "2026-11-03", new Set()), [], "nothing listed, nothing linked");
});

test("sets menu: one column per series (the era), newest sets under it, heading and footer to the series' block on /sets; unlisted sets skipped", () => {
  const cols = setsMenuColumns("us", "2026-11-03");
  assert.ok(cols.length >= 3 && cols.length <= 4);
  for (const c of cols) {
    assert.match(c.href!, /^\/us\/sets#[a-z0-9-]+$/, c.title);
    assert.equal(c.links.at(-1)!.href, c.href, "the footer link is the series block");
    for (const l of c.links.slice(0, -1)) assert.ok(SET_BY_SLUG.has(/^\/us\/sets\/([^/]+)$/.exec(l.href)![1]), l.href);
  }
  const listed = new Set(SETS.slice(1, 12).map((s) => s.code));
  const some = setsMenuColumns("us", "2026-11-03", listed).flatMap((c) => c.links.map((l) => l.href));
  assert.ok(!some.includes(`/us/sets/${SETS[0].slug}`), "the unlisted set is not linked");
  const html = render(React.createElement(Header, { region: "uk" }));
  const nav = /<nav class="hidden items-center gap-0\.5 lg:flex" aria-label="Main">([\s\S]*?)<\/nav>/.exec(html)?.[1] ?? "";
  assert.match(nav, /<div class="group relative" data-open="false"><a [^>]*href="\/uk\/sets"[^>]*>Sets<\/a>/);
  assert.match(nav, /data-menu="sets"/);
});

test("the header's menus link everything the phone menu lists: no set or section lost its link from every page when the sidebar went (2026-11-13)", () => {
  for (const [region, today] of [["us", "2026-11-13"], ["au", "2026-10-28"], ["uk", "2027-02-10"]] as const) {
    const inMenus = new Set(headerNavItems(region, today).flatMap((n) => [n.href, ...(n.menu ?? []).flatMap((c) => [...(c.href ? [c.href] : []), ...c.links.map((l) => l.href)])]));
    const sets = navGroups(region, today).find((g) => g.title === "Sets")!.links.map((l) => l.href);
    assert.ok(sets.filter((h) => /\/sets\/[^/]+$/.test(h)).length === 8, "the phone menu lists eight sets");
    for (const h of sets) assert.ok(inMenus.has(h), `${h} is in a header menu`);
    assert.equal(shopMenuColumns(region, today)[1].links.length, 9, "eight sets and the way to every set");
    // Every other group of the phone menu (the sidebar drew the same list): product types, the series, deals and stock, the rest.
    // By page: a series is a block of the sets page ("/us/sets#standard"), and the menus link that page.
    const pages = new Set([...inMenus].map((h) => h.split("#")[0]));
    for (const g of navGroups(region, today)) for (const l of g.links) assert.ok(pages.has(l.href.split("#")[0]), `${g.title}: ${l.href} is in a header menu`);
  }
});

test("Deals and Guides open mega menus of real links in the HTML (owner, 2026-11-09)", () => {
  const html = render(React.createElement(Header, { region: "au" }));
  const nav = /<nav class="hidden items-center gap-0\.5 lg:flex" aria-label="Main">([\s\S]*?)<\/nav>/.exec(html)?.[1] ?? "";
  for (const h of ["/au/cheapest-packs", "/au/back-in-stock", "/au/price-moves", "/au/releases", "/au/tools", "/blog", "/forum"]) assert.match(nav, new RegExp(`href="${h}"`), h);
  // Stores left the row for the Guides menu on 2026-11-13 (four sections), with the booster box guide the sidebar used to lead with.
  for (const h of ["/au/stores", "/au/guides/mtg-booster-box-prices", "/creators"]) assert.match(nav, new RegExp(`href="${h}"`), h);
  assert.match(nav, /data-menu="deals"/);
  assert.match(nav, /data-menu="guides"/);
  assert.equal((nav.match(/data-nav-trigger/g) ?? []).length, 4, "Deals, All sealed, Sets and Guides carry a menu");
  assert.ok(dealsMenuColumns("au", "2026-11-09").length === 3 && guidesMenuColumns("au").length === 2);
  assert.deepEqual(guidesMenuColumns("au").map((c) => c.title), ["Learn & play", "The data"]);
});

test("NavMenu: hover intent, click toggle, Escape, arrow keys, focus-out and aria, one file for the family", async () => {
  const src = await import("node:fs").then((fs) => fs.readFileSync(new URL("../src/components/NavMenu.tsx", import.meta.url), "utf8"));
  for (const needle of ["OPEN_MS", "CLOSE_MS", 'e.key === "Escape"', "ArrowDown", "aria-expanded", "aria-controls", "pointerdown", "onBlur", "usePathname"]) assert.ok(src.includes(needle), needle);
});
