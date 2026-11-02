import { test } from "node:test";
import * as React from "react";
(globalThis as unknown as { React: typeof React }).React = React;
import assert from "node:assert/strict";
import { listRegions, saleDates, saleInSeason, saleIntro, salesInSeason, saleYear, zodiacAnimal, CORE_SALES } from "../src/lib/sale-seasons";

test("event dates", () => {
  assert.deepEqual(saleDates("boxing-day", 2026), { start: "2026-12-26", end: "2026-12-26" });
  assert.deepEqual(saleDates("january-sales", 2027), { start: "2027-01-01", end: "2027-01-31" });
  assert.equal(saleDates("lunar-new-year", 2027)?.start, "2027-02-06");
  assert.equal(saleDates("lunar-new-year", 2028)?.start, "2028-01-26");
  assert.equal(saleDates("lunar-new-year", 2041), null);
  assert.equal(saleDates("valentines-day", 2027)?.start, "2027-02-14");
  assert.equal(zodiacAnimal(2026), "Horse");
  assert.equal(zodiacAnimal(2027), "Goat");
});

test("each page is about the next event, and keeps the last one for a week", () => {
  assert.equal(saleYear("boxing-day", "2026-11-02"), 2026);
  assert.equal(saleYear("boxing-day", "2027-01-02"), 2026);
  assert.equal(saleYear("boxing-day", "2027-01-03"), 2027);
  assert.equal(saleYear("january-sales", "2026-11-02"), 2027);
  assert.equal(saleYear("january-sales", "2027-02-07"), 2027);
  assert.equal(saleYear("january-sales", "2027-02-08"), 2028);
  assert.equal(saleYear("lunar-new-year", "2026-11-02"), 2027);
  assert.equal(saleYear("valentines-day", "2026-11-02"), 2027);
});

test("the homepage links a page only in its run-up", () => {
  assert.equal(saleInSeason("boxing-day", "2026-11-30"), false);
  assert.equal(saleInSeason("boxing-day", "2026-12-01"), true);
  assert.equal(saleInSeason("boxing-day", "2026-12-28"), true);
  assert.equal(saleInSeason("boxing-day", "2026-12-29"), false);
  assert.equal(saleInSeason("january-sales", "2026-12-20"), true);
  assert.equal(saleInSeason("january-sales", "2027-02-03"), false);
  assert.equal(saleInSeason("lunar-new-year", "2027-01-09"), true);
  assert.equal(saleInSeason("lunar-new-year", "2027-01-08"), false);
  assert.deepEqual(salesInSeason(CORE_SALES, "2026-12-24").map((s) => s.slug), ["boxing-day", "january-sales"]);
  assert.deepEqual(salesInSeason(CORE_SALES, "2026-11-02"), []);
});

test("the wording names every region, never one country", () => {
  assert.equal(listRegions(["Australia", "the UK", "the US"]), "Australia, the UK and the US");
  const intro = saleIntro("boxing-day", 2026, "Australia and the UK");
  assert.match(intro, /Saturday 26 December 2026/);
  assert.match(intro, /across Australia and the UK/);
  assert.match(saleIntro("lunar-new-year", 2027, "Singapore"), /Saturday 6 February 2027.*Year of the Goat/);
  for (const s of ["boxing-day", "january-sales", "lunar-new-year", "valentines-day"] as const)
    assert.doesNotMatch(saleIntro(s, 2027, "x"), /\bwas\b|ends soon|limited time/i);
});

test("each region's sale pages render from real data with no banned copy, in the sitemap", async () => {
  const { findBannedCopy } = await import("../src/lib/copy-rules");
  const { saleCopy } = await import("../src/lib/sale-seasons");
  const { REGION_LIST } = await import("../src/lib/regions");
  const { staticSitemap } = await import("../src/lib/sitemap");
  const { SITE_URL } = await import("../src/lib/site");
  for (const r of REGION_LIST)
    for (const s of CORE_SALES) {
      const t = `${saleCopy.title(s, r, 2026)} ${saleCopy.h1(s, r)} ${saleCopy.description(s, r, 12, 31)} ${saleCopy.description(s, r, 0, null)} ${saleIntro(s, 2027, r.inName)}`;
      assert.equal(findBannedCopy(t), null, t);
    }
  process.env.PUBLIC_DATA_MODE = "files";
  const R = require("react") as { cache?: unknown };
  if (typeof R.cache !== "function") R.cache = (fn: unknown) => fn;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { default: Page } = await import("../src/app/[region]/boxing-day/page");
  for (const region of ["au", "us"] as const) {
    const html = renderToStaticMarkup(await Page({ params: { region } }));
    const text = html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'");
    assert.equal(findBannedCopy(text), null, `${region}: "${findBannedCopy(text)}"`);
    assert.match(text, /Boxing Day is Saturday 26 December 2026/);
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => JSON.parse(m[1]));
  }
  const urls = new Set(staticSitemap({}).map((u) => u.url));
  for (const r of REGION_LIST) for (const s of CORE_SALES) assert.ok(urls.has(`${SITE_URL}/${r.region}/${s}`), `${r.region}/${s}`);
});
