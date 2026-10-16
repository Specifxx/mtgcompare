// The pre-order pages (RiftCompare's /radiance-preorders, OP Compare's PREORDER_PAGES): one page per set release, before it
// ships, listing every product's store pre-orders in the visitor's market. This module is the registry and the pure rules;
// components/PreorderPage.tsx reads the loaders and renders, and the release posts read the same registry through
// lib/blog/context.ts. tests/preorders.test.ts.
//
// The next release is one entry of PREORDER_RELEASES: the set tokens (Set.tok, write-once) of the release, its route, the
// publisher's product lines and the dated facts. Everything priced comes from the published data: the products are the
// catalogue's sealed rows of those sets, never a hand-typed id or price. The one exception is the publisher's own US MSRP
// per product line (`msrp`), copied from the announcement that sets it, with its source and the day it was read, and shown
// only as "US MSRP": it is never a store price, never ranked, never an alert's threshold (src/lib/msrp.ts, the per-product
// table the alerts would read, stays empty; DECISIONS.md, "Three Star Trek posts", 2026-10-16).
//
// Self-retiring: a page is a pre-order page while its main set's release date (the catalogue's, else the announced one) is
// in the future; from release day it points at the set page and /sealed. `/preorders` stays a redirect to /release-dates
// (DECISIONS.md, "A pre-order page per release: /star-trek-preorders", 2026-10-14).
import { SEALED_KINDS, type SealedKind } from "./constants";
import { COUNTRIES, type Country } from "./country";
import type { OfferRow, SealedLite, SetLite } from "./data";
import { buyRow, type BuyRow } from "./quick-view";
import { offerStock, type OfferStock } from "./sealed-offers";
import { checkedStoresIn } from "./stores";

/** Box before pack, cases last (data/sealed.ts getSealedBySet's order). */
const sealedKindRank = (k: SealedKind): number => (k === "Booster Box" ? 0 : k === "Booster Pack" ? 1 : k === "Case" ? 99 : 2 + SEALED_KINDS.indexOf(k));

/** A dated fact on a release page. "official": Wizards of the Coast says it; "reported": fan trackers say it, and the copy says so. */
export interface PreorderFact {
  text: string;
  kind: "official" | "reported";
  source: { label: string; url: string };
  /** YYYY-MM-DD the source was read. */
  checked: string;
}

/** One of the publisher's product lines, as its product page describes it. `match` (on the lower-cased catalogue name) puts a catalogue product under it; the first line that matches wins. */
export interface PreorderLine {
  name: string;
  detail: string;
  match: RegExp;
}

export interface PreorderRelease {
  key: string;
  /** The route, also the canonical URL. */
  path: string;
  /** The set's short name in copy ("Star Trek"). */
  label: string;
  /** The Set.tok of each set of the release, main set first (Commander decks often have their own set). */
  toks: readonly string[];
  /** The release date the publisher announced (YYYY-MM-DD): used only while the catalogue has none for the main set. */
  announced: string;
  /** Where the product lines and the date come from, and when it was read. */
  productSource: { label: string; url: string; checked: string };
  lines: readonly PreorderLine[];
  facts: readonly PreorderFact[];
  /** A third party's trademark line for a Universes Beyond set, printed under the page (Wizards' own notice is the site footer's). */
  trademark?: string;
  /** Prerelease events (YYYY-MM-DD, inclusive), when known, and who says so: the "when to pre-order" copy names them. */
  prerelease?: { from: string; to: string; kind: PreorderFact["kind"] };
  /** The publisher's suggested US retail price per product line (`line` is a PreorderLine name), when it published one: the announcement (and its date) and the day it was read. */
  msrp?: PreorderMsrp;
}

/** Suggested US retail prices as the publisher announced them, in US cents, per product line ("each" names the unit a price is for). */
export interface PreorderMsrp {
  source: { label: string; url: string; published: string };
  /** YYYY-MM-DD the announcement was read. */
  checked: string;
  rows: readonly { line: string; usdCents: number; each: string }[];
}

const WIZARDS_STAR_TREK = { label: "Wizards of the Coast's Star Trek product page", url: "https://magic.wizards.com/en/products/star-trek", checked: "2026-10-14" };
// Wizards' first-look article (14 July 2026): set codes, legality, the important dates, the four Commander decks by name, the
// mechanics, each product's contents and the US MSRPs. Read 16 October 2026; its editor's note says the Beginner Box was cancelled.
export const WIZARDS_COLLECTING_STAR_TREK = { label: "Wizards of the Coast's Collecting Star Trek article", url: "https://magic.wizards.com/en/news/feature/collecting-star-trek" };
export const PLAYGROUP_STAR_TREK = { label: "playgroup.gg's Star Trek tracker", url: "https://playgroup.gg/sets/star-trek" };

/** Magic: The Gathering | Star Trek (TRK) and Commander: Star Trek (TRC). The product page (read 14 October 2026) prints no prices; Wizards' Collecting Star Trek article (read 16 October 2026) sets the US MSRPs and the dates. */
export const STAR_TREK: PreorderRelease = {
  key: "star-trek",
  path: "/star-trek-preorders",
  label: "Star Trek",
  toks: ["trk", "trc"],
  announced: "2026-11-13",
  productSource: WIZARDS_STAR_TREK,
  // Wizards' order. The patterns are exclusive (a Beam Me Up Bundle is not "the Bundle"; a Collector's Edition deck is not a
  // Commander Deck line), so a catalogue name lands under one line whatever the order; a Prerelease Pack is under none.
  lines: [
    { name: "Play Booster", detail: "The set's main booster, which Wizards calls the best way to build a Star Trek deck. Sold as single packs and in sealed displays.", match: /play booster/ },
    { name: "Draft Night", detail: "A self-contained kit for a Pick-Two Draft with four players.", match: /draft night/ },
    { name: "Bundle", detail: "In Wizards' words, \u201can entire bevy of Play Boosters and additional Magic goodies\u201d. The product page does not list the exact contents.", match: /^(?!.*beam me up).*\bbundle\b/ },
    { name: "Commander Deck", detail: "Four ready-to-play decks for Commander, each themed on a Star Trek crew, fleet or army.", match: /commander deck(?!.*collector['\u2019]?s edition)/ },
    { name: "Collector Booster", detail: "Wizards' premium booster, with Rares, Traditional Foils, a Full-Art land and a chance at Headliner Signed cards: cards autographed by Star Trek actors, printed in English only and found in Collector Boosters of every language.", match: /collector booster/ },
    { name: "Collector's Edition Commander Deck", detail: "Four 100-card Commander decks in Surge Foil, Wizards says; TCGplayer lists one under each Commander deck's name.", match: /commander deck.*collector['\u2019]?s edition/ },
    { name: "Beam Me Up Bundle", detail: "A bundle for dedicated fans: exclusive ship schematics, Full-Art Away Team lands, Play Boosters and a Collector Booster, among other things, in Wizards' list.", match: /beam me up/ },
    { name: "Scene Box", detail: "Two boxes, Divergent Timeline and Enterprise-Q, each with six Borderless Scene cards that together show one scene.", match: /scene box/ },
  ],
  facts: [
    { text: "Star Trek releases on 13 November 2026.", kind: "official", source: WIZARDS_STAR_TREK, checked: "2026-10-14" },
    { text: "The products are Play Boosters, Collector Boosters, a Bundle, the Beam Me Up Bundle, Draft Night, four Commander Decks, four Collector's Edition Commander Decks and two Scene Boxes. No price is printed.", kind: "official", source: WIZARDS_STAR_TREK, checked: "2026-10-14" },
    { text: "Headliner Signed cards, autographed by the actors, can be pulled from Collector Boosters.", kind: "official", source: WIZARDS_STAR_TREK, checked: "2026-10-14" },
    // Reported by fan trackers until 16 October 2026, when the Collecting Star Trek article was read: Wizards states them there.
    { text: "Prerelease events run from 6 to 12 November 2026.", kind: "official", source: WIZARDS_COLLECTING_STAR_TREK, checked: "2026-10-16" },
    { text: "The MTG Arena release is 10 November 2026.", kind: "official", source: WIZARDS_COLLECTING_STAR_TREK, checked: "2026-10-16" },
    { text: "The four Commander decks are Federation Fleet, Landing Party, Klingon Fury and We Are the Borg, each also sold as a Collector's Edition in Surge Foil.", kind: "official", source: WIZARDS_COLLECTING_STAR_TREK, checked: "2026-10-16" },
    { text: "Three new mechanics, Assimilate, Face a Dilemma and Federation, and the return of Spacecraft and station from Edge of Eternities.", kind: "official", source: WIZARDS_COLLECTING_STAR_TREK, checked: "2026-10-16" },
    { text: "The set codes are TRK for the main set, TRC for the Commander decks and SDS for the stardates cards, and TRK is legal in every format, Standard included.", kind: "official", source: WIZARDS_COLLECTING_STAR_TREK, checked: "2026-10-16" },
    { text: "The Star Trek Beginner Box has been cancelled.", kind: "official", source: WIZARDS_COLLECTING_STAR_TREK, checked: "2026-10-16" },
  ],
  prerelease: { from: "2026-11-06", to: "2026-11-12", kind: "official" },
  // "MSRPs for Magic: The Gathering | Star Trek will be set as follows", in Wizards' order. No figure for the Prerelease Pack (none is
  // published) and none for a display or a case: a box's price is never derived from a pack's.
  msrp: {
    source: { ...WIZARDS_COLLECTING_STAR_TREK, published: "2026-07-14" },
    checked: "2026-10-16",
    rows: [
      { line: "Play Booster", usdCents: 699, each: "booster" },
      { line: "Collector Booster", usdCents: 3799, each: "booster" },
      { line: "Commander Deck", usdCents: 7499, each: "deck" },
      { line: "Collector's Edition Commander Deck", usdCents: 15999, each: "deck" },
      { line: "Bundle", usdCents: 6999, each: "bundle" },
      { line: "Beam Me Up Bundle", usdCents: 9999, each: "bundle" },
      { line: "Draft Night", usdCents: 11999, each: "kit" },
      { line: "Scene Box", usdCents: 4199, each: "box" },
    ],
  },
  trademark: "Star Trek and related marks are trademarks of CBS Studios Inc.; MTG Compare is not affiliated with CBS Studios.",
};

/** Every release with a pre-order page, soonest first. A new set is one more entry (and its route file). */
export const PREORDER_RELEASES: readonly PreorderRelease[] = [STAR_TREK];

/** Set.tok -> the pre-order page of its release: /release-dates, /sets/[slug], /sealed and the home link through it. */
export const PREORDER_PAGES: Readonly<Record<string, string>> = Object.fromEntries(PREORDER_RELEASES.flatMap((r) => r.toks.map((t) => [t, r.path] as const)));

/** The pre-order page of a set, while the set has not released (`today` and the set's date decide); null otherwise. */
export function preorderPathFor(set: Pick<SetLite, "tok" | "releasedOn">, today: string): string | null {
  const path = PREORDER_PAGES[set.tok];
  return path && set.releasedOn != null && set.releasedOn > today ? path : null;
}

/** The pre-order pages that are live on `today`: a release with at least one set in the catalogue whose release date (the main set's, else the announced one) is still ahead. */
export function livePreorderPages(sets: readonly Pick<SetLite, "tok" | "releasedOn">[], today: string): { path: string; label: string; releasedOn: string }[] {
  const byTok = new Map(sets.map((s) => [s.tok, s] as const));
  return PREORDER_RELEASES.flatMap((r) => {
    const date = byTok.get(r.toks[0]!)?.releasedOn ?? r.announced;
    return r.toks.some((t) => byTok.has(t)) && !isOut(date, today) ? [{ path: r.path, label: r.label, releasedOn: date }] : [];
  });
}

/** The US MSRP of one of the release's product lines (a PreorderLine name), or null when the publisher published none. */
export function lineMsrp(r: Pick<PreorderRelease, "msrp">, line: string): { usdCents: number; each: string } | null {
  return r.msrp?.rows.find((x) => x.line === line) ?? null;
}

/** The newest day any of the release's facts was read: "what is confirmed, as of" that day. */
export function factsCheckedOn(r: Pick<PreorderRelease, "facts" | "productSource">): string {
  return r.facts.reduce((d, f) => (f.checked > d ? f.checked : d), r.productSource.checked);
}

/** A fact as a clause ("Prerelease events run ...." -> "prerelease events run ..."). */
export const factClause = (f: Pick<PreorderFact, "text">): string => f.text.replace(/\.$/, "").replace(/^\w/, (x) => x.toLowerCase());

/** The release's side dates (prerelease events, the MTG Arena release): the facts that name them, official first. */
export function eventFacts(r: Pick<PreorderRelease, "facts">): PreorderFact[] {
  const ev = r.facts.filter((f) => /\bprerelease\b|\bmtg arena\b/i.test(f.text));
  return [...ev.filter((f) => f.kind === "official"), ...ev.filter((f) => f.kind === "reported")];
}

/** Facts said as sentences that name who says them: "<source> says that a, and that b." per official source, then "Fan trackers report that c." */
export function attributed(facts: readonly PreorderFact[]): string {
  const bySource = new Map<string, PreorderFact[]>();
  for (const f of facts) if (f.kind === "official") (bySource.get(f.source.label) ?? bySource.set(f.source.label, []).get(f.source.label)!).push(f);
  const reported = facts.filter((f) => f.kind === "reported");
  return [
    ...[...bySource].map(([label, fs]) => `${label} says that ${fs.map(factClause).join(", and that ")}.`),
    ...(reported.length ? [`Fan trackers report that ${reported.map(factClause).join(", and that ")}.`] : []),
  ].join(" ");
}

/** The release's sets in the catalogue, main set first; a token the catalogue lacks is skipped. */
export function releaseSets(r: PreorderRelease, byTok: ReadonlyMap<string, SetLite>): SetLite[] {
  return r.toks.map((t) => byTok.get(t)).filter((s): s is SetLite => s != null);
}

/** The release date: the main set's in the catalogue, else the announced one. */
export function releaseDateOf(r: PreorderRelease, sets: readonly SetLite[]): string {
  const main = sets.find((s) => s.tok === r.toks[0]);
  return main?.releasedOn ?? r.announced;
}

/** Is the release out on `today` (YYYY-MM-DD)? From release day the page and the posts switch to their released state. */
export const isOut = (releasedOn: string, today: string): boolean => releasedOn <= today;

/** The publisher's product line of a catalogue product, or null. */
export function lineOf(r: PreorderRelease, name: string): PreorderLine | null {
  const n = name.toLowerCase();
  return r.lines.find((l) => l.match.test(n)) ?? null;
}

/** Display order: by set (main first), then the order the publisher's page lists the lines (a product of no line last), then box before pack and cases last, then name. */
export function orderProducts<T extends Pick<SealedLite, "id" | "name" | "kind" | "setId">>(r: PreorderRelease, products: readonly T[], sets: readonly SetLite[]): T[] {
  const setRank = new Map(sets.map((s) => [s.id, r.toks.indexOf(s.tok)] as const));
  const lineRank = (p: T): number => { const l = lineOf(r, p.name); return l ? r.lines.indexOf(l) : r.lines.length; };
  return [...products].sort((a, b) => (setRank.get(a.setId ?? -1) ?? 99) - (setRank.get(b.setId ?? -1) ?? 99) || lineRank(a) - lineRank(b) || sealedKindRank(a.kind) - sealedKindRank(b.kind) || (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id - b.id));
}

/** One row of a product's board: a buyable row (affiliate-tagged) with the state of the offer. */
export interface PreorderRow extends BuyRow {
  state: OfferStock;
  tcgplayer: boolean;
}

const STATE_RANK: Record<OfferStock, number> = { open: 0, unknown: 1, soldout: 2 };

/**
 * A product's rows in the visitor's market, in its currency: one per seller (its cheapest open offer, else its cheapest
 * not re-read one, else its newest sold-out one), open rows first cheapest first, then rows not re-read within 72 hours,
 * then sold-out rows (shown as such, never dropped). TCGplayer's lowest listing is a row in the US, ranked by price like
 * the stores; eBay is never a row here (eBay data is not published; its block is a search).
 */
export function preorderRows(offers: readonly OfferRow[], country: Country, loc: string, now: number = Date.now()): PreorderRow[] {
  const cur = COUNTRIES[country].currency;
  const best = new Map<string, { o: OfferRow; state: OfferStock }>();
  for (const o of offers) {
    if (o.market !== country || o.currency !== cur || o.source.startsWith("ebay")) continue;
    const state = offerStock({ priceCents: o.priceCents, inStock: o.inStock, lastSeen: o.updatedAt }, now);
    const cur0 = best.get(o.source);
    const better = !cur0 || STATE_RANK[state] < STATE_RANK[cur0.state] || (state === cur0.state && (state === "soldout" ? o.updatedAt > cur0.o.updatedAt : o.priceCents < cur0.o.priceCents));
    if (better) best.set(o.source, { o, state });
  }
  return [...best.values()]
    .sort((a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || a.o.priceCents - b.o.priceCents || (a.o.source < b.o.source ? -1 : 1))
    .map(({ o, state }) => ({ ...buyRow(o, country, loc), state, tcgplayer: o.source === "tcgplayer" }));
}

/** What a product's board says in one line: its cheapest open row, and how many STORES (not TCGplayer) take pre-orders. */
export function boardSummary(rows: readonly PreorderRow[]): { cheapest: PreorderRow | null; openStores: number; soldOut: number } {
  return {
    cheapest: rows.find((r) => r.state === "open") ?? null,
    openStores: rows.filter((r) => r.state === "open" && !r.tcgplayer).length,
    soldOut: rows.filter((r) => r.state === "soldout").length,
  };
}

// ── the page's layout (DECISIONS.md, "The pre-order page: marketplaces on top, stores in price order", 2026-10-16) ──────────────────
// Every product block opens with its marketplaces, eBay then TCGplayer, in a labelled group of their own: never numbered, never
// "Cheapest", never counted as a store. Below them the stores, cheapest open pre-order first, numbered; stale and sold-out rows last.

/** A product's rows split for the page: TCGplayer's row (the marketplace group, any state) and the stores' rows in board order. */
export function splitRows(rows: readonly PreorderRow[]): { tcgplayer: PreorderRow | null; stores: PreorderRow[] } {
  return { tcgplayer: rows.find((r) => r.tcgplayer) ?? null, stores: rows.filter((r) => !r.tcgplayer) };
}

/** How many stores the daily import reads in a market (the registry without the off feeds: /stores and the buying guides' count). */
export const storesCheckedIn = (country: Country): number => checkedStoresIn(country).length;

/** Distinct stores with an open pre-order for any of the release's products in the visitor's market. TCGplayer and eBay are not stores. */
export function storesTakingPreorders(boards: readonly { rows: readonly PreorderRow[] }[]): number {
  return new Set(boards.flatMap((b) => b.rows.filter((r) => r.state === "open" && !r.tcgplayer).map((r) => r.source))).size;
}

/** Across all six markets: distinct stores with an open offer (in their market's currency) for any of the release's products, and how many markets they are in. */
export function releaseReach(offers: readonly OfferRow[], now: number = Date.now()): { stores: number; markets: number } {
  const stores = new Set<string>(), markets = new Set<string>();
  for (const o of offers) {
    if (!o.source.startsWith("store:") || o.currency !== COUNTRIES[o.market as Country]?.currency) continue;
    if (offerStock({ priceCents: o.priceCents, inStock: o.inStock, lastSeen: o.updatedAt }, now) !== "open") continue;
    stores.add(o.source);
    markets.add(o.market);
  }
  return { stores: stores.size, markets: markets.size };
}

/** The strip's headline deal: the Play Booster display's cheapest open row (store or TCGplayer), else the first product in display order that has one. */
export function headlineDeal<T extends Pick<SealedLite, "name" | "kind">>(r: PreorderRelease, boards: readonly { s: T; rows: readonly PreorderRow[] }[]): { s: T; row: PreorderRow; box: boolean } | null {
  const open = (b: { rows: readonly PreorderRow[] }) => b.rows.find((x) => x.state === "open") ?? null;
  const box = boards.find((b) => b.s.kind === "Booster Box" && lineOf(r, b.s.name)?.name === "Play Booster" && open(b));
  if (box) return { s: box.s, row: open(box)!, box: true };
  const first = boards.find((b) => open(b));
  return first ? { s: first.s, row: open(first)!, box: false } : null;
}

/** "13 November 2026" from YYYY-MM-DD. */
export function longDateOf(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** "6 to 12 November 2026" (or "30 October to 5 November 2026") from two YYYY-MM-DD dates. */
export function dateRangeOf(from: string, to: string): string {
  const a = new Date(`${from}T00:00:00Z`), b = new Date(`${to}T00:00:00Z`);
  const sameMonth = a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear();
  return sameMonth ? `${a.getUTCDate()} to ${longDateOf(to)}` : `${a.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })} to ${longDateOf(to)}`;
}

/** Whole days from `today` to `iso` (0 on the day, negative after). */
export function daysUntil(iso: string, today: string): number {
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** The Commander deck names of a release, from the catalogue's own product names ("Star Trek Commander Deck - Klingon Fury" -> "Klingon Fury"), each once, in display order. */
export function commanderDeckNames(products: readonly Pick<SealedLite, "name" | "kind">[]): string[] {
  const out: string[] = [];
  for (const p of products) {
    if (p.kind !== "Commander Deck") continue;
    const m = /commander deck\s*[-:–—]\s*(.+?)(?:\s*[-(]?\s*collector['\u2019]?s edition\)?)?\s*$/i.exec(p.name);
    const name = m?.[1]?.trim();
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}
