// The guides (src/content/guides) and the blog (src/lib/blog): the registries' rules, every body rendered as a crawler sees it on
// fixture data (its copy never matches BANNED_COPY or talks about pull rates, EV or investing; a guide carries one eBay unit plus, in
// the US only, one labelled TCGplayer link; a per-pack price appears only where the pack count is certain), and the old MTG Compare
// blog and guide URLs: kept posts are served, dropped ones are 308s to /blog.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProductCardData } from "../src/lib/data";
import { findBannedCopy } from "../src/lib/copy-rules";
import { REGION_LIST, REGIONS, type Market, type Region } from "../src/lib/regions";
import { TYPE_BY_KEY } from "../src/lib/sealed-title";
import { GUIDE_BY_SLUG, GUIDES, guideFor, guideMetaTitle, guideRegions, guidesFor, type GuideSlug } from "../src/content/guides";
import { emptyGuideData, type GuideData } from "../src/content/guides/data";
import { GUIDE_MODULES } from "../src/content/guides/modules";
import { stripIndex } from "../src/content/guides/kit";
import { familyOf, packsOf, perPackOf, type MarketCard } from "../src/content/live";
import { starTrekLine, STAR_TREK_PRODUCTS } from "../src/content/star-trek";
import { DROPPED_POSTS, OLD_GUIDE_POSTS, POST_BY_SLUG, POSTS, postMetaTitle } from "../src/lib/blog";
import { emptyPostData, type PostData } from "../src/lib/blog/data";
import { POST_MODULES } from "../src/lib/blog/modules";

(globalThis as unknown as { React: typeof React }).React = React;

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const TODAY = "2026-10-21";
const CHECKED = "2026-10-21T08:00:00.000Z";
const card = (name: string, cents: number, stores = 3, marketplace = false, setCode: string | null = "fra"): ProductCardData => ({
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  name,
  productType: "x",
  setCode,
  imageUrl: null,
  lowestPriceCents: cents,
  inStockStores: stores,
  listedStores: stores + 1,
  marketplaceOpen: marketplace,
  medianOpenCents: null,
  releaseDate: null,
});

function guideFixture(): GuideData {
  return {
    ...emptyGuideData(TODAY, CHECKED),
    rows: {
      "play-box": [card("Reality Fracture Play Booster Box", 14999, 9), card("The Hobbit Play Booster Box (30 Packs)", 15999, 4)],
      "collector-box": [card("Reality Fracture Collector Booster Box", 27999, 6)],
      "draft-box": [card("Wilds of Eldraine Draft Booster Box", 9999, 2)],
      "set-box": [],
      bundle: [card("Reality Fracture Bundle", 5499, 7, true)],
      "play-pack": [card("Reality Fracture Play Booster", 599, 12)],
      "collector-pack": [card("Reality Fracture Collector Booster", 2499, 5)],
      commander: [card("Reality Fracture Commander Deck - Rift Walkers", 4499, 3)],
      prerelease: [],
      named: [card("Star Trek Play Booster Box", 16999, 4, true, "trk"), card("Star Trek Bundle", 6499, 3, false, "trk"), card("Star Trek Commander Deck - Klingon Fury", 6999, 2, false, "trk")],
    },
    stores: [
      { store: "store-a", name: "Store A", inStock: 210, listed: 340 },
      { store: "store-b", name: "Store B", inStock: 120, listed: 180 },
    ],
    types: [
      { productType: "Play Booster Box", open: 40, fromCents: 9999 },
      { productType: "Bundle", open: 22, fromCents: 4499 },
    ],
  };
}

const renderGuide = (slug: GuideSlug, region: Region, data: GuideData = guideFixture()) => renderToStaticMarkup(React.createElement(GUIDE_MODULES[slug].Body, { r: REGIONS[region], data }));
const text = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
const PAIRS = GUIDES.flatMap((g) => guideRegions(g).map((region) => ({ g, region })));
const NO_VALUE_TALK = /\bexpected value\b|\bEV\b|\bpull rates?\b|\binvest/i;

// ─── The product families ──────────────────────────────────────────────────────

test("families: a name lands in one family; per-pack only where the count is certain", () => {
  assert.equal(familyOf("Reality Fracture Play Booster Box")?.key, "play-box");
  assert.equal(familyOf("Reality Fracture Play Booster Display")?.key, "play-box");
  assert.equal(familyOf("Reality Fracture Play Booster")?.key, "play-pack");
  assert.equal(familyOf("Reality Fracture Collector Booster Box")?.key, "collector-box");
  assert.equal(familyOf("Reality Fracture Collector Booster")?.key, "collector-pack");
  assert.equal(familyOf("Reality Fracture Collector Booster Box Case")?.key, undefined, "a case is not a box");
  assert.equal(familyOf("Wilds of Eldraine Draft Booster Box")?.key, "draft-box");
  assert.equal(familyOf("Star Trek Commander Deck - We Are the Borg")?.key, "commander");
  assert.equal(packsOf({ name: "Reality Fracture Collector Booster Box" }), 12);
  assert.equal(packsOf({ name: "Reality Fracture Play Booster Box" }), null, "a Play Booster box's count depends on the set");
  assert.equal(packsOf({ name: "The Hobbit Play Booster Box (30 Packs)" }), 30, "read from the name when it says");
  assert.equal(perPackOf({ name: "Reality Fracture Collector Booster Box", lowestPriceCents: 28800 }), 2400);
  assert.equal(perPackOf({ name: "Reality Fracture Bundle", lowestPriceCents: 5499 }), null);
  assert.equal(starTrekLine("Star Trek Play Booster Box"), null, "a box is never priced as one booster");
  assert.equal(starTrekLine("Star Trek Play Booster")?.name, "Play Booster");
  assert.equal(starTrekLine("Star Trek Beam Me Up Bundle")?.name, "Beam Me Up Bundle");
  assert.equal(starTrekLine("Star Trek Bundle")?.name, "Bundle");
  assert.equal(starTrekLine("Star Trek Commander Deck Collector's Edition - Klingon Fury")?.name, "Collector's Edition Commander Deck");
  assert.ok(STAR_TREK_PRODUCTS.every((p) => p.msrpUsCents === null || Number.isInteger(p.msrpUsCents)));
});

// ─── The guides' registry ──────────────────────────────────────────────────────

test("registry: unique slugs, ISO editorial dates, descriptions ≤ 160, titles that fit a <title>, a body module each", () => {
  assert.equal(new Set(GUIDES.map((g) => g.slug)).size, GUIDES.length);
  assert.ok(GUIDES.length >= 8);
  for (const g of GUIDES) {
    assert.match(g.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    for (const d of [g.published, g.updated]) assert.equal(new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10), d, `${g.slug}: a real date`);
    assert.ok(g.updated >= g.published, g.slug);
    assert.ok(g.description.length <= 160, `${g.slug}: description is ${g.description.length} characters`);
    assert.ok(g.title.length <= 65, `${g.slug}: title`);
    const t = guideMetaTitle(g.title);
    assert.ok((typeof t === "string" ? `${t} | MTG Compare` : t.absolute).length <= 65, `${g.slug}: <title> over 65 characters`);
    assert.doesNotMatch(`${g.title} ${g.description}`, /Pokémon|pokemon/i);
    assert.equal(findBannedCopy(`${g.title} ${g.description} ${g.kicker}`), null, g.slug);
    assert.ok(GUIDE_MODULES[g.slug], `${g.slug}: a body module`);
    for (const k of g.topic.types ?? []) assert.ok((TYPE_BY_KEY as ReadonlyMap<string, unknown>).has(k), `${g.slug}: type ${k}`);
    assert.ok(g.ebay.heading.length > 0 && g.ebay.heading.length <= 34, `${g.slug}: the strip heading fits one phone row`);
  }
});

test("the MSRP guide is US-only; every other guide is in all seven regions", () => {
  assert.deepEqual(guideRegions(GUIDE_BY_SLUG.get("magic-msrp")!), ["us"]);
  for (const r of REGION_LIST.filter((x) => x.region !== "us")) assert.equal(guideFor("magic-msrp", r.region), null, r.region);
  assert.equal(guidesFor("us").length, GUIDES.length);
  for (const g of GUIDES.filter((x) => x.slug !== "magic-msrp")) assert.equal(guideRegions(g).length, 7, g.slug);
  assert.equal(guideFor("no-such-guide", "au"), null);
});

// ─── The guides, rendered ──────────────────────────────────────────────────────

test("every guide renders in every region it is offered in: no banned copy, no value talk, prices in the region's currency", () => {
  for (const { g, region } of PAIRS) {
    const html = renderGuide(g.slug, region);
    const t = text(html);
    assert.equal(findBannedCopy(t), null, `${g.slug} (${region}): ${findBannedCopy(t)}`);
    assert.doesNotMatch(t.replace(/Expected[^.]*\./g, ""), NO_VALUE_TALK, `${g.slug} (${region})`);
    assert.doesNotMatch(t, /Pokémon|DexCompare|Elite Trainer/i, `${g.slug} (${region}): left from the Pokémon site`);
    assert.ok(GUIDE_MODULES[g.slug].outline(REGIONS[region], guideFixture()).sections.length >= 3, g.slug);
    const tcg = (html.match(/data-placement="guide-tcgplayer"|placement=guide-tcgplayer|guide-tcgplayer/g) ?? []).length;
    if (region !== "us") assert.equal(tcg, 0, `${g.slug} (${region}): TCGplayer link outside the US`);
  }
});

test("a guide's per-pack column is filled only where the count is certain", () => {
  const html = renderGuide("how-many-packs-in-magic-products", "au");
  const row = (type: string) => text(new RegExp(`<tr[^>]*data-type="${type}"[^>]*>([\\s\\S]*?)</tr>`).exec(html)?.[1] ?? "");
  assert.match(row("collector-box"), /A\$279\.99 Per pack A\$23\.33/, "12 packs: 27999 / 12");
  assert.match(row("play-box"), /Per pack — /, "no count for a Play Booster box that doesn't state one");
});

test("the strip goes after the first live section", () => {
  for (const g of GUIDES) {
    const s = GUIDE_MODULES[g.slug].outline(REGIONS.us, guideFixture()).sections;
    assert.ok(stripIndex(s) >= 0 && stripIndex(s) < s.length, g.slug);
  }
});

test("empty data renders an empty state, never a crash or an invented number", () => {
  for (const { g, region } of PAIRS) {
    const t = text(renderGuide(g.slug, region, emptyGuideData(TODAY, null)));
    assert.equal(findBannedCopy(t), null, g.slug);
  }
});

// ─── The blog ──────────────────────────────────────────────────────────────────

const mc = (market: Market, name: string, cents: number, setCode = "fra"): MarketCard => ({ ...card(name, cents, 3, false, setCode), market });
function postFixture(): PostData {
  const markets = REGION_LIST.map((r) => r.market);
  return {
    ...emptyPostData(TODAY, CHECKED),
    boxes: markets.flatMap((m, i) => [mc(m, "Reality Fracture Play Booster Box", 14000 + i * 1000), mc(m, "Reality Fracture Collector Booster Box", 26000 + i * 1000)]),
    named: markets.flatMap((m, i) => [mc(m, "Star Trek Play Booster", 699 + i, "trk"), mc(m, "Star Trek Commander Deck - Federation Fleet", 7499 + i * 100, "trk"), mc(m, "Star Trek Bundle", 6999 + i * 100, "trk")]),
    counts: markets.map((m, i) => ({ market: m, stores: 5 + i, open: 100 + i })),
    stores: { US: [{ store: "store-a", name: "Store A", inStock: 99, listed: 120 }] },
  };
}

test("blog registry: unique slugs, real dates, short descriptions, a module each, and no dropped slug served", () => {
  assert.equal(new Set(POSTS.map((p) => p.slug)).size, POSTS.length);
  for (const p of POSTS) {
    for (const d of [p.published, p.updated]) assert.equal(new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10), d, p.slug);
    assert.ok(p.description.length <= 160, `${p.slug}: description is ${p.description.length}`);
    const t = postMetaTitle(p.title);
    assert.ok((typeof t === "string" ? `${t} | MTG Compare` : t.absolute).length <= 70, `${p.slug}: <title>`);
    assert.equal(findBannedCopy(`${p.title} ${p.description}`), null, p.slug);
    assert.ok(POST_MODULES[p.slug], p.slug);
    assert.ok(!DROPPED_POSTS.includes(p.slug), p.slug);
  }
});

test("every post renders: no banned copy, no value talk, every market in its own currency", () => {
  for (const p of POSTS) {
    const o = POST_MODULES[p.slug].outline(postFixture());
    const html = renderToStaticMarkup(React.createElement(React.Fragment, null, o.intro, ...o.sections.map((s) => React.createElement("section", { key: s.id }, s.body))));
    const t = text(html);
    assert.equal(findBannedCopy(t), null, `${p.slug}: ${findBannedCopy(t)}`);
    assert.doesNotMatch(t, NO_VALUE_TALK, p.slug);
    assert.doesNotMatch(t, /Pokémon|DexCompare/i, p.slug);
    const empty = POST_MODULES[p.slug].outline(emptyPostData(TODAY));
    assert.ok(empty.sections.length >= 2, `${p.slug}: renders with no data`);
  }
  const t = text(renderToStaticMarkup(React.createElement(React.Fragment, null, ...POST_MODULES["cheapest-magic-booster-boxes"].outline(postFixture()).sections.map((s) => s.body))));
  for (const amount of ["A$", "£", "€", "S$", "C$", "NZ$"]) assert.ok(t.includes(amount), amount);
});

// ─── The old site's URLs ───────────────────────────────────────────────────────

type Redirect = { source: string; destination: string; permanent: boolean };
const require = createRequire(import.meta.url);
const config = require("../next.config.js") as { redirects: () => Promise<Redirect[]> };
const nextMatch = require("next/dist/shared/lib/router/utils/path-match") as {
  getPathMatch: (source: string, opts: { strict: boolean; removeUnnamedParams: boolean; sensitive: boolean }) => (path: string) => false | Record<string, string>;
};
function to(rules: Redirect[], path: string): string | undefined {
  for (const rule of rules) {
    const m = nextMatch.getPathMatch(rule.source, { strict: true, removeUnnamedParams: true, sensitive: false })(path);
    if (m) return rule.destination.replace(/:(\w+)/g, (_, k) => m[k] ?? `:${k}`);
  }
  return undefined;
}

test("old MTG Compare blog and guide URLs: kept posts are served, dropped ones 308 to /blog", async () => {
  const rules = await config.redirects();
  const APP = new URL("../src/app/", import.meta.url);
  assert.ok(existsSync(new URL("(site)/blog/page.tsx", APP)) && existsSync(new URL("(site)/blog/[slug]/page.tsx", APP)));
  for (const p of POSTS) assert.equal(to(rules, `/blog/${p.slug}`), undefined, `/blog/${p.slug} is served`);
  for (const s of DROPPED_POSTS) {
    assert.equal(to(rules, `/blog/${s}`), "/blog", `/blog/${s}`);
    assert.ok(rules.find((r) => to([r], `/blog/${s}`))?.permanent, s);
  }
  for (const s of OLD_GUIDE_POSTS) assert.equal(to(rules, `/guides/${s}`), POST_BY_SLUG.has(s) ? `/blog/${s}` : "/blog", `/guides/${s}`);
  assert.equal(to(rules, "/blog"), undefined, "the blog index is served");
  assert.equal(to(rules, "/guides/magic-booster-box-prices-by-country"), undefined, "the by-country guide is served");
  assert.equal(to(rules, "/guides/some-old-guide"), "/us/guides");
  assert.equal(to(rules, "/us/guides/magic-msrp"), undefined);
});
