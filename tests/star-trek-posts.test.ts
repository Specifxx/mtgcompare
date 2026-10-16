// The two Star Trek release posts of 2026-10-14 (src/lib/blog/posts/star-trek-where-to-buy.tsx, star-trek-spoilers.tsx): built
// from the release's catalogue rows that lib/blog/context.ts loads (PostContext.releases), with no price typed and Wizards' US
// MSRP named only with its source; graceful when the catalogue holds nothing yet; switched to their released copy from release
// day. Rendered to markup here so the sentences are read as a visitor reads them. The three posts of 2026-10-16 are
// tests/star-trek-guides.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { POSTS, postHref } from "../src/lib/blog";
import { starTrekSpoilers } from "../src/lib/blog/posts/star-trek-spoilers";
import { whereToBuyStarTrek } from "../src/lib/blog/posts/star-trek-where-to-buy";
import type { PostBody, PostContext, ReleaseView } from "../src/lib/blog/types";
import type { CardLite, SealedLite, SetLite } from "../src/lib/data";
import { STAR_TREK } from "../src/lib/preorders";

// The posts are TSX compiled with the classic runtime under tsx: React must be a global to build one.
(globalThis as { React?: unknown }).React = React;

const NONE = { US: null, AU: null, UK: null, SG: null, CA: null, EU: null };
const ZERO = { US: 0, AU: 0, UK: 0, SG: 0, CA: 0, EU: 0 };
const set = (id: number, tok: string, name: string, kind: SetLite["kind"]): SetLite => ({ id, tok, slug: `${tok}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, code: tok.toUpperCase(), name, tcgName: name, kind, releasedOn: "2026-11-13", bucket: false, cardCount: 0, trackedCount: 0, sealedCount: 0 });
const TRK = set(24766, "trk", "Star Trek", "expansion"), TRC = set(24770, "trc", "Commander: Star Trek", "commander");
const sealed = (id: number, name: string, kind: SealedLite["kind"], setId: number, low: Partial<Record<keyof typeof NONE, number>> = {}, stores: Partial<Record<keyof typeof ZERO, number>> = {}): SealedLite => ({ id, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), name, setId, kind, packCount: null, releasedOn: "2026-11-13", presale: true, marketUsd: null, lowTcg: null, low: { ...NONE, ...low }, stores: { ...ZERO, ...stores }, change7d: null });
// Shapes of the live catalogue on 2026-10-14 (the US figures are that day's cheapest; the AU one is made up).
const PRODUCTS = [
  sealed(1, "Star Trek - Play Booster Display", "Booster Box", 24766, { US: 13899, AU: 26995 }, { US: 7, AU: 2 }),
  sealed(2, "Star Trek - Collector Booster Display", "Booster Box", 24766, { US: 54999 }, { US: 4 }),
  sealed(3, "Star Trek - Draft Night", "Other", 24766),
  sealed(4, "Star Trek Commander Deck - Klingon Fury", "Commander Deck", 24770, { US: 5999 }, { US: 0 }),
  sealed(5, "Star Trek Commander Deck - Klingon Fury (Collector's Edition)", "Commander Deck", 24770, { US: 19997 }, { US: 3 }),
];
/** flags 64: TCGplayer has a scan (CARD_FLAGS.TCGIMG); 32 with a Scryfall id: only Scryfall has one (SCRYIMG). */
const card = (id: number, name: string, number: string, marketUsd: number | null, low: number | null, flags = 64, scryId: string | null = null): CardLite =>
  ({ id, slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-trk-${number}`, name, alt: null, setId: 24766, sc: "trk", setCode: "TRK", number, rarity: "M", cls: 0, treat: [], label: null, flags, oracleNo: null, scryId, colorMask: 0, mv: 0, ptype: 0, marketUsd, headFinish: "N", valueUsd: marketUsd, lowOnly: false, n: { market: marketUsd, low }, f: null, tracked: 1, listed: true, top: false, thin: false, low: { ...NONE, US: low }, stores: { ...ZERO, US: low ? 2 : 0 }, change7d: null, change30d: null, high90Usd: null, colors: [], variant: null, printing: "standard", cost: null, cardType: "Creature", hasImage: true }) as CardLite;
const CARDS = [card(101, "Dr. Beverly Crusher", "13", 5297, 5995), card(102, "Amok Time", "183", null, null, 0), card(103, "Seven of Nine", "252", 1798, null, 32, "0a1b2c3d-1111-2222-3333-444455556666")];

const view = (over: Partial<ReleaseView> = {}): ReleaseView => ({ release: STAR_TREK, sets: [TRK, TRC], releasedOn: "2026-11-13", out: false, sealed: PRODUCTS, cards: [{ set: TRK, items: CARDS, total: 35 }, { set: TRC, items: [], total: 0 }], ...over });
const ctx = (releases: ReleaseView[], country: PostContext["country"] = "US") => ({ releases, country, top: [] }) as unknown as PostContext;
const html = (b: PostBody) => renderToStaticMarkup(createElement("div", null, ...b.summary, b.lede, ...b.sections.map((s) => createElement("section", { id: s.id }, createElement("h2", null, s.title), s.body))));
const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

test("both posts are blog posts of 2026-10-14, registered newest first, and link the pre-order page and each other", () => {
  for (const p of [whereToBuyStarTrek, starTrekSpoilers]) {
    assert.equal(p.category, "blog");
    assert.equal(p.date, "2026-10-14");
    assert.ok(POSTS.includes(p));
    assert.ok(p.related.some((r) => r.href === "/star-trek-preorders"));
    assert.ok(p.title({ cat: { pricesAt: "2026-10-14" } }).length <= 60);
    assert.ok((p.faq?.length ?? 0) >= 4);
  }
  assert.deepEqual(POSTS.slice(3, 5).map(postHref), ["/blog/where-to-buy-magic-star-trek", "/blog/magic-star-trek-spoilers"], "after the three posts of 2026-10-16");
  const where = html(whereToBuyStarTrek.build(ctx([view()]))), spoilers = html(starTrekSpoilers.build(ctx([view()])));
  assert.match(where, /href="\/blog\/magic-star-trek-spoilers"/);
  assert.match(spoilers, /href="\/blog\/where-to-buy-magic-star-trek"/);
  // and both link the three guides of 2026-10-16
  for (const h of [where, spoilers]) for (const slug of ["magic-star-trek-release-date-products", "magic-star-trek-commander-decks"]) assert.match(h, new RegExp(`href="/blog/${slug}"`), slug);
  assert.match(spoilers, /href="\/blog\/magic-star-trek-mechanics-explained"/);
});

test("where to buy: each market's cheapest live price per product from the catalogue, store counts, and a graceful line where there is none", () => {
  const out = html(whereToBuyStarTrek.build(ctx([view()])));
  const t = text(out);
  assert.match(t, /releases on 13 November 2026/);
  assert.match(t, /We track 5 Star Trek products, 2 of them Commander decks; 4 have a live pre-order in at least one market today/);
  assert.match(t, /In the United States the cheapest Star Trek - Play Booster Display we track is US\$138\.99 \(7 stores list it\)/);
  assert.match(out, /href="\/sealed\/star-trek-play-booster-display"/);
  assert.match(t, /Star Trek Commander Deck - Klingon Fury US\$59\.99 TCGplayer only/, "a price with no store is TCGplayer's, and says so");
  assert.match(t, /Buying Star Trek in Australia 1 Star Trek product with a live pre-order in Australia today, in AUD/);
  assert.match(t, /No store we track in Singapore lists a Star Trek pre-order yet/);
  assert.match(t, /Wizards of the Coast's Collecting Star Trek article says that prerelease events run from 6 to 12 November 2026, and that the MTG Arena release is 10 November 2026/);
  assert.match(t, /Wizards of the Coast's US MSRP is US\$6\.99 for a Play Booster/, "the one MSRP named is Wizards', and it says whose");
  assert.match(t, /its Collecting Star Trek article of 14 July 2026 sets a US MSRP for each product line/);
  assert.doesNotMatch(t, /\bRRP\b|list price of/);
  assert.doesNotMatch(t, /Fan trackers report/, "the dates are Wizards' since 16 October 2026");
});

test("spoilers: the release's cards in collector order with their images and only real prices; the Commander set's empty state; dated, sourced facts", () => {
  const body = starTrekSpoilers.build(ctx([view()]));
  assert.deepEqual(body.heroCards.map((c) => c.name), ["Dr. Beverly Crusher", "Seven of Nine", "Amok Time"], "dearest first by market price, unpriced last");
  const out = html(body), t = text(out);
  assert.match(t, /35 Star Trek cards are in our data so far/);
  assert.match(t, /Star Trek \(TRK\): 35 cards so far In collector number order, the first 3 of 35/);
  assert.match(out, /src="https:\/\/tcgplayer-cdn\.tcgplayer\.com\/product\/101_[^"]*"/, "TCGplayer's scan, hotlinked");
  assert.match(out, /src="https:\/\/cards\.scryfall\.io\/[^"]*0a1b2c3d-1111-2222-3333-444455556666[^"]*"/, "Scryfall's image where TCGplayer has none, hotlinked unmodified");
  assert.match(out, /object-contain/, "drawn whole: Scryfall's artist and copyright line is never cropped");
  assert.match(text(out), /Amok Time TRK · 183 No price yet/);
  assert.match(t, /Dr\. Beverly Crusher TRK · 13 US\$59\.95/);
  assert.match(t, /Amok Time TRK · 183 No price yet/);
  assert.match(t, /Seven of Nine TRK · 252 ≈ US\$17\.98/, "a market price with no listing is marked as the reference");
  assert.match(t, /No Commander: Star Trek singles are in our data yet\. TCGplayer lists its decks as sealed products for now: Klingon Fury\./);
  assert.match(t, /Star Trek releases on 13 November 2026\. \( Wizards of the Coast's Star Trek product page , read 14 October 2026\)/);
  assert.match(t, /Three new mechanics, Assimilate, Face a Dilemma and Federation/);
  assert.match(out, /href="https:\/\/magic\.wizards\.com\/en\/products\/star-trek"/);
});

test("nothing in the catalogue yet: both posts build and say so, never break", () => {
  for (const c of [ctx([]), ctx([view({ sets: [], sealed: [], cards: [] })])]) {
    const spoilers = text(html(starTrekSpoilers.build(c)));
    assert.match(spoilers, /No Star Trek cards revealed in our data yet/);
    const where = whereToBuyStarTrek.build(c);
    assert.deepEqual(where.heroCards, []);
    assert.match(text(html(where)), /No Star Trek product is in our catalogue yet/);
  }
});

test("from release day the copy is the released one: prices, not pre-orders", () => {
  const t = text(html(whereToBuyStarTrek.build(ctx([view({ out: true })]))));
  assert.match(t, /Star Trek released on 13 November 2026/);
  assert.match(t, /Star Trek is out: what changes/);
  assert.doesNotMatch(t, /Pre-order or wait\?/);
  assert.match(t, /4 have a live price in at least one market today/);
  const s = text(html(starTrekSpoilers.build(ctx([view({ out: true })]))));
  assert.match(s, /Magic: The Gathering Star Trek released on 13 November 2026/);
});
