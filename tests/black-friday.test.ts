// The Black Friday page (lib/black-friday.ts, src/app/[region]/black-friday): the right dates, honest words, real data only, in the
// nav while in season and in the sitemap always.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { findBannedCopy } from "../src/lib/copy-rules";
import { bfCopy, blackFriday, cyberMonday, inSeason, seasonYear } from "../src/lib/black-friday";
import { headerNav, HEADER_NAV } from "../src/components/Header";
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

test("the nav shows Black Friday after Deals in season only", () => {
  assert.deepEqual(headerNav("2026-11-10").map((n) => n.label).slice(0, 2), ["Deals", "Black Friday"]);
  assert.deepEqual(headerNav("2026-07-01"), HEADER_NAV);
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

