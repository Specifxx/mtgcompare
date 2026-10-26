// The "Coming soon" block (lib/coming-soon.ts, components/ComingSoon.tsx): the next set by sets.ts dates, its headline products'
// cheapest open store pre-order in a region, an honest line when no store has opened one, gone on release day.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ComingSoon } from "../src/components/ComingSoon";
import { daysUntil, featuredFor, featuredItems, nextUpcomingSet } from "../src/lib/coming-soon";
import { REGIONS } from "../src/lib/regions";

(globalThis as unknown as { React: typeof React }).React = React;

const NOW = Date.parse("2026-10-26T12:00:00Z");
const seen = new Date(NOW - 3600_000).toISOString();
const offer = (store: string, priceCents: number, inStock = true, marketplace = false) => ({ store, storeName: store, priceCents, inStock, lastSeen: seen, marketplace });
const group = (slug: string, name: string, productType: string, offers: ReturnType<typeof offer>[]) => ({ product: { slug, name, productType, setCode: "trk" }, offers });

const GROUPS = [
  group("star-trek-play-booster-box", "Star Trek Play Booster Box", "Play Booster Box", [offer("a", 16000), offer("b", 15500), offer("c", 14000, false)]),
  group("star-trek-bundle", "Star Trek Bundle", "Bundle", [offer("tcgplayer", 5000, true, true), offer("a", 6500)]),
  group("ff", "Star Trek Commander Deck - Federation Fleet", "Commander Deck", [offer("a", 7000), offer("b", 6900)]),
  group("borg", "Star Trek Commander Deck - We Are the Borg", "Commander Deck", [offer("c", 6800)]),
  group("borg-ce", "Star Trek Commander Deck - We Are the Borg (Collector's Edition)", "Commander Deck", [offer("a", 15000, false)]),
  group("pack", "Star Trek Play Booster Pack", "Play Booster Pack", [offer("a", 700)]),
];

test("the next set is the soonest after today, by sets.ts dates; on its release day the next one (or none)", () => {
  assert.equal(nextUpcomingSet("2026-10-26")?.code, "trk");
  assert.notEqual(nextUpcomingSet("2026-11-13")?.code, "trk");
  assert.equal(daysUntil("2026-11-13", "2026-10-26"), 18);
});

test("selection: cheapest open STORE pre-order per headline type, stores counted, Commander decks as one line", () => {
  const items = featuredItems(GROUPS, "US", "trk", NOW);
  assert.deepEqual(items.map((i) => i.type), ["play-booster-box", "bundle", "commander-deck"], "only headline types with an open store pre-order");
  const box = items[0];
  assert.equal(box.cents, 15500);
  assert.equal(box.stores, 2, "the sold-out store is not taking pre-orders");
  assert.equal(box.slug, "star-trek-play-booster-box");
  const bundle = items[1];
  assert.equal(bundle.cents, 6500, "TCGplayer is a marketplace, never the cheapest store");
  assert.equal(bundle.msrpCents, 6999, "US MSRP from rrp.ts");
  assert.equal(box.msrpCents, null, "no MSRP rrp.ts lacks");
  const deck = items[2];
  assert.equal(deck.cents, 6800);
  assert.equal(deck.deckName, "Star Trek Commander Deck - We Are the Borg");
  assert.equal(deck.decks, 2, "the sold-out Collector's Edition is not open");
  assert.equal(deck.stores, 3);
  assert.equal(featuredItems(GROUPS, "AU", "trk", NOW)[1].msrpCents, null, "MSRP is US only");
});

test("render: name, date, days to go, prices linking each product page, and the hub link", () => {
  const f = featuredFor(REGIONS.us, GROUPS, "2026-10-26", NOW);
  const html = renderToStaticMarkup(React.createElement(ComingSoon, { featured: f, r: REGIONS.us, today: "2026-10-26" }));
  assert.match(html, /Star Trek/);
  assert.match(html, /13 November 2026/);
  assert.match(html, /out in 18 days/);
  assert.match(html, /href="\/us\/p\/star-trek-play-booster-box"/);
  assert.match(html, /\$155/);
  assert.match(html, /pre-order at 2 stores/);
  assert.match(html, /US MSRP \$69\.99/);
  assert.match(html, /href="\/us\/preorders\/star-trek"/);
  assert.match(html, /See every store/);
});

test("an empty region says so and still links the hub", () => {
  const f = featuredFor(REGIONS.sg, [], "2026-10-26", NOW);
  const html = renderToStaticMarkup(React.createElement(ComingSoon, { featured: f, r: REGIONS.sg, today: "2026-10-26" }));
  assert.match(html, /No store we track has opened pre-orders in Singapore yet/);
  assert.match(html, /href="\/sg\/preorders\/star-trek"/);
  assert.doesNotMatch(html, /data-coming-soon-item/);
});

test("hidden on and after release day", () => {
  const f = featuredFor(REGIONS.us, GROUPS, "2026-10-26", NOW);
  assert.equal(renderToStaticMarkup(React.createElement(ComingSoon, { featured: f, r: REGIONS.us, today: "2026-11-13" })), "");
  const later = featuredFor(REGIONS.us, GROUPS, "2026-11-13", NOW);
  assert.notEqual(later?.set.code, "trk");
});
