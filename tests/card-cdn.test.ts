// /card/[slug] is ONE CDN copy per card for every market (DECISIONS.md, "One card page for every market", 2026-10-19), as on OP
// Compare (tests/card-isr.test.ts there): the page renders on the baseline market and reads no visitor; every market-dependent part
// is computed for all six markets on the server (lib/per-market.ts) and drawn by the client islands of components/card/CardMarket.tsx.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_COUNTRY, MARKETS, type Country } from "../src/lib/country";
import type { OfferRow } from "../src/lib/data";
import { boardModel } from "../src/lib/board-model";
import { thinHistory } from "../src/lib/chart";
import { perMarket, perMarketList, pickMarket, pickMarketList } from "../src/lib/per-market";
import { CDN_MARKET_SOURCES, CDN_SOURCES } from "../src/lib/data/plane/headers";
import { closure, importsOf } from "./helpers/import-graph";

const ROOT = path.resolve(__dirname, "..");
const PAGE = "src/app/card/[slug]/page.tsx";
const ISLANDS = "src/components/card/CardMarket.tsx";
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("one CDN copy: force-dynamic, no ISR, a market-neutral CDN source with no market rewrite", async () => {
  const src = read(PAGE);
  assert.match(src, /^export const dynamic = "force-dynamic";$/m);
  // ISR is billed per write (DECISIONS.md, 2026-10-17): the CDN copy pays the render only.
  assert.doesNotMatch(src, /^export const (revalidate|dynamicParams|fetchCache)\b|generateStaticParams/m);
  assert.ok(CDN_SOURCES.includes("/card/:slug") && !CDN_MARKET_SOURCES.includes("/card/:slug"));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const cfg = require(path.join(ROOT, "next.config.js")) as { headers: () => Promise<{ source: string; headers: { key: string; value: string }[]; has?: unknown }[]>; rewrites: () => Promise<{ beforeFiles: { source: string }[] }> };
  const rules = (await cfg.headers()).filter((h) => h.source === "/card/:slug" && h.headers.some((x) => x.key === "Vercel-CDN-Cache-Control"));
  assert.equal(rules.length, 1, "one unconditional CDN rule, not four per-market ones");
  assert.equal(rules[0]!.has, undefined);
  assert.deepEqual((await cfg.rewrites()).beforeFiles.filter((r) => r.source === "/card/:slug"), [], "no ?_mk rewrite: every market reads the same key");
});

test("the page reads no visitor and states the baseline market in its metadata and JSON-LD", () => {
  const src = code(read(PAGE));
  assert.doesNotMatch(src, /getCountry|get-country|next\/headers|cookies\(|headers\(/);
  assert.equal(DEFAULT_COUNTRY, "US");
  assert.match(src, /const BASELINE: Country = DEFAULT_COUNTRY;/);
  assert.match(src, /const co = COUNTRIES\[BASELINE\];/);
  assert.match(src, /const inBaseline = inMarketOf\(BASELINE\);/);
  assert.match(src, /ebayJsonLdOffers\(inBaseline, co\.currency, isoCountry\(BASELINE\)\)/);
  assert.match(src, /<JsonLd data=\{faqLd\(baselineFaqs\)\} \/>/);
  const meta = src.slice(src.indexOf("export async function generateMetadata"), src.indexOf("export default async function CardPage"));
  assert.match(meta, /lowUsCents: priced \? \(c\.low\.US \?\? null\) : null/, "the description quotes the US listing, as the cached HTML does");
});

test("every market-dependent part is an island fed by all markets' data; the one-market server components are gone", () => {
  const src = code(read(PAGE));
  for (const island of ["MarketTiles", "MarketLastKnown", "MarketBuyPair", "MarketTopBuy", "MarketAlertCta", "MarketNoListings", "MarketBoard", "MarketTcgReference", "MarketBanners", "MarketHistory", "MarketParagraphs", "MarketFaq", "MarketTable", "MarketEbayPanel", "MarketStickyBuyBar", "MarketPlace"]) {
    assert.match(src, new RegExp(`<${island}\\b`), island);
  }
  for (const gone of ["<PriceBoard", "<CardTopBuy", "<CardBuyPair", "<CardStickyBuyBar", "<PriceDropAlertCta", "<CardNoListings", "<TcgMarketPrice", "<EbayCardBanner", "<TcgplayerBanner", "<CardMarketsTable", "<EbayCardPanel", "<LineChart", "<LastKnownPrice"]) {
    assert.ok(!new RegExp(`${gone}[\\s/>]`).test(src), `${gone} renders one market on the server`);
  }
  assert.doesNotMatch(src, /country=\{country\}/);
  assert.doesNotMatch(src, /<CardTile[^>]*country=/, "tiles take the visitor's market from CountryProvider");
  assert.doesNotMatch(src, /<CardTile[^>]*card=\{s\}/, "tiles get tileCard(s), not a whole CardLite");
});

test("the islands are client code that never reaches the store registry, the loaders, the board model or the database", () => {
  assert.match(read(ISLANDS), /^"use client";/);
  const c = closure(path.join(ROOT, ISLANDS), ROOT);
  assert.equal(c.dbLeaf, false);
  // The one module of src/lib/data the islands reach is the eBay panel's crawler check (a pure user-agent test, no import): never a loader.
  const dataImports = [...c.files].flatMap((f) => importsOf(fs.readFileSync(f, "utf8")).filter((e) => !e.typeOnly && /(^@\/lib\/data|\/data)(\/|$)/.test(e.spec)).map((e) => e.spec));
  assert.deepEqual([...new Set(dataImports)], ["@/lib/data/plane/crawler"]);
  assert.equal(importsOf(read("src/lib/data/plane/crawler.ts")).length, 0);
  const files = [...c.files].map((f) => path.relative(ROOT, f).split(path.sep).join("/"));
  for (const f of ["src/lib/stores.ts", "src/lib/board-model.ts", "src/lib/board.ts", "src/lib/market-comparison.ts", "src/lib/markets-table.ts", "src/lib/quick-view.ts", "src/lib/match.ts"]) {
    assert.ok(!files.includes(f), `${ISLANDS} pulls ${f} into the browser bundle`);
  }
  assert.match(read(ISLANDS), /const useMarket = \(\): Country => useCountry\(\)\.country;/);
});

test("perMarket and perMarketList share identical values and fall back to the baseline", () => {
  const pm = perMarket((m) => (m === "UK" ? { p: 2 } : { p: 1 }));
  assert.equal(pm.values.length, 2);
  for (const m of MARKETS) assert.deepEqual(pickMarket(pm, m), m === "UK" ? { p: 2 } : { p: 1 });
  assert.deepEqual(perMarket(() => null).values, [null]);
  assert.deepEqual(pickMarket(pm, "XX" as Country), { p: 1 });
  const pl = perMarketList((m) => ["same opening", `price in ${m === "US" ? "the US" : "elsewhere"}`]);
  assert.equal(pl.pool.length, 3);
  assert.deepEqual(pickMarketList(pl, "AU"), ["same opening", "price in elsewhere"]);
});

const fresh = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
const offer = (o: Partial<OfferRow> & Pick<OfferRow, "source" | "market" | "priceCents">): OfferRow =>
  ({ currency: { US: "USD", AU: "AUD", UK: "GBP", SG: "SGD", CA: "CAD", EU: "EUR" }[o.market as Country], url: `https://shop.example/${o.source}`, inStock: true, condition: null, shippingCents: null, updatedAt: fresh, finish: "N", ...o }) as OfferRow;

test("boardModel: the rows PriceBoard drew, cheapest first, tagged on the server; empty flags left out; elsewhere only when nothing is open", () => {
  const offers = [
    offer({ source: "tcgplayer", market: "US", priceCents: 1200, url: "https://www.tcgplayer.com/product/1" }),
    offer({ source: "store:a", market: "US", priceCents: 1000, condition: "LP" }),
    offer({ source: "store:b", market: "US", priceCents: 950, inStock: false }),
    offer({ source: "store:c", market: "UK", priceCents: 700 }),
  ];
  const us = boardModel(offers, "US", { page: "card", ebayQuery: "Magic Sol Ring" });
  assert.deepEqual(us.rows.map((r) => [r.source, r.priceCents]), [["store:a", 1000], ["tcgplayer", 1200]]);
  assert.equal(us.rows[1]!.tcg, true);
  assert.equal(us.rows[0]!.tcg, undefined, "empty flags are left out of the payload");
  assert.deepEqual(us.sold.map((s) => s.source), ["store:b"]);
  assert.deepEqual(us.elsewhere, [], "only an empty board lists the other markets");
  assert.match(us.ebaySearch, /^https:\/\/www\.ebay\.com\/sch\//, "the US board searches eBay US");
  assert.match(boardModel(offers, "UK", { page: "card", ebayQuery: "x" }).ebaySearch, /ebay\.co\.uk/);
  const sg = boardModel(offers, "SG", { page: "card", ebayQuery: "x" });
  assert.equal(sg.rows.length, 0);
  assert.deepEqual(sg.elsewhere.map((e) => e.m).sort(), ["UK", "US"]);
});

test("thinHistory: every day of the last 90, one per week before, the newest day kept", () => {
  const days = Array.from({ length: 365 }, (_, i) => ({ day: new Date(Date.UTC(2025, 9, 20) + i * 86_400_000).toISOString().slice(0, 10) }));
  const t = thinHistory(days);
  assert.deepEqual(t.slice(-90), days.slice(-90));
  assert.ok(t.length > 90 + 35 && t.length < 90 + 55, String(t.length));
  assert.equal(new Set(t.map((d) => d.day)).size, t.length);
  assert.deepEqual(thinHistory(days.slice(0, 40)), days.slice(0, 40));
});
