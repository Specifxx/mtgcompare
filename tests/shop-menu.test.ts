// The desktop "All sealed" dropdown (components/ShopMenu.tsx): category-first links, all to pages that exist, in the header's HTML.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { Header } from "../src/components/Header";
import { shopMenuColumns } from "../src/components/ShopMenu";
import { TYPE_BY_SLUG } from "../src/lib/sealed-title";
import { SET_BY_SLUG } from "../src/lib/sets";

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
  assert.match(nav, /<div class="group relative"><a [^>]*href="\/uk\/sealed"[^>]*>All sealed<\/a>/);
  assert.match(nav, /data-menu="shop"/);
  assert.match(nav, /href="\/uk\/type\/play-booster-boxes"[^>]*>Play booster boxes<\/a>/);
  assert.match(nav, /group-focus-within:visible/, "opens for keyboard focus too");
});
