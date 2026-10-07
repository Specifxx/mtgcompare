// THE SET TRACKER'S PURE HALF — RiftCompare's lib/set-scope.ts, rewritten for
// One Piece in wave 2 (2026-10-03; DECISIONS.md, "Set checklist").
//
// A binder is diffed against a SET'S CATALOGUE: which cards of Romance Dawn
// does this account not hold, and what is the cheapest listing for each?
// Everything that decides the answer lives here with no database, no React and
// no Next, so the tracker page, the owned overlay and the tests all read one
// definition and the numbers cannot drift apart:
//
//   • which printings count toward a set (two scopes, below);
//   • which of a card's prices is a STORE listing and which is not;
//   • progress and cost-to-finish, with eBay-only cards counted in neither total;
//   • the pre-release rule: a set that has not released shows "N revealed" with
//     no denominator and no percentage;
//   • the missing list as a Best Basket-ready text and as a CSV.
//
// Client-safe: it imports only pure modules.
//
// WHAT COUNTS AS OWNED. Any condition: an LP copy fills the slot as well as an
// NM one does. One copy is enough ("own" means "at least one copy"). A card is
// ONE printing on OP Compare (Card.id, the TCGplayer productId), so owning the
// standard Shanks OP01-120 does not tick its Parallel or its Manga.
//
// WHAT COUNTS TOWARD A SET (the One Piece rule, not RiftCompare's variant /
// overnumbered / Signature / Crystal Rose one):
//   "base"  the standard prints — printing "standard", or "reprint" (a Premium
//           Booster's reprints ARE its contents) — Leaders included, DON!!
//           cards excluded. In a promo or event group, its promo prints.
//   "all"   every printing we track: the base plus Parallels, Manga, SP,
//           Treasure Rares, special foils and DON!! cards.
// A PROMO printing inside a booster group (a stray TCGplayer listing) is in
// neither: it is a different ownership question ("do I have the promo"). The
// loader decides that once per card and sets `isPromo` (lib/data.ts
// getSetChecklist). "Printings we track" is the honest label: the counts are
// only as complete as our Card rows, never a typed-in total.
import { PRINTINGS, RARITIES } from "./constants";

export type SetScope = "base" | "all";

export const SET_SCOPES: { key: SetScope; label: string; hint: string }[] = [
  { key: "base", label: "Base set", hint: "The standard prints, Leaders included: no Parallels, Manga, SP, Treasure Rares, DON!! cards or promos." },
  { key: "all", label: "Every printing we track", hint: "The base set plus Parallels, Manga, SP, Treasure Rares, special foils and DON!! cards. Promos are left out." },
];

/** A scope from a query string; anything else is the base set. */
export function parseScope(v: unknown): SetScope {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "all" ? "all" : "base";
}

/** The fields the scope rule reads. */
export interface ScopeCard {
  printing: string;
  /** A promo print the set does not count (decided by the loader from the set's kind). */
  isPromo?: boolean | null;
}

const BASE_PRINTINGS = new Set(["standard", "reprint", "promo"]);

/** Is this printing a special treatment of a card (Parallel, Manga, SP, Treasure, special foil, DON!!)? */
export function isSpecialPrinting(c: ScopeCard): boolean {
  return !BASE_PRINTINGS.has(c.printing);
}

export function cardInScope(c: ScopeCard, scope: SetScope): boolean {
  if (c.isPromo) return false;
  return scope === "all" ? true : !isSpecialPrinting(c);
}

/** Set kinds whose cards ARE promos, so promo prints count there (lib/constants.ts SET_KINDS). */
export const PROMO_SET_KINDS = new Set(["promo", "event"]);

/** Is a printing a promo the set does NOT count? */
export const promoOutsideSet = (printing: string, setKind: string): boolean => printing === "promo" && !PROMO_SET_KINDS.has(setKind);

// ── A card as the checklist carries it ───────────────────────────────────────

export interface ChecklistCard extends ScopeCard {
  id: number;
  slug: string;
  name: string;
  /** "OP01-120"; null only for DON!! cards. */
  number: string | null;
  variant: string | null;
  rarity: string | null;
  setCode: string;
  hasImage: boolean;
  /**
   * Cheapest in-stock listing at a REAL store (or TCGplayer, a US store) in the
   * reader's market, cents, or null. Never Card.low<M>, which includes eBay
   * and would let an eBay-only card read as available.
   */
  minCents: number | null;
  /** Distinct stores with that card in stock. 0 when minCents is null. */
  stores: number;
  /** No store has it, but the market's own lowest-price column has one (eBay). */
  otherSource: boolean;
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

/** "OP01-120" → ["OP01", 120]; a DON!! card (no number) sorts last. */
function numberOrder(number: string | null): [string, number] {
  const m = number?.match(/^([A-Z]+\d*)-(\d+)/i);
  return m ? [m[1].toUpperCase(), parseInt(m[2], 10)] : ["~", Number.MAX_SAFE_INTEGER];
}

/** Card number (prefix, then numerically), then printing (standard first), then id. */
export function compareByNumber(
  a: Pick<ChecklistCard, "number" | "printing" | "id">,
  b: Pick<ChecklistCard, "number" | "printing" | "id">,
): number {
  const [ap, an] = numberOrder(a.number);
  const [bp, bn] = numberOrder(b.number);
  return (
    (ap < bp ? -1 : ap > bp ? 1 : 0) ||
    an - bn ||
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

/** Rarities present in the scope, in One Piece order (L C UC R SR SEC TR PR DON!!), for the filter. */
export function raritiesIn(cards: readonly ChecklistCard[], scope: SetScope): string[] {
  const present = new Set(cards.filter((c) => cardInScope(c, scope) && c.rarity).map((c) => c.rarity as string));
  return [...present].sort((a, b) => (RARITIES[a]?.order ?? 99) - (RARITIES[b]?.order ?? 99) || a.localeCompare(b));
}

// ── The missing list, out of the page ────────────────────────────────────────

const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/**
 * One line per card: `1 Shanks OP01-120` for a standard print and
 * `1 Shanks OP01-120 (Parallel) #512345` for any other. It pastes straight
 * into Best Basket, the deck pricer or the binder's paste import (lib/deck.ts
 * parseDeckList), and the `#id` pins the exact printing, so a Parallel is never
 * priced as its base card.
 */
export function missingLine(c: Pick<ChecklistCard, "id" | "name" | "number" | "variant" | "printing">): string {
  const special = c.printing !== "standard" && c.printing !== "reprint";
  const label = c.variant ? ` (${c.variant})` : "";
  if (!c.number) return `1 ${c.name}${label} #${c.id}`;
  return `1 ${c.name} ${c.number}${label}${special ? ` #${c.id}` : ""}`;
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

/** What a card with no store listing says: on OP Compare the only other source is eBay. */
export function otherSourceLabel(_country?: string): string {
  return "eBay only";
}

/**
 * The footer under every cost to finish, verbatim (RiftCompare's owner-approved
 * wording): the figure is the cheapest listing, item price only, and delivery
 * is priced by Best Basket. One constant so the page and its test read the same words.
 */
export const SET_FOOTER_COPY = "Cheapest listing per card, before postage. Best Basket prices delivery.";
