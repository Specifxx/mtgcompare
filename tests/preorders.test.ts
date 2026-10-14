// The pre-order pages (src/lib/preorders.ts, components/PreorderPage.tsx, /star-trek-preorders): which release has a page and
// until when, which catalogue product sits under which of the publisher's product lines, each product's rows in the
// visitor's market (open pre-orders cheapest first, then rows not re-read, then sold-out stores, one row per seller), and
// the wiring the rules require (PreOrder never InStock, force-dynamic, in the sitemap and the CDN list, linked from
// /release-dates, the set pages, /sealed and the home; /preorders stays a redirect). Product names are the catalogue's
// own, read on 2026-10-14.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PreorderView, type PreorderData } from "../src/components/PreorderPage";
import type { OfferRow, SealedLite, SetLite } from "../src/lib/data";
import cfg from "../src/lib/data/plane/headers.json";
import { staticEntries } from "../src/lib/sitemap-sections";
import { SITE_URL } from "../src/lib/site";
import {
  PREORDER_PAGES, PREORDER_RELEASES, STAR_TREK, boardSummary, commanderDeckNames, dateRangeOf, daysUntil, isOut, lineOf, livePreorderPages, longDateOf, orderProducts, preorderPathFor, preorderRows, releaseDateOf, releaseSets,
} from "../src/lib/preorders";

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

const set = (over: Partial<SetLite> & Pick<SetLite, "id" | "tok">): SetLite => ({ slug: over.tok, code: over.tok.toUpperCase(), name: over.tok, tcgName: over.tok, kind: "expansion", releasedOn: null, bucket: false, cardCount: 0, trackedCount: 0, sealedCount: 0, ...over });
const NONE = { US: null, AU: null, UK: null, SG: null, CA: null, EU: null };
const ZERO = { US: 0, AU: 0, UK: 0, SG: 0, CA: 0, EU: 0 };
const product = (id: number, name: string, kind: SealedLite["kind"], setId: number): SealedLite => ({ id, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name, setId, kind, packCount: null, releasedOn: "2026-11-13", presale: true, marketUsd: null, lowTcg: null, low: NONE, stores: ZERO, change7d: null });
const TRK = set({ id: 24766, tok: "trk", slug: "trk-star-trek", name: "Star Trek", releasedOn: "2026-11-13" });
const TRC = set({ id: 24770, tok: "trc", slug: "trc-commander-star-trek", name: "Commander: Star Trek", kind: "commander", releasedOn: "2026-11-13" });
const SETS = [TRK, TRC];
const BY_TOK = new Map(SETS.map((s) => [s.tok, s] as const));

/** The catalogue's Star Trek products (names and kinds as published on 2026-10-14), shuffled. */
const PRODUCTS = [
  product(9, "Star Trek Commander Deck - Klingon Fury (Collector's Edition)", "Commander Deck", 24770),
  product(1, "Star Trek - Play Booster Display Case", "Case", 24766),
  product(2, "Star Trek Scene Box - Enterprise-Q", "Booster Box", 24766),
  product(3, "Star Trek - Prerelease Pack", "Prerelease Pack", 24766),
  product(4, "Star Trek - Beam Me Up Bundle", "Bundle", 24766),
  product(5, "Star Trek - Collector Booster Display", "Booster Box", 24766),
  product(6, "Star Trek - Play Booster Pack", "Booster Pack", 24766),
  product(7, "Star Trek - Bundle", "Bundle", 24766),
  product(8, "Star Trek Commander Deck - Klingon Fury", "Commander Deck", 24770),
  product(10, "Star Trek - Play Booster Display", "Booster Box", 24766),
  product(11, "Star Trek - Draft Night", "Other", 24766),
  product(12, "Star Trek Commander Deck - We Are the Borg", "Commander Deck", 24770),
  product(13, "Star Trek Commander Deck Case (Collector's Edition)", "Case", 24770),
];

test("the registry: Star Trek is TRK and its Commander decks TRC, one page; the announced date is Wizards' 13 November 2026", () => {
  assert.deepEqual(PREORDER_PAGES, { trk: "/star-trek-preorders", trc: "/star-trek-preorders" });
  assert.equal(STAR_TREK.announced, "2026-11-13");
  assert.equal(new Set(PREORDER_RELEASES.map((r) => r.path)).size, PREORDER_RELEASES.length);
  for (const r of PREORDER_RELEASES) {
    for (const f of r.facts) assert.match(f.checked, /^\d{4}-\d{2}-\d{2}$/, f.text);
    assert.ok(r.facts.every((f) => /^https:\/\//.test(f.source.url)), "every fact has a source");
    assert.ok(!r.facts.some((f) => /\$|€|£|\bMSRP\b|\bRRP\b/.test(f.text)), "no price is a fact: Wizards' page prints none");
  }
});

test("a set links its pre-order page until release day, and never once it is out", () => {
  assert.equal(preorderPathFor(TRK, "2026-10-14"), "/star-trek-preorders");
  assert.equal(preorderPathFor(TRC, "2026-11-12"), "/star-trek-preorders");
  assert.equal(preorderPathFor(TRK, "2026-11-13"), null, "release day retires the page");
  assert.equal(preorderPathFor(set({ id: 1, tok: "eoe", releasedOn: "2026-12-01" }), "2026-10-14"), null, "a set with no page");
  assert.equal(preorderPathFor({ tok: "trk", releasedOn: null }, "2026-10-14"), null, "an undated set has no pre-order window");
  assert.deepEqual(livePreorderPages(SETS, "2026-10-14"), [{ path: "/star-trek-preorders", label: "Star Trek", releasedOn: "2026-11-13" }]);
  assert.deepEqual(livePreorderPages(SETS, "2026-11-13"), []);
  assert.deepEqual(livePreorderPages([], "2026-10-14"), [], "a release none of whose sets is in the catalogue has no live page");
  assert.equal(livePreorderPages([{ tok: "trc", releasedOn: "2026-11-13" }], "2026-10-14")[0]?.releasedOn, "2026-11-13", "the main set missing: the announced date");
});

test("the release's sets and date come from the catalogue, the announced date only as a fallback", () => {
  assert.deepEqual(releaseSets(STAR_TREK, BY_TOK).map((s) => s.tok), ["trk", "trc"]);
  assert.equal(releaseDateOf(STAR_TREK, [{ ...TRK, releasedOn: "2026-11-20" }]), "2026-11-20");
  assert.equal(releaseDateOf(STAR_TREK, []), "2026-11-13");
  assert.equal(isOut("2026-11-13", "2026-11-12"), false);
  assert.equal(isOut("2026-11-13", "2026-11-13"), true);
});

test("each catalogue product sits under one of Wizards' product lines; the order is the main set's, then the product page's", () => {
  const line = (name: string) => lineOf(STAR_TREK, name)?.name ?? null;
  assert.equal(line("Star Trek - Beam Me Up Bundle"), "Beam Me Up Bundle", "not 'Bundle'");
  assert.equal(line("Star Trek - Bundle Case"), "Bundle");
  assert.equal(line("Star Trek Commander Deck - Klingon Fury (Collector's Edition)"), "Collector's Edition Commander Deck");
  assert.equal(line("Star Trek Commander Deck - Klingon Fury (Collector’s Edition)"), "Collector's Edition Commander Deck", "a curly apostrophe");
  assert.equal(line("Star Trek Commander Deck - We Are the Borg"), "Commander Deck");
  assert.equal(line("Star Trek Scene Box - Divergent Timelines"), "Scene Box");
  assert.equal(line("Star Trek - Collector Booster Display Master Case"), "Collector Booster");
  assert.equal(line("Star Trek - Prerelease Pack"), null, "Wizards' page lists no Prerelease Pack");
  assert.deepEqual(orderProducts(STAR_TREK, PRODUCTS, SETS).map((p) => p.id), [10, 6, 1, 11, 7, 5, 4, 2, 3, 8, 12, 9, 13]);
});

test("Commander deck names come from the catalogue's own product names, each once", () => {
  assert.deepEqual(commanderDeckNames(orderProducts(STAR_TREK, PRODUCTS, SETS)), ["Klingon Fury", "We Are the Borg"]);
  assert.deepEqual(commanderDeckNames([{ name: "Star Trek Commander Deck - Federation Fleet", kind: "Commander Deck" }, { name: "Star Trek Commander Deck Case", kind: "Case" }]), ["Federation Fleet"]);
});

const NOW = Date.parse("2026-10-14T12:00:00Z");
const offer = (o: Partial<OfferRow> & Pick<OfferRow, "source" | "priceCents">): OfferRow => ({ finish: "N", storeId: 10, market: "US", currency: "USD", url: `https://shop.example/${o.source}`, inStock: true, condition: null, shippingCents: null, updatedAt: "2026-10-14T06:00:00.000Z", ...o });

test("a product's rows: the visitor's market only, open pre-orders cheapest first, then not re-read, then sold out; one row per seller", () => {
  const rows = preorderRows(
    [
      offer({ source: "store:a", priceCents: 14999 }),
      offer({ source: "store:b", priceCents: 13899, inStock: false }),
      offer({ source: "store:b", priceCents: 14500 }),                                    // b's open offer wins over its sold-out one
      offer({ source: "tcgplayer", priceCents: 15142 }),
      offer({ source: "store:c", priceCents: 12000, inStock: false, updatedAt: "2026-10-10T06:00:00.000Z" }),   // not re-read for four days
      offer({ source: "store:d", priceCents: 11999, inStock: false }),
      offer({ source: "store:e", priceCents: 9999, market: "CA", currency: "CAD" }),       // another market
      offer({ source: "ebay", priceCents: 9000 }),                                         // never a row
    ],
    "US",
    "/star-trek-preorders",
    NOW,
  );
  assert.deepEqual(rows.map((r) => [r.source, r.priceCents, r.state]), [
    ["store:b", 14500, "open"],
    ["store:a", 14999, "open"],
    ["tcgplayer", 15142, "open"],
    ["store:c", 12000, "unknown"],
    ["store:d", 11999, "soldout"],
  ]);
  assert.equal(rows[2]!.tcgplayer, true);
  assert.deepEqual(boardSummary(rows), { cheapest: rows[0], openStores: 2, soldOut: 1 });
  assert.equal(boardSummary([]).cheapest, null);
  assert.deepEqual(preorderRows([offer({ source: "store:a", priceCents: 100 })], "AU", "/x", NOW), [], "nothing in the market, nothing invented");
});

test("date helpers", () => {
  assert.equal(longDateOf("2026-11-13"), "13 November 2026");
  assert.equal(dateRangeOf("2026-11-06", "2026-11-12"), "6 to 12 November 2026");
  assert.equal(dateRangeOf("2026-10-30", "2026-11-05"), "30 October to 5 November 2026");
  assert.equal(daysUntil("2026-11-13", "2026-10-14"), 30);
  assert.equal(daysUntil("2026-11-13", "2026-11-14"), -1);
});

test("every pre-order route: force-dynamic, no revalidate, the release's own canonical and og:url, in the sitemap and the CDN list", () => {
  const entries = staticEntries("2026-10-14").map((e) => e.loc.slice(SITE_URL.length));
  for (const r of PREORDER_RELEASES) {
    const page = read(`src/app${r.path}/page.tsx`);
    assert.match(page, /^export const dynamic = "force-dynamic";$/m, r.path);
    assert.doesNotMatch(page, /export const revalidate|generateStaticParams|@\/lib\/db["']/, r.path);
    assert.match(page, new RegExp(`canonical: "${r.path}"`));
    assert.match(page, new RegExp(`openGraph: pageOg\\("${r.path}"`));
    assert.match(page, /<PreorderPage release=\{STAR_TREK\} \/>/);
    assert.ok(entries.includes(r.path), `${r.path} is in the static sitemap`);
    assert.ok((cfg.pagesPublic as string[]).includes(r.path), `${r.path} is CDN-cached like /sealed`);
  }
});

test("the page: PreOrder availability, never InStock; no eBay row, no database; the release's own facts and dates", () => {
  const page = read("src/components/PreorderPage.tsx");
  assert.match(page, /schema\.org\/PreOrder/);
  assert.doesNotMatch(page, /schema\.org\/InStock|availability: *"InStock"/);
  assert.doesNotMatch(page, /@\/lib\/db["']|getEbayPanel|getCatalog\(/);
  assert.doesNotMatch(page, /\b(?:6|12|13) November\b|2026-11-/, "no date typed into the shared page: they are the registry's");
  const card = read("src/components/PreorderProduct.tsx");
  for (const a of card.match(/<a\s[^>]*target="_blank"[^>]*>/gs) ?? []) {
    assert.match(a, /rel=\{outboundRel\(\)\}/);
    assert.match(a, /data-retailer=/);
    assert.match(a, /data-page=/);
  }
});

test("linked while it is live: /release-dates, the set pages, /sealed and the home's next-set line; /preorders stays a redirect", () => {
  assert.match(read("src/app/release-dates/page.tsx"), /livePreorderPages\(all, today\)/);
  assert.match(read("src/app/release-dates/page.tsx"), /preorderPathFor\(next, today\)/);
  assert.match(read("src/app/sets/[slug]/page.tsx"), /preorderPathFor\(set, /);
  assert.match(read("src/app/sealed/page.tsx"), /livePreorderPages\(allSets, /);
  assert.match(read("src/components/home/home-data.ts"), /preorderPath: preorderPathFor\(next, today\)/);
  assert.match(read("src/components/home/NextSetCountdownCard.tsx"), /set\.preorderPath \?/);
  assert.match(read("next.config.js"), /\{ source: "\/preorders", destination: "\/release-dates", permanent: true \}/);
  assert.ok(!fs.existsSync(path.join(ROOT, "src/app/preorders")));
});

// ── the page as a visitor gets it (PreorderView: the loaded data in, markup out) ─────────────────────────────────────────────
(globalThis as { React?: unknown }).React = React;
const render = (data: PreorderData) => renderToStaticMarkup(createElement(PreorderView, { release: STAR_TREK, data, alert: createElement("p", null, "ALERT SLOT") }));
const plain = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const display = { ...product(10, "Star Trek - Play Booster Display", "Booster Box", 24766), marketUsd: 15142 };
const DATA: PreorderData = {
  country: "US",
  today: "2026-10-14",
  sets: SETS,
  products: [display, product(8, "Star Trek Commander Deck - Klingon Fury", "Commander Deck", 24770)],
  boards: [
    { s: display, rows: preorderRows([offer({ source: "store:a", priceCents: 13899 }), offer({ source: "tcgplayer", priceCents: 15142 }), offer({ source: "store:d", priceCents: 12999, inStock: false })], "US", "/star-trek-preorders", NOW) },
    { s: product(8, "Star Trek Commander Deck - Klingon Fury", "Commander Deck", 24770), rows: [] },
  ],
};

test("the page before release: a pre-order heading and countdown, each product's sellers with sold-out ones marked, PreOrder structured data, dated sources", () => {
  const html = render(DATA), t = plain(html);
  assert.match(t, /Pre-order · releases 13 November 2026 · 30 days to go/);
  assert.match(t, /Magic: The Gathering Star Trek pre-order prices/);
  assert.match(t, /Star Trek - Play Booster Display Play Booster · TRK · TCGplayer market US\$151\.42 From · US US\$138\.99 1 store/);
  assert.match(t, /1 a Cheapest pre-order open · postage at checkout US\$138\.99 Pre-order →/);
  assert.match(t, /TCGplayer TCGplayer lowest listing/);
  assert.match(t, /sold out · last seen/, "a sold-out store is shown as such");
  assert.match(t, /No US store we track lists a pre-order for this yet/);
  assert.match(html, /"availability":"https:\/\/schema\.org\/PreOrder"/);
  assert.doesNotMatch(html, /InStock/);
  assert.match(html, /"lowPrice":"138\.99","offerCount":2/);
  assert.match(t, /What each Star Trek product is/);
  assert.match(t, /Reported by fan trackers: prerelease events run from 6 to 12 November 2026/);
  assert.match(t, /Prerelease events, which fan trackers report for 6 to 12 November 2026/);
  assert.match(t, /ALERT SLOT/);
  for (const href of ["/blog/where-to-buy-magic-star-trek", "/blog/magic-star-trek-spoilers", "/sets/trk-star-trek", "/sets/trc-commander-star-trek", "/release-dates", "/sealed/star-trek-play-booster-display"]) assert.match(html, new RegExp(`href="${href}"`), href);
  assert.doesNotMatch(t, /\bMSRP\b|\bRRP\b/);
});

test("from release day the page retires itself: no pre-order lists, no PreOrder offers, links to live prices", () => {
  const html = render({ ...DATA, today: "2026-11-13", boards: [] }), t = plain(html);
  assert.match(t, /Out now · released 13 November 2026/);
  assert.match(t, /Magic: The Gathering Star Trek is out/);
  assert.match(html, /href="\/sealed\?set=trk-star-trek"/);
  assert.doesNotMatch(html, /schema\.org\/PreOrder/);
  assert.doesNotMatch(t, /ALERT SLOT|When to pre-order/);
});
