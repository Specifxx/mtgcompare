// The SEO release (2026-10-21): the tools (src/content/tools, src/app/[region]/tools), their arithmetic (lib/tools.ts) and fee table
// (lib/fees.ts), the product page's and store page's new intros, and the sitemap's tool URLs.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { findBannedCopy } from "../src/lib/copy-rules";
import { FEE_BY_KEY, FEE_SCHEDULES, schedulesFor, sellingFees } from "../src/lib/fees";
import { productIntro } from "../src/lib/product-copy";
import { STORE_MIN_LISTED, storeIndexable, storeIntro } from "../src/lib/hub-copy";
import { REGION_LIST, REGIONS } from "../src/lib/regions";
import { parseMoney, parsePct, pricePosition } from "../src/lib/tools";
import { GUIDE_BY_SLUG } from "../src/content/guides";
import { TOOLS, toolMetaTitle } from "../src/content/tools";
import ToolPage from "../src/app/[region]/tools/[tool]/page";
import ToolsIndex from "../src/app/[region]/tools/page";

(globalThis as unknown as { React: typeof React }).React = React;
const text = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

test("every tool page, in every region: one H1, the steps, the FAQ in the HTML and in FAQPage JSON-LD, links inside the region, no banned copy", () => {
  for (const r of REGION_LIST) {
    for (const t of TOOLS) {
      const html = renderToStaticMarkup(React.createElement(ToolPage, { params: { region: r.region, tool: t.slug } }));
      assert.equal((html.match(/<h1/g) ?? []).length, 1, `${t.slug}/${r.region}`);
      for (const f of t.faq) assert.ok(html.includes(f.q.replace(/'/g, "&#x27;")) || html.includes(f.q), `${t.slug}: FAQ "${f.q}"`);
      assert.match(html, /"@type":"FAQPage"/);
      assert.match(html, /"@type":"WebApplication"/);
      assert.match(html, /data-tool=""/, "the tool itself renders on the server");
      assert.equal(findBannedCopy(text(html)), null, `${t.slug}/${r.region}`);
      const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
      for (const h of hrefs) if (h.startsWith("/")) assert.ok(h.startsWith(`/${r.region}/`) || h === `/${r.region}`, `${t.slug}/${r.region}: ${h}`);
      assert.ok(hrefs.filter((h) => h.startsWith(`/${r.region}/guides/`)).length >= 1, `${t.slug}/${r.region}: links a guide`);
    }
    const index = renderToStaticMarkup(React.createElement(ToolsIndex, { params: { region: r.region } }));
    for (const t of TOOLS) assert.ok(index.includes(`href="/${r.region}/tools/${t.slug}"`), `${r.region} index: ${t.slug}`);
  }
});

test("the fee calculator's page prints eBay's published rates where we keep them (AU, US), and says to use Custom elsewhere", () => {
  const au = text(renderToStaticMarkup(React.createElement(ToolPage, { params: { region: "au", tool: "selling-fee-calculator" } })));
  assert.match(au, /13\.4% of the total up to A\$4,000, then 2\.5% above it, plus A\$0\.30 an order/);
  assert.match(au, /2026-10-21/);
  const us = text(renderToStaticMarkup(React.createElement(ToolPage, { params: { region: "us", tool: "selling-fee-calculator" } })));
  assert.match(us, /13\.25% of the total up to \$7,500, then 2\.35% above it/);
  const uk = text(renderToStaticMarkup(React.createElement(ToolPage, { params: { region: "uk", tool: "selling-fee-calculator" } })));
  assert.match(uk, /choose Custom/);
  assert.deepEqual(schedulesFor("UK"), []);
});

test("fees: tiered final value fee on item + postage, the per-order fee by order size, free selling is free", () => {
  const au = FEE_BY_KEY.get("ebay-au-standard")!;
  // A$60 + A$12 = A$72: 13.4% = 964.8 → 965, + 30
  assert.deepEqual(sellingFees(6000, 1200, au), { totalCents: 7200, variableCents: 965, orderCents: 30, feesCents: 995, afterFeesCents: 6205, effectivePct: (995 / 7200) * 100 });
  // A$5,000: 13.4% of 4,000 + 2.5% of 1,000 = 536 + 25 = A$561, + 0.30
  assert.equal(sellingFees(500_000, 0, au).feesCents, 53_600 + 2_500 + 30);
  const us = FEE_BY_KEY.get("ebay-us-ccg")!;
  assert.equal(sellingFees(800, 0, us).orderCents, 30, "an order of $10 or less");
  assert.equal(sellingFees(1500, 0, us).orderCents, 40);
  assert.equal(sellingFees(10_000, 0, FEE_BY_KEY.get("ebay-au-free")!).feesCents, 0);
  assert.equal(sellingFees(0, 0, au).feesCents, 0, "nothing sold, nothing charged");
  assert.equal(sellingFees(10_000, 0, { ratePct: 10, orderFeeCents: 50 }).feesCents, 1_050);
  for (const s of FEE_SCHEDULES) assert.match(s.source, /^https:\/\/www\.ebay\.com(?:\.au)?\//, s.key);
});

test("parsing: money in the forms people type, and percentages", () => {
  assert.equal(parseMoney("12.50"), 1250);
  assert.equal(parseMoney("A$1,299"), 129_900);
  assert.equal(parseMoney("12,50"), 1250);
  assert.equal(parseMoney("€ 1.299,95"), 129_995);
  assert.equal(parseMoney(""), null);
  assert.equal(parseMoney("abc"), null);
  assert.equal(parseMoney("-5"), null);
  assert.equal(parsePct("13.4%"), 13.4);
  assert.equal(parsePct("140"), 100);
  assert.equal(parsePct("x"), null);
});

test("value checker: where an offered price sits against today's cheapest and median", () => {
  assert.equal(pricePosition(9_000, 10_000, 12_000), "below-cheapest");
  assert.equal(pricePosition(10_050, 10_000, 12_000), "at-cheapest");
  assert.equal(pricePosition(11_000, 10_000, 12_000), "below-median");
  assert.equal(pricePosition(12_100, 10_000, 12_000), "around-median");
  assert.equal(pricePosition(14_000, 10_000, 12_000), "above-median");
  assert.equal(pricePosition(14_000, 10_000, null), "above-cheapest");
});

test("product intro: what it is, the set, packs and per pack, stores and the median, no banned copy; sold out says so", () => {
  const base = {
    name: "Edge of Eternities Collector Booster Box",
    productType: "Collector Booster Box",
    about: null,
    set: { name: "Edge of Eternities", series: "Standard", releaseDate: "2025-08-01" },
    preorder: false,
    packs: 9,
    market: "AU",
    inName: "Australia",
    adjective: "Australian",
    cheapest: { cents: 8_999, storeName: "Good Games", marketplace: false },
    medianCents: 9_999,
    openStores: 12,
    storeCount: 20,
    elsewhere: 4,
  };
  const t = productIntro(base).join(" ");
  assert.match(t, /MTG Edge of Eternities Collector Booster Box is a Collector Booster Box from Edge of Eternities, a Magic: The Gathering release/);
  assert.match(t, /released on 1 Aug 2025/);
  assert.match(t, /It holds 9 booster packs\./);
  assert.match(t, /A\$89\.99 at Good Games, or A\$10\.00 a pack/);
  assert.match(t, /12 Australian stores of the 20 stores we track/);
  assert.match(t, /The median of those stores is A\$99\.99/);
  assert.match(t, /4 other regions/);
  assert.equal(findBannedCopy(t), null);
  const sold = productIntro({ ...base, cheapest: null, openStores: 0 }).join(" ");
  assert.match(sold, /None of the 20 Australian stores we track that list it has it in stock right now/);
  assert.equal(findBannedCopy(sold), null);
});

test("store intro: its own numbers, its range of sets, how often it is cheapest; and a store needs three listings to be indexed", () => {
  const rows = [
    { productType: "Play Booster Box", listed: 14, inStock: 9, cheapest: 3, sets: ["fra", "tla"] },
    { productType: "Collector Booster Box", listed: 22, inStock: 11, cheapest: 0, sets: ["fra"] },
    { productType: "Commander Deck", listed: 5, inStock: 5, cheapest: 1, sets: [] },
  ];
  const t = storeIntro({ name: "Card Shop", host: "cardshop.com.au", platform: "shopify", r: REGIONS.au, rows, storesInRegion: 61, dormant: false }).join(" ");
  assert.match(t, /Card Shop \(cardshop\.com\.au\) is one of the 61 Australian online stores/);
  assert.match(t, /lists 41 sealed products, 25 of them in stock/);
  assert.match(t, /22 Collector Booster Boxes, 14 Play Booster Boxes and 5 Commander Decks/);
  assert.match(t, /from Avatar: The Last Airbender to Reality Fracture/);
  assert.match(t, /4 products it has in stock are at the cheapest price/);
  assert.equal(findBannedCopy(t), null);
  assert.match(storeIntro({ name: "X", host: "x.com", platform: "shopify", r: REGIONS.au, rows: [], storesInRegion: 61, dormant: false }).join(" "), /haven’t found any/);
  assert.equal(STORE_MIN_LISTED, 3);
  assert.equal(storeIndexable({ listed: 2, dormant: false }), false);
  assert.equal(storeIndexable({ listed: 3, dormant: false }), true);
});

