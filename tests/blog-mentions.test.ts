import { test } from "node:test";
import assert from "node:assert/strict";
import React, { createElement as h, Fragment } from "react";
import { collectMentions, shopCards, shopPicks } from "../src/components/blog/mentions";
import { cheaperAbroad } from "../src/lib/blog/posts/cheaper-abroad";
import type { PostContext } from "../src/lib/blog/types";
import type { CardLite, MarketRecords } from "../src/lib/data";
import type { Country } from "../src/lib/country";

const card = (id: number, slug: string) => ({ id, slug, name: slug, setId: 1, marketUsd: 100, low: {} });
function Table(_: { cards: unknown[] }) {
  return null;
}
function CardLink(_: { c: unknown }) {
  return null;
}

test("collects cards from props and links, in order of first mention", () => {
  const tree = [
    h("p", null, "Intro ", h(CardLink, { c: card(1, "lightning-bolt") }), " and ", h("a", { href: "/card/sol-ring" }, "Sol Ring")),
    h(Fragment, null, h(Table, { cards: [card(2, "counterspell"), card(1, "lightning-bolt")] })),
    h("div", null, h("a", { href: "/sealed/mh3-collector-booster-box" }, "box"), h("a", { href: "/sets/modern-horizons-3" }, "set"), h("a", { href: "https://example.com/card/x" }, "x")),
  ];
  const m = collectMentions(tree);
  assert.deepEqual(m.cards, ["lightning-bolt", "sol-ring", "counterspell"]);
  assert.deepEqual(m.sealed, ["mh3-collector-booster-box"]);
});

test("ignores plain text, nulls and lookalike objects", () => {
  assert.deepEqual(collectMentions(null), { cards: [], units: [], sealed: [] });
  assert.deepEqual(collectMentions(h("p", { data: { slug: "nope" } }, "text", false, 3)), { cards: [], units: [], sealed: [] });
});

test("finds links nested in a table's rows prop (SimpleTable rows = cells of markup)", () => {
  function SimpleTable(_: { rows: unknown[][] }) {
    return null;
  }
  const rows = [
    [h("a", { key: "n", href: "/sealed/otj-play-booster-box" }, "OTJ"), "US$100"],
    [h("a", { key: "n", href: "/sealed/mh3-collector-booster-box" }, "MH3"), "US$900"],
  ];
  const m = collectMentions([h("p", null, h("a", { href: "/sealed/mh3-collector-booster-box" }, "MH3")), h(SimpleTable, { rows })]);
  assert.deepEqual(m.sealed, ["mh3-collector-booster-box", "otj-play-booster-box"]);
});

// ── a price belongs to a (product, finish): the shop strip prices the unit the post priced ──────────────────────────────────

// The posts are TSX compiled with the classic runtime under tsx: React must be a global to build one.
(globalThis as { React?: unknown }).React = React;
const NO_LOW = { US: null, AU: null, UK: null, SG: null, CA: null, EU: null };
const NO_STORES = { US: 0, AU: 0, UK: 0, SG: 0, CA: 0, EU: 0 };
/** 7th Edition Serra Angel: one Card whose Foil unit is the 42★ printing (CLAUDE.md, 7th-10th Edition), as a lite of either unit. */
function serra(unit: "N" | "F"): CardLite {
  return {
    id: 2860, slug: "serra-angel-7ed-42", name: "Serra Angel", alt: null, setId: 77, sc: "7ed", setCode: "7ED", number: "42", rarity: "U", cls: 0, treat: [], label: null, flags: 0,
    oracleNo: 1, scryId: null, colorMask: 1, mv: 5, ptype: 0, n: { market: 264, low: 199 }, f: { market: 49999, low: 42999 }, tracked: 3, listed: true, top: false, thin: false,
    change7d: null, change30d: null, high90Usd: null, colors: ["White"], variant: null, printing: "standard", cost: 5, cardType: "Creature", hasImage: true,
    ...(unit === "F"
      ? { marketUsd: 49999, headFinish: "F" as const, valueUsd: 49999, lowOnly: false, low: { ...NO_LOW, US: 42999, CA: 62600 }, stores: { ...NO_STORES, US: 1, CA: 1 } }
      : { marketUsd: 264, headFinish: "N" as const, valueUsd: 264, lowOnly: false, low: { ...NO_LOW, US: 199 }, stores: { ...NO_STORES, US: 16 } }),
  } as CardLite;
}

test("mentions keep the unit: ?finish=foil on a link, a card object's shown finish, the headline otherwise", () => {
  const tree = [
    h("a", { href: "/card/serra-angel-7ed-42?finish=foil" }, "Serra Angel · Foil"),
    h("a", { href: "/card/serra-angel-7ed-42" }, "Serra Angel"),
    h("a", { href: "/card/sol-ring?finish=nonfoil#prices" }, "Sol Ring"),
    h(CardLink, { c: serra("F") }),
  ];
  const m = collectMentions(tree);
  assert.deepEqual(m.cards, ["serra-angel-7ed-42", "sol-ring"], "slugs stay one per card");
  assert.deepEqual(m.units, [
    { slug: "serra-angel-7ed-42", finish: "F" },
    { slug: "serra-angel-7ed-42", finish: null },
    { slug: "sol-ring", finish: "N" },
  ], "one entry per (card, finish); the card object repeats the foil unit");
});

test("shop picks: a mention's own finish, else the headline; one per (card, finish); a missing unit view is dropped, never shown in the other finish", () => {
  const bySlug = new Map([["serra-angel-7ed-42", serra("N")]]);
  const picks = shopPicks([{ slug: "serra-angel-7ed-42", finish: "F" }, { slug: "serra-angel-7ed-42", finish: null }, { slug: "serra-angel-7ed-42", finish: "N" }, { slug: "unknown", finish: null }], bySlug);
  assert.deepEqual(picks, [
    { id: 2860, slug: "serra-angel-7ed-42", finish: "F", headline: false },
    { id: 2860, slug: "serra-angel-7ed-42", finish: "N", headline: true },
  ]);
  assert.deepEqual(shopCards(picks, bySlug, () => undefined).map((c) => c.headFinish), ["N"], "no foil view loaded: no foil row, and never the Normal price under the foil row");
});

test("cheaper abroad: a foil gap row is labelled Foil, links the Foil tab, and the shop strip shows that same unit and price", () => {
  const gap = { card: serra("F"), finish: "F" as const, home: 98730, away: "CA" as Country, awayCents: 62600, awayConverted: 45693, saving: 53037, pct: 53.7 };
  const empty: MarketRecords = { gaps: [], highs: [], lows: [] };
  const records = { US: { ...empty, gaps: [gap] }, AU: empty, UK: empty, SG: empty, CA: empty, EU: empty };
  const body = cheaperAbroad.build({ records, top: [] } as unknown as PostContext);
  // the table cell: label and link
  const links: { href: string; text: unknown }[] = [];
  const find = (n: unknown, d = 0): void => {
    if (d > 30 || !n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach((x) => find(x, d + 1));
    const p = (n as { props?: Record<string, unknown> }).props;
    if (!p) return;
    if (typeof p.href === "string" && p.href.startsWith("/card/")) links.push({ href: p.href, text: p.children });
    for (const v of Object.values(p)) find(v, d + 1);
  };
  find(body.sections.map((s) => s.body));
  assert.deepEqual(links, [{ href: "/card/serra-angel-7ed-42?finish=foil", text: "Serra Angel · Foil" }]);
  // what ArticleView hands the strip: the hero cards, then the mentions
  const mentioned = collectMentions([...body.summary, body.lede, ...body.sections.map((s) => s.body)]);
  const units = [...body.heroCards.map((c) => ({ slug: c.slug, finish: c.headFinish })), ...mentioned.units];
  assert.ok(units.every((u) => u.finish === "F"), JSON.stringify(units));
  const lookup = new Map([["serra-angel-7ed-42", serra("N")]]);   // getCardLookup prices the headline (Normal) unit
  const picks = shopPicks(units, lookup);
  const strip = shopCards(picks, lookup, (id, f) => (id === 2860 && f === "F" ? serra("F") : undefined));   // getCardsByIds(ids, { unit: "F" })
  assert.equal(strip.length, 1);
  assert.equal(strip[0]!.headFinish, "F", "the strip shows the foil unit the table shows");
  assert.equal(strip[0]!.low.CA, gap.awayCents, "the same unit's prices: Canada's store low is the row's cheaper market");
  assert.notEqual(strip[0]!.low.US, serra("N").low.US, "never the US$1.99 Normal listing under a foil row");
});
