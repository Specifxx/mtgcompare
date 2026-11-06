// The price watch on the Black Friday and Cyber Monday pages (lib/price-watch.ts, components/HolidaySalePage.tsx): pure
// helpers, honest words, every region's own currency, and the Cyber Monday URL in the sitemap.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { findBannedCopy } from "../src/lib/copy-rules";
import { cmCopy, eventCopy, EVENT_NAMES } from "../src/lib/black-friday";
import { GRADED_SEARCHES, olderShelf } from "../src/lib/price-watch";
import { PLACEMENTS } from "../src/lib/affiliate";
import { REGION_LIST } from "../src/lib/regions";
import { staticSitemap } from "../src/lib/sitemap";
import { SITE_URL } from "../src/lib/site";
import { jsonLdBlocks, validateJsonLd } from "./helpers/jsonld";

(globalThis as unknown as { React: typeof React }).React = React;

const set = (code: string) => ({ code, name: `Set ${code}` }) as unknown as import("../src/lib/sets").MtgSet;

test("olderShelf keeps one product per set, skips empty sets and respects the limit", () => {
  const groups = [
    { set: set("a"), items: ["a1", "a2"] },
    { set: set("b"), items: [] },
    { set: set("c"), items: ["c1"] },
    { set: set("d"), items: ["d1"] },
  ];
  assert.deepEqual(olderShelf(groups, 2).map((r) => [r.set.code, r.item]), [["a", "a1"], ["c", "c1"]]);
  assert.equal(olderShelf([], 5).length, 0);
});

test("graded searches name a grade and the price-watch placement exists", () => {
  for (const g of GRADED_SEARCHES) assert.match(g.query, /PSA|BGS|CGC/, g.label);
  assert.ok((PLACEMENTS as readonly string[]).includes("price-watch"));
});

test("Cyber Monday copy never claims a sale, a former price or urgency", () => {
  assert.equal(eventCopy("cyber-monday"), cmCopy);
  assert.equal(EVENT_NAMES["cyber-monday"], "Cyber Monday");
  for (const r of REGION_LIST) {
    const t = `${cmCopy.title(r, 2026)} ${cmCopy.h1(r)} ${cmCopy.description(r, 12, 31)} ${cmCopy.description(r, 0, null)}`;
    assert.equal(findBannedCopy(t), null, t);
    assert.doesNotMatch(t, /ends|hurry|only \d|countdown|was /i);
    assert.match(t, /Cyber Monday/);
  }
});

test("the Cyber Monday page renders from real data with the price watch, no banned copy, valid JSON-LD", async () => {
  process.env.PUBLIC_DATA_MODE = "files";
  const R = require("react") as { cache?: unknown };
  if (typeof R.cache !== "function") R.cache = (fn: unknown) => fn;
  const { default: Page } = await import("../src/app/[region]/cyber-monday/page");
  for (const region of ["us", "au"] as const) {
    const html = renderToStaticMarkup(await Page({ params: { region } }));
    const text = html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'");
    assert.equal(findBannedCopy(text), null, `${region}: "${findBannedCopy(text)}"`);
    assert.match(html, /id="price-watch"/);
    assert.match(text, /Cyber Monday/);
    assert.match(html, /placement=price-watch|price-watch/);
    assert.match(html, new RegExp(`href="/${region}/black-friday"`));
    const { docs, errors } = jsonLdBlocks(html);
    assert.deepEqual(errors, []);
    for (const d of docs) assert.deepEqual(validateJsonLd(d), []);
    if (region === "au") assert.match(text, /A\$/);
  }
});

test("the sitemap lists Cyber Monday in every region", () => {
  const urls = staticSitemap({}).map((e) => e.url);
  for (const r of REGION_LIST) assert.ok(urls.includes(`${SITE_URL}/${r.region}/cyber-monday`), r.region);
});
