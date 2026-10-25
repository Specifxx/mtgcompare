// Amazon Australia (Amazon Associates) links: the URL helper, region gating, rel/target, the footer disclosure, the disclosure page,
// the two Australian guides and the amazon_click wiring.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ProductCardData } from "../src/lib/data";
import { PLACEMENTS } from "../src/lib/affiliate";
import { AMAZON_DEFAULT_TAG, AMAZON_DISCLOSURE, AMAZON_REGIONS, amazonRegion, amazonTag, amazonUrl, asinFor, REL_AMAZON } from "../src/lib/amazon";
import { REGION_LIST, REGIONS, type Region } from "../src/lib/regions";
import { AmazonAlso, AmazonLink, AmazonProductRow } from "../src/components/Amazon";
import { Footer } from "../src/components/Footer";
import AffiliateDisclosure, { metadata as disclosureMeta } from "../src/app/(site)/affiliate-disclosure/page";
import { GUIDE_BY_SLUG, guidesFor, type GuideSlug } from "../src/content/guides";
import { emptyGuideData, type GuideData } from "../src/content/guides/data";
import { GUIDE_MODULES } from "../src/content/guides/modules";
import { staticSitemap } from "../src/lib/sitemap";
import { findBannedCopy } from "../src/lib/copy-rules";

(globalThis as unknown as { React: typeof React }).React = React;

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
const amazonAnchors = (html: string) => [...html.matchAll(/<a [^>]*href="https:\/\/www\.amazon\.com\.au[^"]*"[^>]*>/g)].map((m) => m[0]);

test("amazonUrl: /dp/<ASIN> when the ASIN is known, else a search; the tag on both", () => {
  assert.equal(amazonUrl("Anything", { slug: "x", asins: { x: "B0ABCDEFGH" }, tag: "t-22" }), "https://www.amazon.com.au/dp/B0ABCDEFGH?tag=t-22");
  const s = new URL(amazonUrl("Reality Fracture Play Booster Box - LIMIT 2 PER CUSTOMER", { tag: "t-22", asins: {} }));
  assert.equal(s.origin + s.pathname, "https://www.amazon.com.au/s");
  assert.equal(s.searchParams.get("k"), "MTG Reality Fracture Play Booster Box");
  assert.equal(s.searchParams.get("tag"), "t-22");
  // A name that already says Magic is not prefixed; spaces and & are encoded.
  const u = amazonUrl("Magic: The Gathering Bloomburrow Bundle & More", { tag: "t-22", asins: {} });
  assert.match(u, /\?k=Magic%3A%20The%20Gathering%20Bloomburrow%20Bundle%20%26%20More&tag=t-22$/);
  // A bad ASIN in the map is never used.
  assert.equal(asinFor("x", { x: "not-an-asin" }), null);
  assert.equal(asinFor(null), null);
});

test("amazonTag: AMAZON_AU_TAG, else compareempire-22 (empty or malformed falls back)", () => {
  assert.equal(AMAZON_DEFAULT_TAG, "compareempire-22");
  assert.equal(amazonTag(undefined), "compareempire-22");
  assert.equal(amazonTag(""), "compareempire-22");
  assert.equal(amazonTag("bad tag&x=1"), "compareempire-22");
  assert.equal(amazonTag(" mine-22 "), "mine-22");
  const before = process.env.AMAZON_AU_TAG;
  process.env.AMAZON_AU_TAG = "envtag-22";
  try {
    assert.match(amazonUrl("Bundle", { asins: {} }), /&tag=envtag-22$/);
  } finally {
    if (before === undefined) delete process.env.AMAZON_AU_TAG;
    else process.env.AMAZON_AU_TAG = before;
  }
  assert.match(amazonUrl("Bundle", { asins: {} }), new RegExp(`&tag=${process.env.AMAZON_AU_TAG ?? "compareempire-22"}$`));
});

test("the ASIN map is a JSON object of slug → 10-character ASIN (never guessed; empty is fine)", () => {
  const map = JSON.parse(readFileSync(new URL("../src/data/amazon-asins.json", import.meta.url), "utf8")) as Record<string, string>;
  assert.equal(typeof map, "object");
  for (const [k, v] of Object.entries(map)) assert.match(v, /^[A-Z0-9]{10}$/, k);
});

test("region gating: AU, NZ and SG show Amazon; US, UK, CA and EU never do", () => {
  assert.deepEqual([...AMAZON_REGIONS].sort(), ["au", "nz", "sg"]);
  for (const r of REGION_LIST) {
    const yes = ["au", "nz", "sg"].includes(r.region);
    assert.equal(amazonRegion(r.region), yes, r.region);
    const row = render(React.createElement(AmazonProductRow, { region: r.region, name: "Reality Fracture Bundle", slug: "reality-fracture-bundle" }));
    const also = render(React.createElement(AmazonAlso, { region: r.region, name: "Magic The Gathering Bundle", placement: "amazon-type", page: `/${r.region}/type/bundles` }));
    assert.equal(amazonAnchors(row).length, yes ? 1 : 0, r.region);
    assert.equal(amazonAnchors(also).length, yes ? 1 : 0, r.region);
    if (yes) {
      assert.match(row, /Check price on Amazon AU/);
      assert.match(row, new RegExp(AMAZON_DISCLOSURE.replace(/\./g, "\\.")));
      assert.doesNotMatch(row.replace(/<[^>]+>/g, " "), /\$\d/, "no Amazon price");
    }
  }
  assert.match(render(React.createElement(AmazonProductRow, { region: "nz", name: "B", slug: "b" })), /Amazon Australia \(ships to NZ\)[\s\S]*may ship to New Zealand; check delivery/);
  assert.match(render(React.createElement(AmazonProductRow, { region: "sg", name: "B", slug: "b" })), /may ship to Singapore; check delivery/);
});

test("Amazon links: target=_blank, rel exactly 'sponsored nofollow noopener', placements registered", () => {
  assert.equal(REL_AMAZON, "sponsored nofollow noopener");
  const html = render(React.createElement(AmazonLink, { region: "au", name: "Bundle", placement: "amazon-guide", page: "/au/guides/x" }));
  const [a] = amazonAnchors(html);
  assert.match(a, /target="_blank"/);
  assert.match(a, /rel="sponsored nofollow noopener"/);
  for (const p of ["amazon-product", "amazon-type", "amazon-set", "amazon-deals", "amazon-guide"]) assert.ok((PLACEMENTS as readonly string[]).includes(p), p);
});

test("amazon_click: OutboundLink sends GA4 amazon_click {product, region, page} and still only buy_click to Vercel", () => {
  const src = readFileSync(new URL("../src/components/OutboundLink.tsx", import.meta.url), "utf8");
  assert.match(src, /gaEvent\("amazon_click", \{ product: [^}]*region: amazon\.region, page: [^}]*\}\)/);
  assert.match(src, /track\("buy_click"/);
  const comp = readFileSync(new URL("../src/components/Amazon.tsx", import.meta.url), "utf8");
  assert.match(comp, /<OutboundLink [^>]*retailer=\{AMAZON_RETAILER\}[^>]*amazon=\{\{ product: [^}]*region, page \}\}/);
  const track = readFileSync(new URL("../src/lib/track.ts", import.meta.url), "utf8");
  assert.match(track, /new Set\(\["buy_click"\]\)/, "no new Vercel event names");
});

test("footer: the exact Amazon Associates line and the disclosure link, on every layout's footer", () => {
  assert.equal(AMAZON_DISCLOSURE, "As an Amazon Associate I earn from qualifying purchases.");
  for (const region of [null, ...REGION_LIST.map((r) => r.region)] as (Region | null)[]) {
    const html = render(React.createElement(Footer, { region }));
    assert.ok(html.includes("As an Amazon Associate I earn from qualifying purchases."), String(region));
    assert.match(html, /href="\/affiliate-disclosure"/, String(region));
  }
  // Every layout that closes a page renders the Footer.
  for (const f of ["app/[region]/layout.tsx", "app/(site)/layout.tsx", "app/error.tsx", "app/not-found.tsx"]) {
    assert.match(readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8"), /<Footer /, f);
  }
});

test("/affiliate-disclosure renders, covers every program, and is in the sitemap", () => {
  const t = render(React.createElement(AffiliateDisclosure)).replace(/<[^>]+>/g, " ");
  for (const w of ["As an Amazon Associate I earn from qualifying purchases.", "eBay Partner Network", "TCGplayer", "Impact", "Google"]) assert.ok(t.includes(w), w);
  assert.ok(String(disclosureMeta.description).length <= 160);
  assert.ok(staticSitemap({}).some((u) => u.url.endsWith("/affiliate-disclosure")));
});

const card = (name: string, cents: number, stores: number, setCode = "fra"): ProductCardData => ({
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  name,
  productType: "x",
  setCode,
  imageUrl: null,
  lowestPriceCents: cents,
  inStockStores: stores,
  listedStores: stores + 1,
  marketplaceOpen: false,
  medianOpenCents: null,
  releaseDate: null,
});
const data = (): GuideData => ({
  ...emptyGuideData("2026-10-25", "2026-10-25T08:00:00.000Z"),
  stores: [{ store: "store-a", name: "Store A", inStock: 210, listed: 340 }],
  byType: {
    "Commander Deck": [card("Reality Fracture Commander Deck - Rift Walkers", 6499, 3), card("Star Trek Commander Deck - Klingon Fury", 6999, 8, "trk")],
    "Commander Deck Set": [],
    "Play Booster Box": [card("Reality Fracture Play Booster Box", 21999, 9)],
    "Collector Booster Box": [card("Reality Fracture Collector Booster Box", 44999, 4)],
  },
  openByType: { "Commander Deck": 42, "Play Booster Box": 30, "Collector Booster Box": 12 },
});
const AU_GUIDES: GuideSlug[] = ["best-commander-precons-australia", "where-to-buy-mtg-booster-boxes-australia"];

test("the two Australian guides: AU only, titles and descriptions fit, render with data, product and Amazon links, FAQ, no Amazon price", () => {
  for (const slug of AU_GUIDES) {
    const g = GUIDE_BY_SLUG.get(slug)!;
    assert.ok(g.title.length < 60 && g.description.length < 160, slug);
    assert.ok(guidesFor("au").some((x) => x.slug === slug));
    for (const r of ["us", "uk", "ca", "eu", "nz", "sg"] as Region[]) assert.ok(!guidesFor(r).some((x) => x.slug === slug), `${slug} ${r}`);
    const html = render(React.createElement(GUIDE_MODULES[slug].Body, { r: REGIONS.au, data: data() }));
    assert.match(html, /href="\/au\/p\/reality-fracture-/, slug);
    assert.ok(amazonAnchors(html).length >= 2, slug);
    for (const a of amazonAnchors(html)) assert.match(a, /rel="sponsored nofollow noopener"/);
    assert.match(html, /Check price on Amazon AU/);
    assert.match(html, /As an Amazon Associate I earn from qualifying purchases\./);
    assert.match(html, /data-faq=""/);
    assert.match(html, /A\$/);
    assert.equal(findBannedCopy(html.replace(/<[^>]+>/g, " ")), null, slug);
    // empty data: no crash
    render(React.createElement(GUIDE_MODULES[slug].Body, { r: REGIONS.au, data: emptyGuideData("2026-10-25", null) }));
  }
});
