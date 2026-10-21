import { test } from "node:test";
import assert from "node:assert/strict";
import { isRegion, REGION_LIST, REGIONS, regionOrNotFound, X_DEFAULT_REGION, xDefaultRegion } from "../src/lib/regions";
import { EU_HREFLANGS, pageMeta, regionAlternates } from "../src/lib/seo";
import { SITE_URL } from "../src/lib/site";

// next/navigation's notFound() throws an error Next recognises by its digest.
const notFoundDigest = (e: unknown) => (e as { digest?: string }).digest === "NEXT_NOT_FOUND";

test("regionOrNotFound: the seven lowercase codes resolve", () => {
  for (const r of REGION_LIST) assert.equal(regionOrNotFound(r.region).market, r.market);
});

test("regionOrNotFound: unknown, uppercase, empty and missing params throw NEXT_NOT_FOUND", () => {
  for (const v of ["foo", "AU", "Au", "terms", "", undefined, null, "au/", "usa"]) {
    assert.throws(() => regionOrNotFound(v), notFoundDigest, `expected notFound() for ${JSON.stringify(v)}`);
  }
});

test("isRegion is exact and lowercase", () => {
  assert.equal(isRegion("au"), true);
  assert.equal(isRegion("AU"), false);
  assert.equal(isRegion("__proto__"), false);
  assert.equal(isRegion("toString"), false);
});

test("xDefaultRegion prefers US, else the first advertised region, and never leaves the list", () => {
  assert.equal(X_DEFAULT_REGION, "us");
  assert.equal(xDefaultRegion(["au", "us", "uk"]), "us");
  assert.equal(xDefaultRegion(["au", "uk"]), "au");
  assert.equal(xDefaultRegion([]), "us");
});

test("regionAlternates: all regions by default, x-default → US; both call shapes agree", () => {
  const alt = regionAlternates("au", "/sets") as { canonical: string; languages: Record<string, string> };
  assert.equal(alt.canonical, `${SITE_URL}/au/sets`);
  assert.equal(alt.languages["x-default"], `${SITE_URL}/us/sets`);
  assert.equal(alt.languages["en-AU"], `${SITE_URL}/au/sets`);
  assert.equal(Object.keys(alt.languages).length, REGION_LIST.length + EU_HREFLANGS.length + 1, "seven regions, the euro countries' keys for /eu, x-default");
  assert.deepEqual(regionAlternates("/au/sets"), alt);
  assert.deepEqual(regionAlternates("/au/p/x", ["ca"]), regionAlternates("au", "/p/x", ["ca"]));
});

test("regionAlternates: a region home's x-default is the landing page (the region chooser)", () => {
  const alt = regionAlternates("/uk") as { canonical: string; languages: Record<string, string> };
  assert.equal(alt.canonical, `${SITE_URL}/uk`);
  assert.equal(alt.languages["x-default"], `${SITE_URL}/`);
  assert.equal(alt.languages["en-GB"], `${SITE_URL}/uk`);
});

test("regionAlternates: a path outside the regions gets a canonical and no hreflang", () => {
  assert.deepEqual(regionAlternates("/about"), { canonical: `${SITE_URL}/about` });
});

test("pageMeta: ogType product leaves openGraph.type out and sets og:type through other", () => {
  const m = pageMeta({ title: "t", description: "d", path: "/au/p/x", ogType: "product" });
  assert.ok(!("type" in (m.openGraph as object)));
  assert.equal((m.other as Record<string, string>)["og:type"], "product");
  const w = pageMeta({ title: "t", description: "d", path: "/au" });
  assert.equal((w.openGraph as { type: string }).type, "website");
});

test("regionAlternates: advertises only the regions given, always the page's own, x-default never a region not advertised", () => {
  const alt = regionAlternates("uk", "/p/x", ["ca", "eu"]) as { canonical: string; languages: Record<string, string> };
  assert.equal(alt.canonical, `${SITE_URL}/uk/p/x`);
  assert.deepEqual(Object.keys(alt.languages).sort(), ["en-CA", "en-GB", "en-IE", ...EU_HREFLANGS, "x-default"].sort());
  assert.equal(alt.languages["x-default"], `${SITE_URL}/uk/p/x`);
  const withUs = regionAlternates("uk", "/p/x", [{ ...REGION_LIST[0] }, { ...REGION_LIST[1] }]) as { languages: Record<string, string> };
  assert.equal(withUs.languages["x-default"], `${SITE_URL}/us/p/x`);
  for (const u of Object.values(alt.languages)) assert.ok(u.startsWith(`${SITE_URL}/`), u);
});

test("regionAlternates: the /eu copy is listed under en-IE and under each euro country's English (searchers in Germany are not en-IE)", () => {
  assert.deepEqual([...EU_HREFLANGS], ["en-DE", "en-NL", "en-FR", "en-BE", "en-AT", "en-ES", "en-IT", "en-FI", "en-PT", "en-LU"]);
  const alt = regionAlternates("eu", "/p/x") as { canonical: string; languages: Record<string, string> };
  for (const h of ["en-IE", ...EU_HREFLANGS]) assert.equal(alt.languages[h], `${SITE_URL}/eu/p/x`, h);
  // only where /eu is advertised: a page that is not indexable in the EU names none of them
  const noEu = regionAlternates("au", "/p/x", ["us"]) as { languages: Record<string, string> };
  for (const h of ["en-IE", ...EU_HREFLANGS]) assert.equal(noEu.languages[h], undefined, h);
  // a region home: the same keys, and x-default stays the landing page
  const home = regionAlternates("/eu") as { languages: Record<string, string> };
  assert.equal(home.languages["en-DE"], `${SITE_URL}/eu`);
  assert.equal(home.languages["x-default"], `${SITE_URL}/`);
  // every key once, every URL on the site
  for (const u of Object.values(home.languages)) assert.ok(u.startsWith(`${SITE_URL}/`), u);
  assert.equal(new Set(REGION_LIST.map((r) => r.hreflang).concat(EU_HREFLANGS)).size, REGION_LIST.length + EU_HREFLANGS.length, "no euro key collides with a region's own");
});

test("inName: the region as it reads after 'in' (titles, H1s): 'the US' and 'the UK', plain 'Europe'", () => {
  assert.deepEqual(
    Object.fromEntries(REGION_LIST.map((r) => [r.region, r.inName])),
    { au: "Australia", us: "the US", uk: "the UK", ca: "Canada", nz: "New Zealand", eu: "Europe", sg: "Singapore" },
  );
  assert.equal(`in ${REGIONS.us.inName}`, "in the US");
});
