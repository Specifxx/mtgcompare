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
import { checkedStoresIn, storesIn } from "../src/lib/stores";
import {
  PREORDER_PAGES, PREORDER_RELEASES, STAR_TREK, attributed, boardSummary, commanderDeckNames, dateRangeOf, daysUntil, eventFacts, factsCheckedOn, headlineDeal, isOut, lineMsrp, lineOf, livePreorderPages, longDateOf, orderProducts, preorderPathFor, preorderRows, releaseDateOf, releaseReach, releaseSets, splitRows, storesCheckedIn, storesTakingPreorders,
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
    assert.ok(!r.facts.some((f) => /\$|€|£|\bMSRP\b|\bRRP\b/.test(f.text)), "no price is a fact: an MSRP lives in `msrp`, with its own source");
    if (r.msrp) {
      assert.match(r.msrp.source.url, /^https:\/\/magic\.wizards\.com\//, "an MSRP is the publisher's own");
      assert.match(r.msrp.source.published, /^\d{4}-\d{2}-\d{2}$/);
      assert.match(r.msrp.checked, /^\d{4}-\d{2}-\d{2}$/);
      for (const row of r.msrp.rows) {
        assert.ok(r.lines.some((l) => l.name === row.line), `${row.line} is a product line`);
        assert.ok(Number.isInteger(row.usdCents) && row.usdCents > 0, row.line);
      }
    }
  }
  // Wizards' Collecting Star Trek article (14 July 2026, read 16 October 2026): the eight figures, and none for a Prerelease Pack or a box
  assert.deepEqual(STAR_TREK.msrp?.rows.map((x) => [x.line, x.usdCents]), [["Play Booster", 699], ["Collector Booster", 3799], ["Commander Deck", 7499], ["Collector's Edition Commander Deck", 15999], ["Bundle", 6999], ["Beam Me Up Bundle", 9999], ["Draft Night", 11999], ["Scene Box", 4199]]);
  assert.equal(lineMsrp(STAR_TREK, "Prerelease Pack"), null);
  assert.equal(STAR_TREK.prerelease?.kind, "official", "Wizards lists the prerelease since 16 October 2026");
  assert.equal(factsCheckedOn(STAR_TREK), "2026-10-16");
  assert.equal(attributed(eventFacts(STAR_TREK)), "Wizards of the Coast's Collecting Star Trek article says that prerelease events run from 6 to 12 November 2026, and that the MTG Arena release is 10 November 2026.");
  assert.equal(attributed([{ text: "A thing happens.", kind: "reported", source: { label: "x", url: "https://x.test" }, checked: "2026-10-16" }]), "Fan trackers report that a thing happens.");
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
  const card = read("src/components/PreorderProduct.tsx") + read("src/components/PreorderEbayRow.tsx");
  assert.doesNotMatch(read("src/components/PreorderEbayRow.tsx"), /@\/lib\/db["']|getEbayPanel|prisma/, "eBay rows reach the page only through the /api panel route, in the browser");
  assert.match(read("src/components/PreorderEbayRow.tsx"), /^"use client";/);
  assert.match(read("src/components/PreorderEbayRow.tsx"), /PANEL_ENDPOINT/);
  for (const a of card.match(/<a\s[^>]*target="_blank"[^>]*>/gs) ?? []) {
    assert.match(a, /rel=\{outboundRel\(\)\}/);
    assert.match(a, /data-retailer=/);
    assert.match(a, /data-page=/);
    assert.match(a, /data-surface=/);
  }
});

test("the page's layout rules: TCGplayer is split from the stores, stores taking pre-orders and the reach across markets count stores only, the headline deal is the Play Booster box", () => {
  const rows = preorderRows([offer({ source: "store:a", priceCents: 14999 }), offer({ source: "tcgplayer", priceCents: 13000 }), offer({ source: "store:b", priceCents: 14500 }), offer({ source: "store:c", priceCents: 12000, inStock: false })], "US", "/star-trek-preorders", NOW);
  const { tcgplayer, stores } = splitRows(rows);
  assert.equal(tcgplayer?.source, "tcgplayer");
  assert.deepEqual(stores.map((r) => r.source), ["store:b", "store:a", "store:c"], "the stores keep their ranking: open cheapest first, sold out last");
  assert.equal(splitRows([]).tcgplayer, null);
  // distinct stores with an open pre-order in the market, over every product; TCGplayer is never one
  const other = preorderRows([offer({ source: "store:b", priceCents: 6000 }), offer({ source: "store:d", priceCents: 6100 }), offer({ source: "tcgplayer", priceCents: 5000 })], "US", "/x", NOW);
  assert.equal(storesTakingPreorders([{ rows }, { rows: other }]), 3, "a, b and d");
  assert.equal(storesTakingPreorders([]), 0);
  // every market: open store offers in their market's currency, eBay and TCGplayer never, stale and sold-out never
  const reach = releaseReach([
    offer({ source: "store:a", priceCents: 100 }),
    offer({ source: "store:a", priceCents: 200 }),
    offer({ source: "store:au1", priceCents: 300, market: "AU", currency: "AUD" }),
    offer({ source: "store:ca1", priceCents: 300, market: "CA", currency: "USD" }),                   // charges another currency: never priced
    offer({ source: "store:uk1", priceCents: 300, market: "UK", currency: "GBP", inStock: false }),
    offer({ source: "store:sg1", priceCents: 300, market: "SG", currency: "SGD", updatedAt: "2026-10-09T06:00:00.000Z" }),
    offer({ source: "tcgplayer", priceCents: 100 }),
    offer({ source: "ebay", priceCents: 100 }),
  ], NOW);
  assert.deepEqual(reach, { stores: 2, markets: 2 });
  // the strip's deal: the Play Booster display's cheapest open row, even when another product is cheaper; else the first product with one
  const box: { s: Pick<SealedLite, "name" | "kind">; rows: typeof rows } = { s: { name: "Star Trek - Play Booster Display", kind: "Booster Box" }, rows };
  const pack: { s: Pick<SealedLite, "name" | "kind">; rows: typeof rows } = { s: { name: "Star Trek - Play Booster Pack", kind: "Booster Pack" }, rows: other };
  const deal = headlineDeal(STAR_TREK, [pack, box]);
  assert.equal(deal?.s.name, "Star Trek - Play Booster Display");
  assert.equal(deal?.row.source, "tcgplayer", "the box's cheapest open row, TCGplayer's lowest listing included: the strip then says 'on TCGplayer'");
  assert.equal(headlineDeal(STAR_TREK, [pack])?.box, false);
  assert.equal(headlineDeal(STAR_TREK, [{ s: box.s, rows: [] }]), null);
  // the count the strip and the buying guides print: the registry's stores, the off price feeds left out (as /stores lists them)
  assert.equal(storesCheckedIn("US"), checkedStoresIn("US").length);
  assert.ok(checkedStoresIn("US").every((x) => x.platform !== "feed") && checkedStoresIn("US").length === storesIn("US").length - 2, "Card Kingdom and Mana Pool are not read");
  assert.match(read("src/components/ArticleMarketData.tsx"), /checkedStoresIn\(m\)/);
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
  reach: { stores: 14, markets: 3 },
};

test("the page before release: a pre-order heading and countdown, each product's sellers with sold-out ones marked, PreOrder structured data, dated sources", () => {
  const html = render(DATA), t = plain(html);
  assert.match(t, /Pre-order · releases 13 November 2026 · 30 days to go/);
  assert.match(t, /Magic: The Gathering Star Trek pre-order prices/);
  // the strip: stores checked (the registry), stores taking pre-orders, the Play Booster box's cheapest and who has it, the countdown; the reach across markets
  assert.match(t, new RegExp(`${storesCheckedIn("US")} US stores checked 1 taking pre-orders US\\$138\\.99 cheapest Play Booster box, at a 30 days to release`));
  assert.match(html, /href="#star-trek-play-booster-display"/, "the deal links its product block");
  assert.match(t, /Across all 6 markets we track, 14 stores list Star Trek pre-orders, in 3 markets\. eBay and TCGplayer are not counted as stores\./);
  // each block: the marketplaces first (eBay, then TCGplayer, unnumbered), then the stores, cheapest first and numbered; a sold-out store last, unnumbered, not buyable
  assert.match(t, /Star Trek - Play Booster Display Play Booster · TRK From · US US\$138\.99 1 store Marketplaces e b a y Search eBay Every eBay listing for this product, pre-orders included Search eBay → → TCGplayer Lowest listing postage at checkout US\$151\.42 Buy on TCGplayer → → Stores, cheapest first · 1 taking pre-orders 1 a Cheapest pre-order open · postage at checkout US\$138\.99 Pre-order → → – d sold out · last seen 2d ago US\$129\.99 Check →/);
  const block = html.slice(html.indexOf('id="star-trek-play-booster-display"'));
  const at = (x: string) => block.indexOf(x);
  assert.ok(at('data-group="marketplaces"') > 0 && at('data-group="marketplaces"') < at('data-group="stores"'), "the marketplaces sit above the stores");
  assert.ok(at('data-marketplace="ebay"') < at('data-marketplace="tcgplayer"'), "eBay first, then TCGplayer");
  const storesGroup = block.slice(at('data-group="stores"'), block.indexOf("</section>"));
  assert.doesNotMatch(storesGroup, /TCGplayer|ebay/i, "no marketplace inside the store ranking");
  assert.equal((storesGroup.match(/Cheapest</g) ?? []).length, 1);
  assert.match(block, /data-surface="preorder_marketplace_ebay"[^>]*>|data-surface="preorder_marketplace_ebay"/);
  assert.match(block, /data-retailer="ebay_sealed_search"/, "before the browser loads a listing, the eBay line is the affiliate search");
  assert.match(block, /href="https:\/\/www\.ebay\.com\/sch\/i\.html\?_nkw=Magic%20The%20Gathering%20Star%20Trek%20-%20Play%20Booster%20Display/);
  assert.match(block, /data-surface="preorder_marketplace_tcgplayer"/);
  assert.match(t, /sold out · last seen/, "a sold-out store is shown as such");
  assert.match(t, /Star Trek Commander Deck - Klingon Fury Commander Deck · TRC Marketplaces e b a y Search eBay [^]*? TCGplayer No listing yet TCGplayer has no price for this yet Check TCGplayer → → Stores, cheapest first No US store we track lists a pre-order for this yet/);
  assert.match(html, /"availability":"https:\/\/schema\.org\/PreOrder"/);
  assert.doesNotMatch(html, /InStock/);
  assert.match(html, /"lowPrice":"138\.99","offerCount":2/);
  assert.match(t, /What each Star Trek product is/);
  assert.match(t, /What is confirmed, as of 16 October 2026/);
  assert.match(t, /Prerelease events run from 6 to 12 November 2026\. \( Wizards of the Coast's Collecting Star Trek article , 16 October 2026\)/);
  assert.match(t, /Prerelease events, which Wizards lists for 6 to 12 November 2026/);
  assert.doesNotMatch(t, /Reported by fan trackers/);
  assert.match(t, /ALERT SLOT/);
  for (const href of ["/blog/where-to-buy-magic-star-trek", "/blog/magic-star-trek-spoilers", "/blog/magic-star-trek-release-date-products", "/blog/magic-star-trek-commander-decks", "/blog/magic-star-trek-mechanics-explained", "/sets/trk-star-trek", "/sets/trc-commander-star-trek", "/release-dates", "/sealed/star-trek-play-booster-display"]) assert.match(html, new RegExp(`href="${href}"`), href);
  // Wizards' US MSRPs, each beside its product line and with its source; never a box's, never an RRP
  assert.match(t, /The US MSRPs are Wizards' own, from Wizards of the Coast's Collecting Star Trek article of 14 July 2026 \(read 16 October 2026\)/);
  assert.match(t, /Play Booster The set's main booster[^]*?US MSRP US\$6\.99 a booster Draft Night/);
  assert.match(t, /US MSRP US\$159\.99 a deck/);
  assert.match(html, /Wizards of the Coast sets a US MSRP of US\$6\.99 per Play Booster \(Wizards of the Coast's Collecting Star Trek article, 14 July 2026\) and publishes none for a display/);
  assert.doesNotMatch(t, /\bRRP\b/);
});

test("from release day the page retires itself: no pre-order lists, no PreOrder offers, links to live prices", () => {
  const html = render({ ...DATA, today: "2026-11-13", boards: [] }), t = plain(html);
  assert.match(t, /Out now · released 13 November 2026/);
  assert.match(t, /Magic: The Gathering Star Trek is out/);
  assert.match(html, /href="\/sealed\?set=trk-star-trek"/);
  assert.doesNotMatch(html, /schema\.org\/PreOrder/);
  assert.doesNotMatch(t, /ALERT SLOT|When to pre-order/);
});

test("another market: its own stores and currency; TCGplayer is a US reference in US dollars, never a pre-order; the strip counts that market's stores", () => {
  const au: PreorderData = {
    ...DATA,
    country: "AU",
    boards: [{ s: display, rows: preorderRows([offer({ source: "store:au1", priceCents: 24995, market: "AU", currency: "AUD" }), offer({ source: "store:au2", priceCents: 22995, market: "AU", currency: "AUD" }), offer({ source: "tcgplayer", priceCents: 15142 })], "AU", "/star-trek-preorders", NOW) }],
    reach: null,
  };
  const html = renderToStaticMarkup(createElement(PreorderView, { release: STAR_TREK, data: au })), t = plain(html);
  assert.match(t, new RegExp(`${storesCheckedIn("AU")} Australian stores checked 2 taking pre-orders A\\$229\\.95 cheapest Play Booster box, at au2`));
  assert.match(t, /TCGplayer Market price US site, in US dollars · a reference, not a pre-order ≈ US\$151\.42 Check TCGplayer →/);
  assert.match(t, /Stores, cheapest first · 2 taking pre-orders 1 au2 Cheapest pre-order open[^]*?A\$229\.95 Pre-order → → 2 au1 pre-order open[^]*?A\$249\.95/);
  assert.match(html, /href="https:\/\/www\.ebay\.com\.au\/sch\//, "the visitor's own eBay");
  assert.doesNotMatch(t, /Across all/, "no reach line without the figure");
});
