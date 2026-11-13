// The Black Friday page (lib/black-friday.ts, src/app/[region]/black-friday): the right dates, honest words, real data only, in the
// nav while in season and in the sitemap always.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { findBannedCopy } from "../src/lib/copy-rules";
import { bfCopy, blackFriday, cyberMonday, inSeason, seasonYear } from "../src/lib/black-friday";
import { headerNavItems, HEADER_NAV } from "../src/components/Header";
import { dealsMenuColumns } from "../src/components/ShopMenu";
import { REGION_LIST, REGIONS } from "../src/lib/regions";

(globalThis as unknown as { React: typeof React }).React = React;

test("dates: Black Friday is the day after the fourth Thursday of November; Cyber Monday three days later", () => {
  assert.equal(blackFriday(2026), "2026-11-27");
  assert.equal(cyberMonday(2026), "2026-11-30");
  assert.equal(blackFriday(2025), "2025-11-28");
  assert.equal(blackFriday(2027), "2027-11-26");
  assert.equal(seasonYear("2026-10-22"), 2026);
  assert.equal(seasonYear("2026-12-20"), 2027);
  assert.equal(inSeason("2026-10-22"), false);
  assert.equal(inSeason("2026-11-02"), true);
  assert.equal(inSeason("2026-12-20"), false);
  assert.equal(inSeason("2026-07-01"), false);
});

test("in season the two sale pages lead the Deals menu; the header's row stays four sections all year", () => {
  // Black Friday was an entry of its own in the row (after Deals) until 2026-11-13: the row had outgrown the page's column. Both
  // sale pages were in the sidebar, which is gone, so the menu carries both: every page, the region-less ones included, still
  // links them. The strip under the header (HolidayStrip) and the footer link them on every region page too.
  const first = (today: string) => dealsMenuColumns("us", today)[0].links.map((l) => l.label);
  assert.deepEqual(first("2026-11-10").slice(0, 3), ["Black Friday", "Cyber Monday", "Today's deals"]);
  assert.equal(dealsMenuColumns("us", "2026-11-10")[0].links[0].href, "/us/black-friday");
  assert.equal(dealsMenuColumns("us", "2026-11-10")[0].links[1].href, "/us/cyber-monday");
  assert.deepEqual(first("2026-11-29").slice(0, 3), ["Cyber Monday", "Black Friday", "Today's deals"], "Cyber Monday's leads from the Sunday after Black Friday");
  assert.equal(dealsMenuColumns("au", "2026-11-29")[0].links[0].href, "/au/cyber-monday");
  assert.equal(first("2026-07-01")[0], "Today's deals", "out of season: no sale link");
  assert.equal(first("2026-10-22")[0], "Today's deals", "the season starts on 1 November");
  for (const today of ["2026-11-10", "2026-11-29", "2026-07-01"]) {
    assert.deepEqual(headerNavItems("us", today).map((n) => n.label), HEADER_NAV.map((n) => n.label), today);
  }
  assert.deepEqual(HEADER_NAV.map((n) => n.label), ["Deals", "All sealed", "Sets", "Guides"]);
  // the sale pages light "Deals" in the row
  const deals = headerNavItems("us", "2026-11-13")[0];
  assert.ok(deals.also?.includes("/us/black-friday") && deals.also?.includes("/us/cyber-monday"));
});

test("the copy never claims a sale, a former price or urgency", () => {
  for (const r of REGION_LIST) {
    const t = `${bfCopy.title(r, 2026)} ${bfCopy.h1(r)} ${bfCopy.description(r, 12, 31)} ${bfCopy.description(r, 0, null)}`;
    assert.equal(findBannedCopy(t), null, t);
    assert.doesNotMatch(t, /ends|hurry|only \d|countdown|was /i);
  }
});

test("the page renders from real data: parseable JSON-LD, no banned copy, the region's own currency", async () => {
  process.env.PUBLIC_DATA_MODE = "files";
  const R = require("react") as { cache?: unknown };
  if (typeof R.cache !== "function") R.cache = (fn: unknown) => fn;
  const { default: Page } = await import("../src/app/[region]/black-friday/page");
  for (const region of ["au", "us"] as const) {
    const html = renderToStaticMarkup(await Page({ params: { region } }));
    const text = html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'");
    assert.equal(findBannedCopy(text), null, `${region}: "${findBannedCopy(text)}"`);
    assert.match(text, /Black Friday is 27 November 2026|Black Friday weekend|Black Friday 2026 was/);
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => JSON.parse(m[1]));
    if (region === "au") assert.match(text, /A\$/);
    assert.match(html, new RegExp(`href="/${region}/cheapest-packs"`));
  }
  assert.ok(REGIONS.au);
});


test("the strip shows Black Friday from 1 November, then Cyber Monday, then nothing", async () => {
  const { saleStrip } = await import("../src/lib/black-friday");
  assert.equal(saleStrip("2026-10-31"), null);
  assert.equal(saleStrip("2026-11-01")?.key, "blackFriday");
  assert.equal(saleStrip("2026-11-28")?.key, "blackFriday");
  assert.equal(saleStrip("2026-11-29")?.key, "cyberMonday");
  assert.equal(saleStrip("2026-12-01")?.key, "cyberMonday");
  assert.equal(saleStrip("2026-12-02"), null);
});
