import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { CEILING, DAILY_GROWTH, MIN_VALUE_CENTS, START_CARDS, cardIndexable, cardSlug, cardTitle, cardsOfGroup, selectCards, targetSize, type CardCandidate, type CardRow } from "../src/lib/cards";
import { cardsSitemap, CARDS_SITEMAP_ID, SITEMAP_IDS } from "../src/lib/sitemap";

// Card prices (DECISIONS.md, 2026-11-17 "Card prices: the most valuable cards of each set").

const cand = (id: number, cents: number, extra: Partial<CardCandidate> = {}): CardCandidate => ({
  id,
  name: `Card ${id}`,
  number: String(id),
  rarity: "M",
  set: "fdn",
  imageUrl: null,
  url: `https://www.tcgplayer.com/product/${id}`,
  normal: cents,
  foil: null,
  etched: null,
  ...extra,
});

test("the list starts at START_CARDS, grows DAILY_GROWTH a day and stops at CEILING", () => {
  assert.equal(targetSize(0), START_CARDS);
  assert.equal(targetSize(START_CARDS), START_CARDS + DAILY_GROWTH);
  assert.equal(targetSize(CEILING), CEILING);
  assert.equal(targetSize(CEILING - 10), CEILING);
});

test("only cards at the value gate are added, most valuable first", () => {
  const today = [cand(1, 499), cand(2, 500), cand(3, 9000), cand(4, 120)];
  const out = selectCards([], today, "2026-11-18");
  assert.deepEqual(out.map((c) => c.id), [3, 2]);
  assert.ok(out.every((c) => c.since === "2026-11-18"));
});

test("a card keeps its page, slug and first day after it falls under the gate; then it is noindex", () => {
  const first = selectCards([], [cand(1, 800)], "2026-11-18");
  const next = selectCards(first, [cand(1, 300, { name: "Renamed" })], "2026-11-19");
  assert.equal(next.length, 1);
  assert.equal(next[0].slug, first[0].slug);
  assert.equal(next[0].since, "2026-11-18");
  assert.equal(cardIndexable(next[0]), false);
});

test("a day adds at most DAILY_GROWTH new cards once the list exists", () => {
  const prev: CardRow[] = Array.from({ length: START_CARDS }, (_, i) => ({ ...cand(i + 1, 1000), slug: `card-${i + 1}`, since: "2026-11-18" }));
  const today = [...prev.map(({ slug: _s, since: _d, ...c }) => c), ...Array.from({ length: 500 }, (_, i) => cand(10_000 + i, 2000))];
  const out = selectCards(prev, today, "2026-11-19");
  assert.equal(out.length, START_CARDS + DAILY_GROWTH);
});

test("two printings never share a slug; the number is in it", () => {
  const taken = new Set<string>();
  const a = cardSlug("Sheoldred, the Apocalypse", "107", taken, 1);
  taken.add(a);
  assert.equal(a, "sheoldred-the-apocalypse-107");
  assert.equal(cardSlug("Sheoldred, the Apocalypse", "107", taken, 2), "sheoldred-the-apocalypse-107-2");
});

test("cardsOfGroup keeps numbered cards with a market price, never tokens or sealed", () => {
  const products = [
    { productId: 1, name: "Sheoldred, the Apocalypse", url: "u1", extendedData: [{ name: "Number", value: "107" }, { name: "Rarity", value: "M" }] },
    { productId: 2, name: "Soldier Token", url: "u2", extendedData: [{ name: "Number", value: "T1" }, { name: "Rarity", value: "T" }] },
    { productId: 3, name: "Play Booster Box", url: "u3" },
    { productId: 4, name: "No Sales Yet", url: "u4", extendedData: [{ name: "Number", value: "9" }] },
  ];
  const prices = [
    { productId: 1, marketPrice: 71.5, subTypeName: "Normal" },
    { productId: 1, marketPrice: 90.25, subTypeName: "Foil" },
    { productId: 2, marketPrice: 9, subTypeName: "Normal" },
    { productId: 3, marketPrice: 140, subTypeName: "Normal" },
    { productId: 4, marketPrice: null, subTypeName: "Normal" },
  ];
  const out = cardsOfGroup("dmu", products, prices);
  assert.equal(out.length, 1);
  assert.equal(out[0].normal, 7150);
  assert.equal(out[0].foil, 9025);
});

test("the title fits 60 characters with the site's suffix and keeps the name and number", () => {
  const long = cardTitle({ name: "Atraxa, Grand Unifier", number: "196", set: "one" }, "Phyrexia: All Will Be One");
  assert.ok(long.length + " | MTG Compare".length <= 60, long);
  assert.match(long, /Atraxa, Grand Unifier/);
  assert.match(long, /#196/);
});

test("the cards sitemap lists only cards at the gate, under their set's slug", () => {
  const rows = [
    { set: "fdn", slug: "a-1", normal: MIN_VALUE_CENTS, foil: null, etched: null },
    { set: "fdn", slug: "b-2", normal: 100, foil: null, etched: null },
  ];
  const urls = cardsSitemap(rows, "2026-11-18T19:00:00Z", (c) => (c === "fdn" ? "foundations" : undefined)).map((u) => u.url);
  assert.ok(urls.some((u) => u.endsWith("/card-prices/foundations/a-1")));
  assert.ok(!urls.some((u) => u.endsWith("/b-2")));
  assert.ok(SITEMAP_IDS.some((s) => s.id === CARDS_SITEMAP_ID));
  assert.deepEqual(cardsSitemap([], null, () => "x"), []);
});

test("card pages read no request data and are cached by the CDN", () => {
  for (const f of ["src/app/(site)/card-prices/page.tsx", "src/app/(site)/card-prices/[set]/page.tsx", "src/app/(site)/card-prices/[set]/[card]/page.tsx"]) {
    const src = fs.readFileSync(f, "utf8");
    assert.match(src, /dynamic = "force-dynamic"/);
    assert.doesNotMatch(src, /cookies\(|headers\(|getCountry|revalidate =/);
  }
  assert.match(fs.readFileSync("next.config.js", "utf8"), /"\/card-prices\/:path\*"/);
});

test("the card import never calls eBay and the workflow never deploys", () => {
  const src = fs.readFileSync("scripts/card-import.ts", "utf8");
  assert.doesNotMatch(src, /ebay\.com|EBAY_|ebay-/i);
  const wf = fs.readFileSync(".github/workflows/card-prices.yml", "utf8");
  assert.doesNotMatch(wf, /git commit[^\n]*\[deploy/i);
  assert.doesNotMatch(wf, /EBAY_/);
});

// ─── Rendering, against tests/fixtures/cards.json ────────────────────────────

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
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

test("a card page: one h1, eBay first then TCGplayer, tagged and sponsored, the price is TCGplayer's market price", async () => {
  process.env.MTG_CARDS_FILE = "tests/fixtures/cards.json";
  process.env.PUBLIC_DATA_MODE = "files";
  const mod = await import("../src/app/(site)/card-prices/[set]/[card]/page");
  const params = { set: "foundations", card: "fixture-mythic-101" };
  const html = render(mod.default({ params }) as React.ReactElement);
  assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1);
  assert.match(html, /Fixture Mythic price/);
  assert.match(html, /US\$61\.00/);
  const ebay = html.indexOf("Check on eBay");
  const tcg = html.indexOf("View on TCGplayer");
  assert.ok(ebay > 0 && tcg > ebay, "eBay row first");
  assert.match(html, /campid=5339155912/);
  assert.match(html, /\/out\/tcgplayer\?u=/);
  assert.match(html, /rel="sponsored nofollow noopener noreferrer"/);
  assert.match(html, /href="\/us\/sets\/foundations"/);
  const meta = mod.generateMetadata({ params });
  assert.ok(String(meta.title).length + " | MTG Compare".length <= 60);
  assert.equal(meta.robots, undefined, "a card at the gate is indexable");
  const low = mod.generateMetadata({ params: { set: "foundations", card: "fixture-rare-202" } });
  assert.deepEqual(low.robots, { index: false, follow: true }, "under US$5: noindex");
});

test("an unknown card of a known set redirects to the set's list; an unknown set is a 404", async () => {
  const mod = await import("../src/app/(site)/card-prices/[set]/[card]/page");
  assert.throws(() => mod.default({ params: { set: "foundations", card: "gone-1" } }), (e: Error) => /NEXT_REDIRECT/.test(e.message ?? String(e)) || /NEXT_REDIRECT/.test((e as { digest?: string }).digest ?? ""));
  assert.throws(() => mod.default({ params: { set: "no-such-set", card: "x" } }), (e: Error) => /NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK/.test(`${e.message} ${(e as { digest?: string }).digest ?? ""}`));
});

test("the set list and the hub render with the cards", async () => {
  const set = await import("../src/app/(site)/card-prices/[set]/page");
  const html = render(set.default({ params: { set: "foundations" } }) as React.ReactElement);
  assert.match(html, /href="\/card-prices\/foundations\/fixture-mythic-101"/);
  const hub = await import("../src/app/(site)/card-prices/page");
  assert.match(render(hub.default() as React.ReactElement), /href="\/card-prices\/foundations"/);
});
