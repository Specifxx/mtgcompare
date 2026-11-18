import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  INDEX_GROWTH,
  INDEX_START,
  MIN_INDEX_CENTS,
  cardIndexable,
  cardSlug,
  cardTitle,
  cardValue,
  cardsOfGroup,
  mergeSet,
  numberOrder,
  releaseForIndexing,
  searchCards,
  skipGroup,
  slugify,
  type CardCandidate,
  type CardRow,
  type SearchRow,
} from "../src/lib/cards";
import { CARDS_PER_SITEMAP, CARDS_SITEMAP_ID, CARD_SITEMAP_FILES, SITEMAP_IDS, cardsSitemap } from "../src/lib/sitemap";

// Card prices, every card (DECISIONS.md, 2026-11-17 "Card prices: every card").

const cand = (id: number, cents: number | null, extra: Partial<CardCandidate> = {}): CardCandidate => ({
  id,
  n: `Card ${id}`,
  no: String(id),
  r: "M",
  p: [cents, null, null],
  ...extra,
});
const row = (id: number, cents: number | null, ix: 0 | 1 = 0): CardRow => ({ id, s: `card-${id}`, n: `Card ${id}`, no: String(id), r: "M", p: [cents, null, null], ix, since: "2026-11-17" });

// ─── The import's pure parts ───────────────────────────────────────────────────

test("mergeSet keeps every card's slug, release and first day by id; a new card gets a fresh slug, unreleased", () => {
  const prev = [{ ...row(1, 500, 1), s: "kept-slug", since: "2026-11-01" }];
  const out = mergeSet(prev, [cand(1, 900, { n: "Renamed" }), cand(2, 300)], "2026-11-18");
  const one = out.find((c) => c.id === 1)!;
  assert.equal(one.s, "kept-slug");
  assert.equal(one.ix, 1);
  assert.equal(one.since, "2026-11-01");
  assert.equal(one.n, "Renamed");
  assert.deepEqual(one.p, [900, null, null]);
  const two = out.find((c) => c.id === 2)!;
  assert.equal(two.s, "card-2-2");
  assert.equal(two.ix, 0);
  assert.equal(two.since, "2026-11-18");
});

test("two printings with the same name and number never share a URL; a new card cannot take an old slug", () => {
  const out = mergeSet([], [cand(10, 1, { n: "Island", no: "250" }), cand(11, 1, { n: "Island", no: "250" })], "d");
  assert.deepEqual(out.map((c) => c.s), ["island-250", "island-250-11"]);
  const next = mergeSet([{ ...row(99, 1), s: "island-250" }], [cand(99, 1, { n: "Other" }), cand(10, 1, { n: "Island", no: "250" })], "d");
  assert.equal(next.find((c) => c.id === 99)!.s, "island-250");
  assert.equal(next.find((c) => c.id === 10)!.s, "island-250-10");
  assert.equal(cardSlug("Æther Vial", "★12", new Set(), 5), "aether-vial-12");
  assert.equal(slugify("Urza's Saga"), "urzas-saga");
});

test("collector numbers sort as numbers: 2, 10, 10a, then letters", () => {
  assert.deepEqual(["10a", "S1", "10", "2"].sort(numberOrder), ["2", "10", "10a", "S1"]);
});

test("the release to Google: INDEX_START first, then INDEX_GROWTH a day by value, US$1 and up, 0 pauses", () => {
  const all = Array.from({ length: INDEX_START + 1200 }, (_, i) => row(i + 1, 100 + i));
  all.push(row(999_999, 99));
  assert.equal(releaseForIndexing(all, INDEX_GROWTH), INDEX_START);
  assert.ok(all.filter((c) => c.ix).every((c) => cardValue(c.p)! >= 1300), "the most valuable first");
  assert.equal(releaseForIndexing(all, INDEX_GROWTH), INDEX_GROWTH);
  assert.equal(releaseForIndexing(all, 0), 0);
  assert.equal(releaseForIndexing(all, INDEX_GROWTH), INDEX_GROWTH);
  assert.equal(all.find((c) => c.id === 999_999)!.ix, 0, "never under MIN_INDEX_CENTS");
  assert.equal(releaseForIndexing(all, INDEX_GROWTH), all.length - 1 - INDEX_START - 2 * INDEX_GROWTH, "the last 200");
});

test("the first release tops the 1,000 legacy cards up to INDEX_START; a card under US$1 loses its release", () => {
  const all = [...Array.from({ length: 1000 }, (_, i) => row(i + 1, 5000, 1)), ...Array.from({ length: 3000 }, (_, i) => row(5000 + i, 200))];
  assert.equal(releaseForIndexing(all, INDEX_GROWTH), INDEX_START - 1000);
  all[0].p = [50, null, null];
  releaseForIndexing(all, 0);
  assert.equal(all[0].ix, 0);
  assert.equal(cardIndexable(all[0]), false);
  assert.equal(cardIndexable(row(1, MIN_INDEX_CENTS, 1)), true);
  assert.equal(cardIndexable(row(1, MIN_INDEX_CENTS, 0)), false);
});

test("cardsOfGroup keeps cards (Pack Rat included) with each finish's market price, never tokens or sealed products", () => {
  const ext = (number: string | null, rarity: string | null) => [...(number ? [{ name: "Number", value: number }] : []), ...(rarity ? [{ name: "Rarity", value: rarity }] : [])];
  const products = [
    { productId: 1, name: "Pack Rat", extendedData: ext("203", "R") },
    { productId: 2, name: "Foundations Play Booster Box", extendedData: [] },
    { productId: 3, name: "Goblin Token", extendedData: ext("T1", "T") },
    { productId: 4, name: "Sol Ring (Foil Etched)", extendedData: ext("400", "U") },
    { productId: 5, name: "Ajani Emblem", extendedData: ext("E1", "C") },
  ];
  const prices = [
    { productId: 1, marketPrice: 1.5, subTypeName: "Normal" },
    { productId: 1, marketPrice: 3.25, subTypeName: "Foil" },
    { productId: 4, marketPrice: 12, subTypeName: "Foil Etched" },
    { productId: 2, marketPrice: 120, subTypeName: "Normal" },
  ];
  const out = cardsOfGroup(products, prices);
  assert.deepEqual(out.map((c) => c.id), [1, 4]);
  assert.deepEqual(out[0].p, [150, 325, null]);
  assert.deepEqual(out[1].p, [null, null, 1200]);
  assert.equal(skipGroup({ name: "Foundations Art Series" }), true);
  assert.equal(skipGroup({ name: "Duskmourn Tokens" }), true);
  assert.equal(skipGroup({ name: "Foundations" }), false);
});

test("the title fits 60 characters with the site's suffix and keeps the name and number", () => {
  const long = cardTitle({ n: "Atraxa, Grand Unifier (Borderless)", no: "196" }, { name: "Phyrexia: All Will Be One", abbr: "ONE" });
  assert.ok(long.length + " | MTG Compare".length <= 60, long);
  assert.match(long, /Atraxa, Grand Unifier \(Borderless\)/);
  assert.match(long, /196/);
  const huge = "Atraxa, Grand Unifier (Borderless) (Step-and-Compleat Foil)";
  assert.equal(cardTitle({ n: huge, no: "196" }, { name: "x", abbr: "ONE" }), huge, "the name is never cut");
  const short = cardTitle({ n: "Sol Ring", no: "1" }, { name: "Foundations", abbr: "FDN" });
  assert.match(short, /Sol Ring/);
  assert.match(short, /1/);
});

// ─── Search ────────────────────────────────────────────────────────────────────

const SETS = new Map([
  ["phyrexia-all-will-be-one", { name: "Phyrexia: All Will Be One", abbr: "ONE" }],
  ["foundations", { name: "Foundations", abbr: "FDN" }],
  ["dominaria-united", { name: "Dominaria United", abbr: "DMU" }],
]);
const ROWS: SearchRow[] = [
  ["the-lord-of-the-rings", "the-one-ring-246", "The One Ring", "246", 8000, 1, 7],
  ["phyrexia-all-will-be-one", "bring-the-ending-44", "Bring the Ending", "44", 34, 0, 8],
  ["foundations", "llanowar-elves-227", "Llanowar Elves", "227", 30, 0, 1],
  ["foundations", "llanowar-elves-showcase-401", "Llanowar Elves (Showcase)", "401", 900, 1, 2],
  ["dominaria-united", "llanowar-elves-168", "Llanowar Elves", "168", 25, 0, 3],
  ["dominaria-united", "sheoldred-the-apocalypse-107", "Sheoldred, the Apocalypse", "107", 7500, 1, 4],
  ["dominaria-united", "sheoldred-the-apocalypse-415", "Sheoldred, the Apocalypse (Borderless)", "415", 9900, 1, 5],
  ["foundations", "elvish-archdruid-219", "Elvish Archdruid", "219", 50, 0, 6],
];
const ids = (q: string) => searchCards(ROWS, SETS, q).hits.map((h) => h.id);

test("search by name: the exact name first, then the most valuable", () => {
  assert.deepEqual(ids("llanowar elves").slice(0, 2).sort(), [1, 3]);
  assert.equal(ids("llanowar elves")[2], 2);
  assert.deepEqual(ids("LLANOWAR"), [2, 1, 3]);
  assert.deepEqual(ids("sheoldred"), [5, 4]);
  assert.deepEqual(ids("apocalypse sheoldred").sort(), [4, 5]);
});

test("search by set code and collector number, in any order and spelling", () => {
  for (const q of ["FDN 227", "fdn #227", "227 fdn", "FDN 227/281", "#227 FDN"]) assert.deepEqual(ids(q), [1], q);
  assert.deepEqual(ids("sheoldred 415"), [5]);
  assert.deepEqual(ids("llanowar dmu"), [3]);
  assert.deepEqual(ids("DMU"), [5, 4, 3]);
});

test("a set code that is also a name word does not hijack a card name", () => {
  assert.deepEqual(ids("the one ring"), [7]);
  assert.deepEqual(ids("ONE 44"), [8]);
  assert.deepEqual(ids("bring one"), [8]);
});

test("search by name and set words", () => {
  assert.deepEqual(ids("llanowar dominaria"), [3]);
  assert.deepEqual(ids("sheoldred dominaria united").sort(), [4, 5]);
});

test("search: a query under two characters or with no match returns nothing", () => {
  assert.deepEqual(ids("l"), []);
  assert.deepEqual(ids(""), []);
  assert.deepEqual(ids("zzzz qqqq"), []);
  assert.deepEqual(ids("FDN 999"), []);
  assert.equal(searchCards(ROWS, SETS, "llanowar", 1).total, 3);
});

// ─── Sitemaps ──────────────────────────────────────────────────────────────────

test("card sitemaps: the hub and released sets first, then released cards in files of CARDS_PER_SITEMAP", () => {
  assert.ok(SITEMAP_IDS.some((s) => s.id === CARDS_SITEMAP_ID + CARD_SITEMAP_FILES));
  const sets = [
    { slug: "a", indexed: CARDS_PER_SITEMAP - 1 },
    { slug: "b", indexed: 3 },
    { slug: "c", indexed: 0 },
  ];
  const released = (s: string) => (s === "a" ? Array.from({ length: CARDS_PER_SITEMAP - 1 }, (_, i) => `a${i}`) : s === "b" ? ["b0", "b1", "b2"] : []);
  const hub = cardsSitemap(CARDS_SITEMAP_ID, sets, released, null).map((u) => u.url);
  assert.ok(hub[0].endsWith("/card-prices"));
  assert.ok(hub.some((u) => u.endsWith("/card-prices/b")));
  assert.ok(!hub.some((u) => u.endsWith("/card-prices/c")), "a set with nothing released is not listed");
  const f1 = cardsSitemap(CARDS_SITEMAP_ID + 1, sets, released, null).map((u) => u.url);
  const f2 = cardsSitemap(CARDS_SITEMAP_ID + 2, sets, released, null).map((u) => u.url);
  assert.equal(f1.length, CARDS_PER_SITEMAP);
  assert.ok(f1.at(-1)!.endsWith("/card-prices/b/b0"));
  assert.deepEqual(f2.map((u) => u.split("/").pop()), ["b1", "b2"]);
  assert.deepEqual(cardsSitemap(CARDS_SITEMAP_ID + 3, sets, released, null), []);
  assert.deepEqual(cardsSitemap(CARDS_SITEMAP_ID, [], released, null), []);
});

// ─── Source rules ──────────────────────────────────────────────────────────────

const PAGES = [
  "src/app/(site)/card-prices/page.tsx",
  "src/app/(site)/card-prices/[set]/page.tsx",
  "src/app/(site)/card-prices/[set]/[card]/page.tsx",
  "src/app/(site)/card-prices/search/page.tsx",
  "src/app/api/cards/search/route.ts",
];

test("card pages read no request data, no database, and are cached by the CDN", () => {
  for (const f of PAGES) {
    const src = fs.readFileSync(f, "utf8");
    assert.match(src, /dynamic = "force-dynamic"/, f);
    assert.doesNotMatch(src, /cookies\(|headers\(|getCountry|revalidate =|prisma|@\/lib\/db"/, f);
  }
  const cfg = fs.readFileSync("next.config.js", "utf8");
  assert.match(cfg, /"\/card-prices\/:path\*"/);
  assert.match(cfg, /data\/cards\/\*\*/, "every card file is traced into the functions");
});

test("the card import never calls eBay or a database, and the workflow never deploys", () => {
  const src = fs.readFileSync("scripts/card-import.ts", "utf8");
  assert.doesNotMatch(src, /ebay\.com|EBAY_|prisma|DATABASE_URL/i);
  const wf = fs.readFileSync(".github/workflows/card-prices.yml", "utf8");
  assert.doesNotMatch(wf, /git commit[^\n]*\[deploy/i);
  assert.doesNotMatch(wf, /EBAY_|DATABASE_URL/);
});

// ─── Rendering, against tests/fixtures/cards/ ──────────────────────────────────

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
(globalThis as unknown as { React: typeof React }).React = React;
process.env.MTG_CARDS_DIR = "tests/fixtures/cards";

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

test("a card page: one h1, eBay first then TCGplayer, tagged and sponsored, TCGplayer's market price, its set's sealed page", async () => {
  const mod = await import("../src/app/(site)/card-prices/[set]/[card]/page");
  const params = { set: "foundations", card: "fixture-mythic-101" };
  const html = render(mod.default({ params }) as React.ReactElement);
  assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1);
  assert.match(html, /Fixture Mythic/);
  assert.match(html, /US\$61\.00/);
  assert.match(html, /US\$42\.50/);
  const ebay = html.indexOf("Check on eBay");
  const tcg = html.indexOf("View on TCGplayer");
  assert.ok(ebay > 0 && tcg > ebay, "eBay row first");
  assert.match(html, /campid=5339155912/);
  assert.match(html, /\/out\/tcgplayer\?u=[^"]*product%2F1001/);
  assert.match(html, /rel="sponsored nofollow noopener noreferrer"/);
  assert.match(html, /href="\/us\/sets\/fdn"|href="\/us\/sets\/foundations"/);
  assert.match(html, /href="\/card-prices\/foundations\/fixture-rare-202"/, "next card by number");
  const meta = mod.generateMetadata({ params });
  assert.ok(String(meta.title).length + " | MTG Compare".length <= 60);
  assert.equal(meta.alternates?.canonical, "https://mtgcompare.app/card-prices/foundations/fixture-mythic-101");
  assert.equal(meta.robots, undefined, "a released card is indexable");
  const low = mod.generateMetadata({ params: { set: "foundations", card: "fixture-rare-202" } });
  assert.deepEqual(low.robots, { index: false, follow: true }, "not released yet: noindex");
});

test("a card with no recent sale says so and claims no price; a promo set has no sealed link", async () => {
  const mod = await import("../src/app/(site)/card-prices/[set]/[card]/page");
  const html = render(mod.default({ params: { set: "foundations", card: "pack-rat-203" } }) as React.ReactElement);
  assert.match(html, /No recent TCGplayer sales/);
  assert.match(html, /Check on eBay/);
  const promo = render(mod.default({ params: { set: "fnm-promos", card: "fixture-promo-7" } }) as React.ReactElement);
  assert.doesNotMatch(promo, /href="\/us\/sets\//);
});

test("an unknown card of a known set redirects to the set's list; an unknown set is a 404", async () => {
  const mod = await import("../src/app/(site)/card-prices/[set]/[card]/page");
  const digest = (e: unknown) => `${(e as Error).message ?? ""} ${(e as { digest?: string }).digest ?? ""}`;
  assert.throws(() => mod.default({ params: { set: "foundations", card: "gone-1" } }), (e) => /NEXT_REDIRECT/.test(digest(e)));
  assert.throws(() => mod.default({ params: { set: "no-such-set", card: "x" } }), (e) => /NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK/.test(digest(e)));
  assert.throws(() => mod.default({ params: { set: "../etc", card: "x" } }), (e) => /NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK/.test(digest(e)));
});

test("the set list shows every card in number order; a set with nothing released is noindex; the hub lists the sets", async () => {
  const set = await import("../src/app/(site)/card-prices/[set]/page");
  const html = render(set.default({ params: { set: "foundations" } }) as React.ReactElement);
  const a = html.indexOf('href="/card-prices/foundations/fixture-mythic-101"');
  const b = html.lastIndexOf('href="/card-prices/foundations/fixture-rare-202"');
  const c = html.lastIndexOf('href="/card-prices/foundations/pack-rat-203"');
  assert.ok(a > 0 && b > a && c > b, "number order");
  assert.equal(set.generateMetadata({ params: { set: "foundations" } }).robots, undefined);
  assert.deepEqual(set.generateMetadata({ params: { set: "fnm-promos" } }).robots, { index: false, follow: true });
  const nf = (e: unknown) => /NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK/.test(`${(e as Error).message ?? ""} ${(e as { digest?: string }).digest ?? ""}`);
  assert.throws(() => set.default({ params: { set: "foundations" }, searchParams: { page: "2" } }), nf, "past the last page: 404");
  assert.throws(() => set.default({ params: { set: "foundations" }, searchParams: { page: "x" } }), nf);
  assert.doesNotMatch(html, /aria-label="Pages"/, "one page: no page links");
  const hub = await import("../src/app/(site)/card-prices/page");
  const h = render(hub.default() as React.ReactElement);
  assert.match(h, /href="\/card-prices\/foundations"/);
  assert.match(h, /href="\/card-prices\/fnm-promos"/);
  assert.match(h, /action="\/card-prices\/search"/);
});

test("the search page and the typeahead route answer from the index", async () => {
  const page = await import("../src/app/(site)/card-prices/search/page");
  const html = render(page.default({ searchParams: { q: "FDN 202" } }) as React.ReactElement);
  assert.match(html, /href="\/card-prices\/foundations\/fixture-rare-202"/);
  assert.doesNotMatch(html, /fixture-mythic-101"/);
  assert.deepEqual(page.metadata.robots, { index: false, follow: true });
  const route = await import("../src/app/api/cards/search/route");
  const res = route.GET(new Request("https://mtgcompare.app/api/cards/search?q=fixture"));
  const body = (await res.json()) as { hits: { s: string; setName: string; id: number }[] };
  assert.ok(body.hits.length > 0 && body.hits.length <= 6);
  assert.equal(body.hits[0].s, "fixture-mythic-101", "the most valuable first");
  assert.equal(body.hits[0].setName, "Foundations");
  assert.equal(body.hits[0].id, 1001);
  assert.match(res.headers.get("Vercel-CDN-Cache-Control") ?? "", /s-maxage=21600/);
});

test("new sets go to Google first: a new or upcoming sealed set and its Commander/promo groups, outside the daily step", async () => {
  const { freshSets } = await import("../src/lib/cards");
  const sets = [
    { slug: "star-trek", name: "Star Trek", released: "2026-11-13", sealed: "trk" },
    { slug: "commander-star-trek", name: "Commander: Star Trek", released: "2026-11-13", sealed: null },
    { slug: "nauctis", name: "Nauctis: The Sunken Realm", released: "2027-02-05", sealed: "nau" },
    { slug: "fnm-promos", name: "FNM Promos", released: "2026-11-17", sealed: null },
    { slug: "foundations", name: "Foundations", released: "2024-11-15", sealed: "fdn" },
  ];
  assert.deepEqual([...freshSets(sets, "2026-11-18")].sort(), ["commander-star-trek", "nauctis", "star-trek"]);
  const old = Array.from({ length: INDEX_START }, (_, i) => row(i + 1, 5000, 1));
  const fresh = [row(90_001, 150), row(90_002, 99), row(90_003, 400)];
  const all = [...old, ...fresh, row(80_000, 9000)];
  assert.equal(releaseForIndexing(all, 0, new Set(fresh)), 2, "both new-set cards at US$1+ even with the step paused");
  assert.deepEqual(fresh.map((c) => c.ix), [1, 0, 1]);
  assert.equal(all.at(-1)!.ix, 0, "an old card still waits for the daily step");
});
