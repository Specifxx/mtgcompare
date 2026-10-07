// FINISH THIS SET: the pure half — RiftCompare's lib/set-gap.ts, ported in wave 2
// (2026-10-03). OP Compare's cards are Int ids with a "OP01-120" number and a
// printing; the cursor carries all three so the rank can be recomputed. The
// tools track's /api/basket `source=set` branch reads this (shared edit).
//
// The set tracker (lib/set-scope.ts) says what a binder is missing from a set;
// this turns that gap into the list Best Basket prices. Everything that decides
// WHICH cards are in one plan lives here with no database, so the route, the
// page copy and the tests read one definition.
//
//   • wanted = the set's cards in the chosen scope (and rarity), minus the ones
//     the account owns (any finish, any condition: the tracker's own rule, so
//     "missing" here is exactly what the checklist shows as missing);
//   • one copy of each;
//   • a card with no in-stock REAL-STORE listing (nothing anywhere, or eBay only)
//     is not priced: it is listed apart as "not stocked", never dropped;
//   • RANKED AND CEILINGED ON WHAT THE PLAN BUYS. When the caller hands over
//     `prices` (the cheapest copy at the member's minimum condition, at the
//     stores whose postage we can price: lib/basket-server.ts loadSetGapPrices),
//     that is the price a card is ranked and ceilinged by, so "your 200 cheapest"
//     are the 200 the plan can buy and a card is never priced above the limit
//     the member set. A card listed only where we cannot price postage, or only
//     below the floor, is counted apart (`noPostageCount`, `belowFloorCount`),
//     never chunked and then reported "not covered";
//   • an optional per-card ceiling leaves out the dearer ones, and says how many;
//   • ONE PLAN HOLDS AT MOST SET_GAP_CHUNK CARDS (Best Basket's 200-line cap).
//     A bigger gap is served as a ranked chunk, cheapest first, with one plain
//     line and a step to the next chunk. Never silently partial. The step is a
//     CURSOR (the last card's price, number and id), not a rank: ownership and
//     prices move between two clicks, and a rank offset would skip cards.
//
// Client-safe: imports only pure modules (tests/client-imports.test.ts).
import { SET_GAP_CHUNK } from "./tier-limits";
import {
  cardInScope,
  compareByNumber,
  isOwned,
  stockOf,
  type ChecklistCard,
  type OwnedMap,
  type SetScope,
} from "./set-scope";

/** Cards in one plan: Best Basket's 200-line cap, from lib/tier-limits.ts (its one home). */
export { SET_GAP_CHUNK };

/** How many not-stocked cards a Premium answer names; the rest are counted. */
export const NOT_STOCKED_LIST_CAP = 200;

/**
 * Where the next chunk starts: the last card of the chunk before, by the rank
 * key (price, collector number, id). Strictly after it, so a card bought or
 * ticked off between two clicks moves nothing.
 */
export interface SetGapCursor {
  cents: number;
  number: string | null;
  printing: string;
  id: number;
}

export function encodeCursor(c: SetGapCursor): string {
  return `${c.cents}|${c.number ?? "-"}|${c.printing}|${c.id}`;
}

/** A cursor from a request; anything that is not exactly one is null (the first chunk). */
export function parseCursor(v: unknown): SetGapCursor | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{1,9})\|([A-Za-z0-9-]{1,24})\|([a-z]{1,16})\|(\d{1,10})$/.exec(v);
  return m ? { cents: parseInt(m[1], 10), number: m[2] === "-" ? null : m[2], printing: m[3], id: parseInt(m[4], 10) } : null;
}

/** What one card costs the plan: its cheapest copy at the floor and its cheapest in any condition, at stores we can price postage for. */
export interface SetGapPrice {
  floorCents: number | null;
  anyCents: number | null;
}

export interface SetGapOptions {
  scope: SetScope;
  /** Only this rarity (the checklist's own filter), or null for all. */
  rarity?: string | null;
  /** Leave out cards whose cheapest listing is dearer than this, cents. */
  maxPriceCents?: number | null;
  /** Start strictly after this card (the chunk before's last), or null for the first chunk. */
  after?: SetGapCursor | null;
  /**
   * What each card costs the plan (see the header). Absent: the checklist's own
   * cheapest listing ranks and ceilings. A card with no entry is not priceable.
   */
  prices?: ReadonlyMap<number, SetGapPrice> | null;
}

/** Counts only: safe to send to any signed-in account (no store, line or link). */
export interface SetGapSummary {
  setCode: string;
  scope: SetScope;
  rarity: string | null;
  maxPriceCents: number | null;
  /** Cards in scope (and rarity) the account owns. */
  ownedInScope: number;
  /** Cards in scope (and rarity) it is missing. */
  gapTotal: number;
  /** Of those, cards the plan can price: a listing at the floor at a store we can price postage for. */
  stocked: number;
  /** Stocked cards dearer than the ceiling: left out at the member's own choice. */
  overCeiling: number;
  /** Stocked cards within the ceiling: what the chunks are cut from. */
  candidates: number;
  /** How many cards this chunk holds. */
  inChunk: number;
  /** This chunk carries on from a cursor (it is not the cheapest end of the list). */
  continued: boolean;
  /** A cursor was sent but nothing was left after it, so this starts again from the cheapest. */
  restarted: boolean;
  /** Candidates past this chunk: "N more not included". */
  moreAfter: number;
  /** Cursor for the next chunk, or null when this is the last. */
  nextCursor: string | null;
  /** Missing cards with no in-stock real-store listing: listed apart, not priced. */
  notStockedCount: number;
  /** Missing cards a store lists, but only where we cannot price postage: not in the plan. */
  noPostageCount: number;
  /** Missing cards a priceable store lists, but only below the minimum condition: not in the plan. */
  belowFloorCount: number;
}

export interface SetGapPlan {
  /** This chunk's cards, cheapest first: one copy each. */
  chunk: ChecklistCard[];
  /** Every missing card no real store has in stock, by collector number. */
  notStocked: ChecklistCard[];
  summary: SetGapSummary;
}

interface Ranked {
  card: ChecklistCard;
  cents: number;
}

/** Cheapest first; ties by card number, printing then id: a stable order the cursor can be recomputed from. */
function rankCmp(a: SetGapCursor, b: SetGapCursor): number {
  return a.cents - b.cents || compareByNumber(a, b);
}
const keyOf = (r: Ranked): SetGapCursor => ({ cents: r.cents, number: r.card.number, printing: r.card.printing, id: r.card.id });

/** The set's cards in scope (and rarity) the account does not hold, and how many it does. */
export function missingIn(
  cards: readonly ChecklistCard[],
  owned: OwnedMap,
  opts: Pick<SetGapOptions, "scope" | "rarity">,
): { missing: ChecklistCard[]; ownedInScope: number } {
  const rarity = opts.rarity ? opts.rarity : null;
  let ownedInScope = 0;
  const missing: ChecklistCard[] = [];
  for (const c of cards) {
    if (!cardInScope(c, opts.scope)) continue;
    if (rarity && c.rarity !== rarity) continue;
    if (isOwned(owned, c.id)) ownedInScope++;
    else missing.push(c);
  }
  return { missing, ownedInScope };
}

export function planSetGap(
  setCode: string,
  cards: readonly ChecklistCard[],
  owned: OwnedMap,
  opts: SetGapOptions,
): SetGapPlan {
  const rarity = opts.rarity ? opts.rarity : null;
  const ceiling = opts.maxPriceCents != null && opts.maxPriceCents > 0 ? Math.floor(opts.maxPriceCents) : null;
  const { missing, ownedInScope } = missingIn(cards, owned, opts);

  const listed = missing.filter((c) => stockOf(c) === "store");
  const notStocked = missing.filter((c) => stockOf(c) !== "store").sort(compareByNumber);
  // What the plan can buy, at the price it would pay.
  const buyable: Ranked[] = [];
  let noPostageCount = 0;
  let belowFloorCount = 0;
  for (const c of listed) {
    if (!opts.prices) {
      buyable.push({ card: c, cents: c.minCents ?? 0 });
      continue;
    }
    const p = opts.prices.get(c.id);
    if (p?.floorCents != null) buyable.push({ card: c, cents: p.floorCents });
    else if (p?.anyCents != null) belowFloorCount++;
    else noPostageCount++;
  }
  const within = ceiling == null ? buyable : buyable.filter((r) => r.cents <= ceiling);
  const ranked = [...within].sort((a, b) => rankCmp(keyOf(a), keyOf(b)));
  let start = opts.after ? ranked.findIndex((r) => rankCmp(keyOf(r), opts.after!) > 0) : 0;
  // A cursor with nothing after it while cards remain: ownership or prices
  // moved between two clicks. Start again rather than say the list is done.
  const restarted = !!opts.after && start < 0 && ranked.length > 0;
  if (start < 0) start = restarted ? 0 : ranked.length;
  const slice = ranked.slice(start, start + SET_GAP_CHUNK);
  const chunk = slice.map((r) => (r.card.minCents === r.cents ? r.card : { ...r.card, minCents: r.cents }));
  const moreAfter = Math.max(0, ranked.length - (start + slice.length));

  return {
    chunk,
    notStocked,
    summary: {
      setCode,
      scope: opts.scope,
      rarity,
      maxPriceCents: ceiling,
      ownedInScope,
      gapTotal: missing.length,
      stocked: buyable.length,
      overCeiling: buyable.length - within.length,
      candidates: ranked.length,
      inChunk: chunk.length,
      continued: start > 0,
      restarted,
      moreAfter,
      nextCursor: moreAfter > 0 && slice.length ? encodeCursor(keyOf(slice[slice.length - 1])) : null,
      notStockedCount: notStocked.length,
      noPostageCount,
      belowFloorCount,
    },
  };
}

/**
 * The one plain line above a chunked plan, or null when the whole gap fits in
 * one plan. The first chunk reads exactly "Your 200 cheapest missing cards. N
 * more not included."; a later one says it is the next cheapest.
 */
export function setGapNote(s: Pick<SetGapSummary, "inChunk" | "moreAfter" | "continued" | "restarted">): string | null {
  if (s.inChunk === 0) return null;
  const more = s.moreAfter > 0 ? `${s.moreAfter} more not included.` : null;
  if (s.continued) {
    return `The next ${s.inChunk} cheapest missing cards. ${more ?? "That is all of the rest."}`;
  }
  const first = more ? `Your ${s.inChunk} cheapest missing cards. ${more}` : null;
  if (s.restarted) {
    const changed = "Your list or the prices changed since the last plan, so this starts again from the cheapest.";
    return first ? `${changed} ${first}` : changed;
  }
  return first;
}

/** The label on the step to the next chunk. */
export function nextChunkLabel(s: Pick<SetGapSummary, "moreAfter">): string {
  return `Plan the next ${Math.min(SET_GAP_CHUNK, s.moreAfter)}`;
}

/** The refusal when nothing missing can be priced, by cause: nothing stocked, postage we cannot price, or the floor. */
export function nothingPricedMessage(
  s: Pick<SetGapSummary, "gapTotal" | "notStockedCount" | "noPostageCount" | "belowFloorCount">,
  place: string,
): string {
  if (s.notStockedCount >= s.gapTotal) return nothingStockedMessage(s.gapTotal, place);
  const parts: string[] = [];
  if (s.belowFloorCount > 0) {
    parts.push(
      `${s.belowFloorCount} ${plural(s.belowFloorCount, "is", "are")} only in stock below your minimum condition (choose Anything to price ${plural(s.belowFloorCount, "it", "them")})`,
    );
  }
  if (s.noPostageCount > 0) {
    parts.push(`${s.noPostageCount} ${plural(s.noPostageCount, "is", "are")} only stocked at stores we can't price postage for`);
  }
  return `None of the ${s.gapTotal} ${s.gapTotal === 1 ? "card" : "cards"} you're missing can be priced delivered in ${place} right now${parts.length ? `: ${parts.join("; ")}` : ""}.`;
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** The refusal for a set that has not released, with how many revealed cards have no listing yet. No denominator. */
export function preReleaseGapMessage(setName: string, revealedNoListing: number): string {
  return `${setName} isn't out yet, so there is nothing to order. ${revealedNoListing} ${
    revealedNoListing === 1 ? "revealed card has" : "revealed cards have"
  } no store listing yet.`;
}

/** Revealed (non-promo) cards of a set that no real store lists yet. */
export function revealedWithoutListing(cards: readonly ChecklistCard[]): number {
  return cards.filter((c) => !c.isPromo && stockOf(c) !== "store").length;
}

/** The set page's copy for a plan that could not be built because nothing missing has a store listing. */
export function nothingStockedMessage(missing: number, place: string): string {
  return `None of the ${missing} ${missing === 1 ? "card" : "cards"} you're missing has a store listing in ${place} right now.`;
}

/** The set part of a Best Basket answer that /api/basket adds, by tier. */
export interface SetGapAnswer {
  summary: SetGapSummary;
  setName: string;
  notStocked: { name: string; setCode: string; number: string | null }[];
}

/**
 * What a set answer adds to the response. Counts for EVERY signed-in account
 * (`setGap`: no store, line, link or card name); the named not-stocked cards
 * are Premium's, like the rest of the plan. The route spreads exactly this, so
 * a non-Premium payload carries nothing more.
 */
export function setGapFields(
  full: boolean,
  a: SetGapAnswer,
): { setGap: SetGapSummary } | { setGap: SetGapSummary; setName: string; notStocked: SetGapAnswer["notStocked"] } {
  return full ? { setGap: a.summary, setName: a.setName, notStocked: a.notStocked } : { setGap: a.summary };
}
