// The data half of Best Basket (RiftCompare's lib/basket-server.ts, for MTG
// Compare). lib/basket.ts is the pure optimiser; this file is every read that
// feeds it.
//
// UNITS. A basket item is a UNIT, a (product, finish): Foil and Normal copies of
// one card are two lines. `cardId` in BasketCard and in the maps here is the
// unit key, `uid = productId * 2 + finish` as a string (contract 8.2), the same
// key the listing tuples of getBasketListings carry.
//
// EGRESS. The listings are NOT a per-request query here: they come from the
// data loader getBasketListings (published offer files of the page's own cards,
// at most BASKET_ID_CHUNK units a call), so a list priced twice reads the
// instance's file cache, not a database. The only per-user reads are the member's
// own: their remembered minimum condition (User.basketPrefs, one row, one column)
// and the cards they hold (CollectionCard). Both are select-limited and uncached,
// and this module is called only from /api/* routes (CLAUDE.md, the accounts
// exception).
//
// Nothing here swallows a listing error: a failed read used to come back as
// `[]` on RiftCompare, which the optimiser priced as "nothing in stock", a
// $0.00 plan across 0 stores. The callers answer 503 instead.

import { prisma } from "./db";
import { deckCardName } from "./deck-price";
import type { CardLite } from "./data/types";
import type { Country } from "./country";
import type { BasketCard } from "./basket";
import { meetsMinCondition, parseBasketPrefs, type BasketPrefs, type MinCondition } from "./basket-condition";
import { CONDITIONS, type Finish } from "./constants";
import { BASKET_ID_CHUNK, getBasketListings, getCardsByIds, getSetBySlug, getSetChecklist, type BasketListingTuple } from "./data";
import { ownedBySet, ownedDb } from "./set-owned";
import { missingIn, planSetGap, preReleaseGapMessage, revealedWithoutListing, type SetGapOptions, type SetGapPlan, type SetGapPrice } from "./set-gap";
import { stockOf, type ChecklistCard, type OwnedMap, type SetScope } from "./set-scope";
import { basketStoreKey } from "./shipping";

export { basketStoreKey };

/**
 * The listings for these cards at this market's stores, one (the cheapest at
 * the floor) per (card, store), keyed by card id string. `allowed` is the
 * basket's store map keys (lib/shipping.ts basketStoresFor) — stores that do
 * not post to the buyer included, so the optimiser can say which of them
 * stocked a card and why it left them out. `minCondition` (Premium's floor,
 * default "any") filters the store's row: MTG Compare keeps each store's
 * best-condition copy, so a floor can only drop a row, never swap it for a
 * better copy the store also lists. Throws on failure.
 *
 * `read` is injectable so tests and the deck price watch run can price
 * against fixtures; the routes pass nothing.
 */
export type BasketListingReader = (country: Country, uids: number[]) => Promise<BasketListingTuple[]>;
/** The condition label of a tuple's CONDITIONS index (null = unstated). */
const conditionLabel = (i: number | null): string | null => (i == null ? null : CONDITIONS[i] ?? null);
export async function loadStoreListings(
  cardIds: string[],
  country: Country,
  allowed: string[],
  minCondition: MinCondition = "any",
  read: BasketListingReader = getBasketListings,
): Promise<Map<string, BasketCard["listings"]>> {
  const byCard = new Map<string, BasketCard["listings"]>();
  const ids = [...new Set(cardIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b);
  if (!ids.length || !allowed.length) return byCard;
  const ok = new Set(allowed);
  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += BASKET_ID_CHUNK) chunks.push(ids.slice(i, i + BASKET_ID_CHUNK));
  const rows = (await Promise.all(chunks.map((c) => read(country, c)))).flat();
  const best = new Map<string, { cardId: string; retailer: string; priceCents: number; url: string; condition: string | null }>();
  for (const [uid, source, priceCents, conditionIx, url] of rows) {
    const retailer = basketStoreKey(source);
    if (!retailer || !ok.has(retailer)) continue;
    const condition = conditionLabel(conditionIx);
    if (!meetsMinCondition(condition, minCondition)) continue;
    const cardId = String(uid);
    const k = `${cardId}|${retailer}`;
    const prev = best.get(k);
    if (!prev || priceCents < prev.priceCents) best.set(k, { cardId, retailer, priceCents, url, condition });
  }
  for (const r of best.values()) {
    const arr = byCard.get(r.cardId) ?? [];
    arr.push({ retailer: r.retailer, priceCents: r.priceCents, url: r.url, condition: r.condition });
    byCard.set(r.cardId, arr);
  }
  return byCard;
}

/** What a plan line needs to say which card it is: "Lightning Bolt (M11) 149", its slug, set and number. */
export interface BasketCardInfo {
  name: string;
  slug: string | null;
  setCode: string;
  collectorNumber: string;
}

/** A unit of a basket: its key, the product and the line's label. */
export interface BasketUnit extends BasketCardInfo {
  uid: string;
  productId: number;
  finish: Finish;
}

/** "Lightning Bolt (M11) 149" with the finish word for a Foil copy: the name a basket line, a deck line or a watch shows. */
export function basketCardName(c: Pick<CardLite, "name" | "number" | "setCode" | "flags" | "treat">, finish: Finish = "N"): string {
  return deckCardName(c, finish);
}

const uidOf = (productId: number, finish: Finish): string => String(productId * 2 + (finish === "F" ? 1 : 0));

/** The units of product ids (picker lines, the watchlist): each card in its HEADLINE finish (Normal first), named from the published catalogue. An id that is not a card is left out. */
export async function unitsFor(productIds: string[]): Promise<Map<string, BasketUnit>> {
  const ids = [...new Set(productIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  const out = new Map<string, BasketUnit>();
  if (!ids.length) return out;
  const cards = await getCardsByIds(ids);
  for (const id of ids) {
    const c = cards.get(id);
    if (!c) continue;
    const finish: Finish = c.headFinish === "F" ? "F" : "N";
    out.set(String(id), { uid: uidOf(id, finish), productId: id, finish, name: basketCardName(c, finish), slug: c.slug, setCode: c.setCode, collectorNumber: c.number ?? "" });
  }
  return out;
}

// The member's remembered Best Basket choices (User.basketPrefs): one row,
// scoped to the user, one column. Never throws: a failed read is "no prefs".
export async function loadBasketPrefs(userId: string, db: { user: Pick<typeof prisma.user, "findUnique"> } = prisma): Promise<BasketPrefs> {
  try {
    const row = await db.user.findUnique({ where: { id: userId }, select: { basketPrefs: true } });
    return parseBasketPrefs(row?.basketPrefs);
  } catch {
    return {};
  }
}

// Remember the floor a member just chose. Read-merge so a later key survives;
// a no-op when it is already what is stored. Best effort: never fails a run.
export async function saveMinConditionPref(
  userId: string,
  minCondition: MinCondition,
  db: { user: Pick<typeof prisma.user, "findUnique" | "update"> } = prisma,
): Promise<void> {
  try {
    const row = await db.user.findUnique({ where: { id: userId }, select: { basketPrefs: true } });
    const prefs = parseBasketPrefs(row?.basketPrefs);
    if (prefs.minCondition === minCondition) return;
    const existing = row?.basketPrefs && typeof row.basketPrefs === "object" && !Array.isArray(row.basketPrefs) ? (row.basketPrefs as Record<string, unknown>) : {};
    await db.user.update({ where: { id: userId }, data: { basketPrefs: { ...existing, minCondition } } });
  } catch (e) {
    console.error("[basket] saving the minimum condition failed", e);
  }
}

// How many copies of each of these units the account already holds, for "Skip
// copies I already own". A row is a (card, condition, foil) holding, hence the
// sum per unit; 400 rows covers two per card at the 200-line cap.
export async function loadOwnedQty(userId: string, uids: string[]): Promise<Map<string, number>> {
  const owned = new Map<string, number>();
  const ids = [...new Set(uids.map((u) => Math.floor(Number(u) / 2)).filter((n) => Number.isInteger(n) && n > 0))];
  if (!ids.length) return owned;
  const rows = await prisma.collectionCard.findMany({
    where: { userId, cardId: { in: ids } },
    select: { cardId: true, isFoil: true, quantity: true },
    take: 400,
  });
  for (const r of rows) { const k = uidOf(r.cardId, r.isFoil ? "F" : "N"); owned.set(k, (owned.get(k) ?? 0) + r.quantity); }
  return owned;
}

// ── The binder, for replacement cost ─────────────────────────────────────────
// A CollectionCard row is a card you hold: the "binder" source prices
// REPLACEMENT — what re-buying them would cost today, delivered. A collection
// past MAX_HOLDINGS is priced on its dearest rows (by the catalogue's cheapest
// listing in the market), and the answer says so.
export const MAX_HOLDINGS = 200;
const BINDER_ROW_CAP = 3000;

export interface BinderHolding extends BasketCardInfo {
  cardId: string; // the unit key (productId * 2 + finish)
  qty: number;
  valueCents: number;
}

export async function loadBinderHoldings(userId: string, country: Country): Promise<{ wanted: BinderHolding[]; skipped: number; empty: boolean }> {
  const rows = await prisma.collectionCard.findMany({ where: { userId }, select: { cardId: true, isFoil: true, quantity: true }, take: BINDER_ROW_CAP });
  const idsOf = (foil: boolean) => [...new Set(rows.filter((r) => r.isFoil === foil).map((r) => r.cardId))];
  const [n, f] = await Promise.all([idsOf(false), idsOf(true)].map((ids, i) => (ids.length ? getCardsByIds(ids, { unit: i === 0 ? "N" : "F" }) : Promise.resolve(new Map<number, CardLite>()))));
  const merged = new Map<string, BinderHolding>();
  for (const r of rows) {
    const finish: Finish = r.isFoil ? "F" : "N", c = (r.isFoil ? f : n)!.get(r.cardId);
    if (!c) continue; // a stale id left by a restore: one bad row must not fail the request
    const id = uidOf(r.cardId, finish);
    const unit = c.low[country] ?? 0;
    const ex = merged.get(id);
    if (ex) {
      ex.qty += r.quantity;
      ex.valueCents += unit * r.quantity;
    } else {
      merged.set(id, { cardId: id, name: basketCardName(c, finish), slug: c.slug, setCode: c.setCode, collectorNumber: c.number ?? "", qty: r.quantity, valueCents: unit * r.quantity });
    }
  }
  const ranked = [...merged.values()].sort((a, b) => b.valueCents - a.valueCents);
  const wanted = ranked.slice(0, MAX_HOLDINGS);
  return { wanted, skipped: ranked.length - wanted.length, empty: merged.size === 0 };
}

// ── Finish this set (source "set") ───────────────────────────────────────────
// RiftCompare's loadSetGapLines, for MTG Compare. The set's cards and the
// account's owned map are the SET TRACKER's own readers (getSetChecklist, the
// cached catalogue half; ownedBySet, one narrow per-user groupBy), so "missing"
// here is exactly what /portfolio/sets/<set> shows as missing.
//
// The price used to RANK and to apply the member's ceiling is what the PLAN
// would pay, not the checklist's cheapest listing (any condition, any real
// store, postage-less stores included): the cheapest copy at the member's
// minimum condition among the stores whose postage we can price. So "your 200
// cheapest" are the 200 the plan can buy, and a card only a postage-less store
// stocks, or only below the floor, is counted apart (lib/set-gap.ts) instead of
// taking a chunk slot and coming back "not covered". The plan itself is priced
// afterwards by loadStoreListings, unchanged, for at most SET_GAP_CHUNK ids.
//
// EGRESS. loadSetGapPrices reads the self-cached getBasketListings loader (the
// same Data Cache entries a basket run reads, 40 cards a chunk), never Postgres,
// and only the set source calls it.
export interface SetGapDeps {
  checklist: (setId: number, country: Country) => Promise<ChecklistCard[]>;
  owned: (userId: string, setId: number) => Promise<OwnedMap>;
  prices: (cardIds: number[], country: Country, stores: string[], minCondition: MinCondition) => Promise<Map<number, SetGapPrice>>;
}
const setGapDeps: SetGapDeps = {
  checklist: getSetChecklist,
  owned: async (userId, setId) => ownedBySet(await ownedDb(), userId, setId),
  prices: (ids, country, stores, floor) => loadSetGapPrices(ids, country, stores, floor),
};

/**
 * Per card: its cheapest in-stock copy at `minCondition` and its cheapest in any
 * condition, both at `stores` (the ones the plan can price postage for). A card
 * with no row at all has no entry. Throws on failure, like loadStoreListings.
 */
export type UnitResolver = (productIds: number[]) => Promise<Map<number, number>>;
/** product id -> the uid of its headline finish (Normal first). */
const headlineUnits: UnitResolver = async (ids) => {
  const cards = await getCardsByIds(ids);
  return new Map(ids.flatMap((id): [number, number][] => { const c = cards.get(id); return c ? [[id, id * 2 + (c.headFinish === "F" ? 1 : 0)]] : []; }));
};

export async function loadSetGapPrices(
  cardIds: number[],
  country: Country,
  stores: string[],
  minCondition: MinCondition,
  read: BasketListingReader = getBasketListings,
  unitOf: UnitResolver = headlineUnits,
): Promise<Map<number, SetGapPrice>> {
  const out = new Map<number, SetGapPrice>();
  const ids = [...new Set(cardIds.filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b);
  if (!ids.length || !stores.length) return out;
  const ok = new Set(stores);
  const uids = [...(await unitOf(ids)).values()];
  const chunks: number[][] = [];
  for (let i = 0; i < uids.length; i += BASKET_ID_CHUNK) chunks.push(uids.slice(i, i + BASKET_ID_CHUNK));
  const rows = (await Promise.all(chunks.map((c) => read(country, c)))).flat();
  for (const [uid, source, priceCents, conditionIx] of rows) {
    const retailer = basketStoreKey(source);
    if (!retailer || !ok.has(retailer)) continue;
    const productId = uid >> 1, condition = conditionLabel(conditionIx);
    const cur = out.get(productId) ?? { floorCents: null, anyCents: null };
    if (cur.anyCents == null || priceCents < cur.anyCents) cur.anyCents = priceCents;
    if (meetsMinCondition(condition, minCondition) && (cur.floorCents == null || priceCents < cur.floorCents)) cur.floorCents = priceCents;
    out.set(productId, cur);
  }
  return out;
}

export type SetGapLoad =
  | { ok: true; setName: string; plan: SetGapPlan }
  | { ok: false; reason: "unknown-set" | "preorder"; message: string };

/** What the plan can buy with: the stores whose postage we can price for this buyer, and the floor. */
export interface SetGapBuy {
  stores: string[];
  minCondition: MinCondition;
}

export async function loadSetGapLines(
  userId: string,
  setSlug: string,
  scope: SetScope,
  country: Country,
  opts: Omit<SetGapOptions, "scope" | "prices">,
  buy: SetGapBuy,
  deps: SetGapDeps = setGapDeps,
): Promise<SetGapLoad> {
  const set = await getSetBySlug(setSlug);
  if (!set) return { ok: false, reason: "unknown-set", message: "That set isn't one we track." };
  const cards = await deps.checklist(set.id, country);
  // A set that has not released has no total to finish: the answer is how many
  // revealed cards have no listing yet, never a plan.
  if (set.releasedOn && set.releasedOn > new Date().toISOString().slice(0, 10)) {
    return { ok: false, reason: "preorder", message: preReleaseGapMessage(set.name, revealedWithoutListing(cards)) };
  }
  const owned = await deps.owned(userId, set.id);
  const { missing } = missingIn(cards, owned, { scope, rarity: opts.rarity });
  const listedIds = missing.filter((c) => stockOf(c) === "store").map((c) => c.id);
  const prices = await deps.prices(listedIds, country, buy.stores, buy.minCondition);
  return { ok: true, setName: set.name, plan: planSetGap(set.code, cards, owned, { ...opts, scope, prices }) };
}
