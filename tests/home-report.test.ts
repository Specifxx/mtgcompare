// The landing page's market report (components/home/MarketReport.tsx, lib/home-report.ts) and its retargeted metadata.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProductCardData } from "../src/lib/data";
import { findBannedCopy } from "../src/lib/copy-rules";
import { REGION_LIST } from "../src/lib/regions";
import { emptyHomeReport, type HomeReport } from "../src/lib/home-report";
import { MarketReport } from "../src/components/home/MarketReport";
import { SinglesNote } from "../src/components/seo/SinglesNote";
import { REGIONS } from "../src/lib/regions";

(globalThis as unknown as { React: typeof React }).React = React;

const card = (name: string, productType: string, cents: number, stores = 5): ProductCardData => ({
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  name,
  productType,
  setCode: "blb",
  imageUrl: null,
  lowestPriceCents: cents,
  inStockStores: stores,
  listedStores: stores + 2,
  marketplaceOpen: false,
  medianOpenCents: null,
  releaseDate: null,
});

function fixture(): HomeReport {
  const box = card("Bloomburrow Play Booster Box", "Play Booster Box", 14400, 30);
  const cbb = card("Bloomburrow Collector Booster Box", "Collector Booster Box", 30000, 12);
  return {
    region: "us",
    regions: REGION_LIST.map((r, i) => ({ region: r.region, products: 1000 + i, open: 700 + i, stores: 10 + i, cheapest: { "Play Booster Box": box, "Collector Booster Box": cbb, Bundle: null, "Commander Deck": null } })),
    ranges: [
      { type: "Play Booster Box", low: 14400, median: 16000, high: 40000, n: 40, top: [box], widest: box },
      { type: "Collector Booster Box", low: 30000, median: 34000, high: 90000, n: 20, top: [cbb], widest: cbb },
    ],
    wrap: emptyHomeReport().wrap,
    wrapCards: [],
  };
}

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ").replace(/\s+/g, " ");

test("market report: every number from the data, every product linked, no banned copy, an H2 per part", () => {
  const html = renderToStaticMarkup(React.createElement(MarketReport, { report: fixture() }));
  const t = text(html);
  assert.equal(findBannedCopy(t), null, findBannedCopy(t) ?? "");
  assert.match(t, /from \$144 to \$400; the middle price is \$160/);
  assert.match(html, /href="\/us\/p\/bloomburrow-play-booster-box"/);
  assert.match(html, /href="\/au\/p\/bloomburrow-play-booster-box"/, "each region's row links its own copy");
  assert.match(html, /href="\/uk\/guides\/mtg-booster-box-prices"/);
  assert.ok((html.match(/<h2/g) ?? []).length >= 4);
  assert.match(t, /Week-on-week moves need seven days/, "no history: says so, invents no move");
  assert.ok(t.split(" ").length > 700, `report words: ${t.split(" ").length}`);
});

test("market report: empty data renders nothing rather than invented numbers", () => {
  assert.equal(renderToStaticMarkup(React.createElement(MarketReport, { report: emptyHomeReport() })), "");
});

test("singles note: says the site is sealed only and links the sealed guides of its region", () => {
  const html = renderToStaticMarkup(React.createElement(SinglesNote, { r: REGIONS.ca }));
  assert.match(html, /Looking for MTG card prices\?/);
  for (const g of ["mtg-booster-box-prices", "collector-booster-box-prices", "commander-precon-price-guide"]) assert.match(html, new RegExp(`href="/ca/guides/${g}"`));
});

test("landing page metadata: the sealed queries first, title under 60 and description under 155 characters", () => {
  const page = readFileSync(new URL("../src/app/(site)/page.tsx", import.meta.url), "utf8");
  const title = /const TITLE = `([^`]+)`/.exec(page)![1].replace("${SITE_NAME}", "MTG Compare");
  const desc = /const DESCRIPTION = `([^`]+)`/.exec(page)![1].replace("${STORES.length}", "383");
  assert.ok(title.length < 60, title);
  assert.ok(desc.length < 155, `${desc.length}: ${desc}`);
  assert.match(title, /^MTG Booster Box/);
  const region = readFileSync(new URL("../src/app/[region]/page.tsx", import.meta.url), "utf8");
  assert.match(region, /loadHomeReport\(r\.region\)/, "the market report lives on each region home");
  assert.match(region, /<MarketReport report=\{report\} \/>/);
});
