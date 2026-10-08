// THE SET TRACKER'S PURE HALF.
//
// A binder is diffed against a SET'S CHECKLIST: which cards of Modern Horizons 3
// does this account not hold, and what is the cheapest listing for each?
// Everything that decides the answer lives here with no database, no React and
// no Next, so the tracker page, the owned overlay and the tests all read one
// definition and the numbers cannot drift apart:
//
//   * which printings count toward a set (two scopes, below);
//   * which of a card's prices is a STORE listing and which is not;
//   * progress and cost-to-finish, with unlisted cards counted in neither total;
//   * the pre-release rule: a set that has not released shows "N revealed" with
//     no denominator and no percentage;
//   * the missing list as a Best Basket-ready text and as a CSV.
//
// Client-safe: it imports only pure modules.
//
// WHAT COUNTS AS OWNED. Any condition and ANY FINISH: an LP copy fills the slot
// as well as an NM one does, and so does a foil copy (the tracker asks "do I
// have this printing", the binder's value is where the finish matters). One copy
// is enough. A printing is one product (Card.id, the TCGplayer productId), so
// owning the plain Sol Ring of a Commander set does not tick its Borderless one.
//
// WHAT COUNTS TOWARD A SET:
//   "base"  the plain printings of the set: no treatment word at all (no
//           Borderless, Extended Art, Showcase, Retro, Foil Etched, stamp or
//           language). A foil-only product with no treatment stays plain. In a
//           promo set (Promo Pack, The List, Secret Lair) the promo word is the
//           plain printing of that set.
//   "all"   every printing the checklist carries: the base plus frames, art
//           variants, foil patterns and editions. THIN rows (a single listing,
//           noindex pages) are in the checklist and counted: a set tracker is
//           complete.
// A PROMO treatment (prerelease, bundle, Buy-a-Box, stamped ...) inside a set
// that is not a promo set is in neither: it is a different ownership question
// ("do I have the prerelease card"). The loader decides that once per card and
// sets `isPromo` (lib/data/sets.ts getSetChecklist).
import { PRINTINGS, RARITIES, TREATMENT_BY_KEY } from "./constants";
import { formatDeckLine } from "./deck";

export type SetScope = "base" | "all";

export const SET_SCOPES: { key: SetScope; label: string; hint: string }[] = [
  { key: "base", label: "Base set", hint: "The plain printings: no Borderless, Extended Art, Showcase, Retro, Foil Etched, stamped or promo versions." },
  { key: "all", label: "Every printing we list", hint: "The base set plus the frame and art variants, foil patterns and editions we list. Promos are left out." },
];

/** A scope from a query string; anything else is the base set. */
export function parseScope(v: unknown): SetScope {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "all" ? "all" : "base";
}

/** The fields the scope rule reads. */
export interface ScopeCard {
  /** The first treatment key of the product ("borderless", "etched" ...), "standard" for a plain one (constants.printingOf). */
  printing: string;
  /** A promo print the set does not count (decided by the loader from the set's kind). */
  isPromo?: boolean | null;
}

/** Is this printing a treatment of a card (frame, art variant, foil pattern, edition, language, stamp)? */
export function isSpecialPrinting(c: ScopeCard): boolean {
  return c.printing !== "standard";
}

export function cardInScope(c: ScopeCard, scope: SetScope): boolean {
  if (c.isPromo) return false;
  // inside a promo set (isPromo false) the promo stamp IS the plain printing of that set
  return scope === "all" ? true : !isSpecialPrinting(c) || isPromoTreatment(c.printing);
}

/** Set kinds whose cards ARE promos (or drops), so promo prints count there (lib/constants.ts SET_KINDS). */
export const PROMO_SET_KINDS = new Set(["promo", "promo-pack", "list", "secret-lair"]);

/** Is a treatment key a promo stamp or event (constants TREATMENTS kind "promo")? */
export const isPromoTreatment = (key: string): boolean => TREATMENT_BY_KEY[key]?.kind === "promo";

/** Is a printing (one treatment key, or the keys of a card) a promo the set does NOT count? */
export const promoOutsideSet = (printing: string | readonly string[], setKind: string): boolean =>
  !PROMO_SET_KINDS.has(setKind) && (typeof printing === "string" ? [printing] : printing).some(isPromoTreatment);

// ── A card as the checklist carries it ───────────────────────────────────────

export interface ChecklistCard extends ScopeCard {
  id: number;
  slug: string;
  name: string;
  /** The collector number as printed ("146", "231★", "KHC-29"); null for a few unnumbered products. */
  number: string | null;
  variant: string | null;
  rarity: string | null;
  setCode: string;
  hasImage: boolean;
  /**
   * Cheapest in-stock listing at a REAL store (TCGplayer counts in the US) in the
   * reader's market, cents, or null: the aggregate of the card's headline unit
   * from the published set board. eBay is never in it (eBay data is not published).
   */
  minCents: number | null;
  /** Distinct stores with that card in stock. 0 when minCents is null. */
  stores: number;
  /** Kept for the shape of the page: no published source other than stores exists, so the loader sets it false. */
  otherSource: boolean;
  /** THIN: a single thin listing (noindex page). Counted and costed like any other row. */
  thin?: boolean;
}

export type CardStock = "store" | "other" | "none";

export function stockOf(c: Pick<ChecklistCard, "minCents" | "otherSource">): CardStock {
  if (c.minCents != null) return "store";
  return c.otherSource ? "other" : "none";
}

/** Owned copies by card id (any condition). JSON keys, so the ids are strings. */
export type OwnedMap = Readonly<Record<string, number>>;

export const isOwned = (owned: OwnedMap, id: number): boolean => (owned[String(id)] ?? 0) > 0;

export interface SetSummary {
  total: number;
  owned: number;
  missing: number;
  /** Whole percent owned, or null when total is 0. */
  percent: number | null;
  /** Missing cards with a store listing: the only ones costed. */
  priced: number;
  /** Sum of their cheapest listings, before postage. */
  costCents: number;
  /** Missing cards no source has in stock in this market. */
  notInStock: number;
  /** Missing cards only eBay has: counted in neither of the two totals above. */
  otherOnly: number;
}

export function summarise(cards: readonly ChecklistCard[], owned: OwnedMap, scope: SetScope): SetSummary {
  let total = 0;
  let have = 0;
  let priced = 0;
  let costCents = 0;
  let notInStock = 0;
  let otherOnly = 0;
  for (const c of cards) {
    if (!cardInScope(c, scope)) continue;
    total++;
    if (isOwned(owned, c.id)) {
      have++;
      continue;
    }
    const s = stockOf(c);
    if (s === "store") {
      priced++;
      costCents += c.minCents ?? 0;
    } else if (s === "other") otherOnly++;
    else notInStock++;
  }
  return {
    total,
    owned: have,
    missing: total - have,
    percent: total > 0 ? Math.floor((have / total) * 100) : null,
    priced,
    costCents,
    notInStock,
    otherOnly,
  };
}

/**
 * A set that has not released: "N revealed", never a fraction, a percentage or
 * a bar — its total is not settled. `revealed` counts the cards (every
 * printing, promos aside); `owned` is how many of them the account holds.
 */
export interface PreReleaseSummary {
  revealed: number;
  owned: number;
}

export function summarisePreRelease(cards: readonly ChecklistCard[], owned: OwnedMap): PreReleaseSummary {
  let revealed = 0;
  let have = 0;
  for (const c of cards) {
    if (c.isPromo) continue;
    revealed++;
    if (isOwned(owned, c.id)) have++;
  }
  return { revealed, owned: have };
}

export function preReleaseLine(s: PreReleaseSummary): string {
  return `${s.revealed} ${s.revealed === 1 ? "card" : "cards"} revealed so far`;
}

// ── The list: filter, sort ───────────────────────────────────────────────────

export type ShowFilter = "all" | "missing" | "owned";
export type SortKey = "cheapest" | "dearest" | "number";

export const parseShow = (v: unknown): ShowFilter => {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "owned" || s === "all" ? s : "missing";
};
export const parseSort = (v: unknown): SortKey => {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "dearest" || s === "number" ? s : "cheapest";
};

/** "146" -> ["", 146]; "231★" -> ["", 231]; "KHC-29" -> ["KHC", 29]; "029/281" -> ["", 29]; no number sorts last. */
function numberOrder(number: string | null): [string, number, string] {
  const m = number?.match(/^(?:([A-Za-z]+\d*)-)?0*(\d+)(.*)$/);
  return m ? [(m[1] ?? "").toUpperCase(), parseInt(m[2]!, 10), m[3] ?? ""] : ["~", Number.MAX_SAFE_INTEGER, ""];
}

/** Collector number (prefix, then numerically, then any suffix), then printing (standard first), then id. */
export function compareByNumber(
  a: Pick<ChecklistCard, "number" | "printing" | "id">,
  b: Pick<ChecklistCard, "number" | "printing" | "id">,
): number {
  const [ap, an, as] = numberOrder(a.number);
  const [bp, bn, bs] = numberOrder(b.number);
  return (
    (ap < bp ? -1 : ap > bp ? 1 : 0) ||
    an - bn ||
    (as < bs ? -1 : as > bs ? 1 : 0) ||
    (PRINTINGS[a.printing]?.order ?? 99) - (PRINTINGS[b.printing]?.order ?? 99) ||
    a.id - b.id
  );
}

export interface ListOptions {
  scope: SetScope;
  show: ShowFilter;
  rarity?: string | null;
  sort: SortKey;
}

/**
 * The rows of the tick list. Cheapest/dearest put priced cards first in that
 * order, then the ones with no store listing (eBay only, then not in stock) by
 * number, so the head of the list is always what can be bought today.
 */
export function listRows(cards: readonly ChecklistCard[], owned: OwnedMap, opts: ListOptions): ChecklistCard[] {
  const rows = cards.filter((c) => {
    if (!cardInScope(c, opts.scope)) return false;
    if (opts.rarity && c.rarity !== opts.rarity) return false;
    const has = isOwned(owned, c.id);
    return opts.show === "all" || (opts.show === "owned" ? has : !has);
  });
  const rank = (c: ChecklistCard) => (stockOf(c) === "store" ? 0 : stockOf(c) === "other" ? 1 : 2);
  return rows.sort((a, b) => {
    if (opts.sort === "number") return compareByNumber(a, b);
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 0) {
      const d = (a.minCents ?? 0) - (b.minCents ?? 0);
      const byPrice = opts.sort === "cheapest" ? d : -d;
      if (byPrice) return byPrice;
    }
    return compareByNumber(a, b);
  });
}

/** Rarities present in the scope, in the order of constants RARITIES (M R U C S P L T), for the filter. */
export function raritiesIn(cards: readonly ChecklistCard[], scope: SetScope): string[] {
  const present = new Set(cards.filter((c) => cardInScope(c, scope) && c.rarity).map((c) => c.rarity as string));
  return [...present].sort((a, b) => (RARITIES[a]?.order ?? 99) - (RARITIES[b]?.order ?? 99) || a.localeCompare(b));
}

// ── The missing list, out of the page ────────────────────────────────────────

const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/**
 * One line per card: `1 Lightning Bolt (M11) 146` for a plain print and the same
 * with ` #<productId>` for any other. It pastes straight into Best Basket, the deck
 * pricer or the binder's paste import (lib/deck.ts parseDeckList), and the `#id`
 * pins the exact printing, so a Borderless one is never priced as its plain card.
 */
export function missingLine(c: Pick<ChecklistCard, "id" | "name" | "number" | "setCode" | "printing">): string {
  return formatDeckLine(1, { id: c.id, name: c.name, number: c.number, setCode: c.setCode, flags: 0 }, c.printing !== "standard");
}

export function missingText(rows: readonly ChecklistCard[]): string {
  return rows.map(missingLine).join("\n");
}

/** The same list as a CSV the binder import reads back: set, number, printing, name, rarity, cheapest, stores, tcgplayer_id. */
export function missingCsv(rows: readonly ChecklistCard[], currency: string): string {
  const head = `set,number,printing,name,rarity,cheapest_${currency.toLowerCase()},stores,tcgplayer_id`;
  const lines = rows.map((c) =>
    [
      c.setCode,
      esc(c.number ?? ""),
      c.printing,
      esc(`${c.name}${c.variant ? ` (${c.variant})` : ""}`),
      esc(c.rarity ?? ""),
      c.minCents != null ? (c.minCents / 100).toFixed(2) : "",
      c.stores,
      c.id,
    ].join(","),
  );
  return [head, ...lines].join("\n");
}

/** What a card with no store listing but another source says. Nothing published carries one, so the tracker never shows it; the words stay for the shape of the page. */
export function otherSourceLabel(_country?: string): string {
  return "Other source only";
}

/**
 * The footer under every cost to finish, verbatim (the owner-approved
 * wording): the figure is the cheapest listing, item price only, and delivery
 * is priced by Best Basket. One constant so the page and its test read the same words.
 */
export const SET_FOOTER_COPY = "Cheapest listing per card, before postage. Best Basket prices delivery.";
