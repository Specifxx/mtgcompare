// Region auto-detect (lib/regions.ts regionFromCountry / regionFromAcceptLanguage, src/app/api/geo, components/HomeRegionGrid.tsx):
// Vercel's country header first, Accept-Language second, nothing for a country we don't compare; never a redirect, and every region
// link stays in the landing page's HTML.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { regionFromAcceptLanguage, regionFromCountry, REGION_LIST } from "../src/lib/regions";
import { GET } from "../src/app/api/geo/route";

(globalThis as unknown as { React: typeof React }).React = React;

test("country → region: the seven markets, the eurozone as eu, nothing elsewhere", () => {
  assert.equal(regionFromCountry("AU"), "au");
  assert.equal(regionFromCountry("nz"), "nz");
  assert.equal(regionFromCountry("US"), "us");
  assert.equal(regionFromCountry("GB"), "uk");
  assert.equal(regionFromCountry("CA"), "ca");
  assert.equal(regionFromCountry("SG"), "sg");
  for (const c of ["DE", "FR", "NL", "IE", "ES", "IT", "AT", "FI"]) assert.equal(regionFromCountry(c), "eu", c);
  for (const c of ["JP", "IN", "SE", "PL", "CH", "", "XX1", null]) assert.equal(regionFromCountry(c as string | null), null, String(c));
});

test("Accept-Language → region only when a tag names a country we compare", () => {
  assert.equal(regionFromAcceptLanguage("en-AU,en;q=0.9"), "au");
  assert.equal(regionFromAcceptLanguage("en,en-GB;q=0.8"), "uk");
  assert.equal(regionFromAcceptLanguage("de-DE,de;q=0.9"), "eu");
  assert.equal(regionFromAcceptLanguage("en"), null, "a bare language names no country");
  assert.equal(regionFromAcceptLanguage("ja-JP"), null);
  assert.equal(regionFromAcceptLanguage(null), null);
});

test("/api/geo: the header first, then the language; private and uncached", async () => {
  const ask = async (h: Record<string, string>) => {
    const res = GET(new Request("https://mtgcompare.app/api/geo", { headers: h }));
    assert.equal(res.headers.get("cache-control"), "private, no-store");
    return res.json();
  };
  assert.deepEqual(await ask({ "x-vercel-ip-country": "NZ", "accept-language": "en-US" }), { region: "nz", source: "geo" });
  assert.deepEqual(await ask({ "accept-language": "en-CA,en;q=0.9" }), { region: "ca", source: "language" });
  assert.deepEqual(await ask({ "x-vercel-ip-country": "JP", "accept-language": "ja" }), { region: null, source: null });
});

test("the landing page: the region grid's server HTML has every region link and reserved slots; nothing redirects", async () => {
  process.env.PUBLIC_DATA_MODE = "files";
  const { default: Landing } = await import("../src/app/(site)/page");
  const html = renderToStaticMarkup(await Landing());
  assert.match(html, /data-home-grid=""/);
  for (const r of REGION_LIST) assert.match(html, new RegExp(`href="/${r.region}"`), r.region);
  const grid = html.slice(html.indexOf("data-home-grid"));
  assert.equal((grid.match(/class="card h-\[5\.5rem\] overflow-hidden sm:h-\[18\.5rem\]"/g) ?? []).length, 5, "five slots of fixed height: filling them moves nothing");
  assert.match(grid, /Most stocked in the US today/);
  const hot = grid.match(/data-hot-button=""/g) ?? [];
  assert.ok(hot.length >= 4 && hot.length <= 8, `${hot.length} hot buttons`);
  for (const k of ["/us/back-in-stock", "/us/out-of-print"]) assert.match(grid, new RegExp(`href="${k}"`), k);
  for (const k of ["/us/deals", "/us/type/play-booster-boxes", "/us/type/collector-booster-boxes", "/us/guides", "/us/stores"]) assert.match(grid, new RegExp(`href="${k}"`), k);
  for (const f of ["src/middleware.ts", "src/app/api/geo/route.ts", "src/components/HomeRegionGrid.tsx", "src/components/RegionSuggest.tsx"])
    assert.doesNotMatch(readFileSync(f, "utf8"), /NextResponse\.redirect\([^)]*geo|location\.(assign|replace|href\s*=)/, `${f}: no geo redirect`);
});
