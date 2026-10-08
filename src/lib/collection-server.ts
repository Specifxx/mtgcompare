// THE BINDER, server side: every database read and write behind /portfolio,
// /api/collection/** and /api/portfolio/**. Route files may export only their
// handlers and may not import @/lib/db (tests/app-no-db-import.test.ts), so the
// logic lives here and the routes keep only the session read, the same-origin
// check, the rate limit and the response.
//
// Egress (CLAUDE.md, the accounts exception): every query is scoped to ONE
// account, select-limited and bounded. The rows carry card ids and NO card join
// (a card is published data, not a table): each row is priced from the loaders of
// lib/data (getCardsByIds), exactly as the watchlist route does. Called only from
// /api/* routes and account pages (/portfolio/**), never from a cached loader or
// the root layout.
//
// A binder row is a UNIT: a product (Card.id, the TCGplayer productId) in a
// finish. `isFoil` true is the Foil unit of the product (its own market price and
// history); it is not a toggle on the price of the card. Every write goes through
// track.ts normalizeFoil, so a product that has only one finish is stored in it,
// and the row's `setId` is written from the published data (there is no foreign
// key, so the per-set views filter on the column).
import { prisma } from "./db";
import { getCardsByIds, getIndexSeries, getRecentHistory, getSets, resolveBySetNumber, type CardLite } from "./data";
import { fold, finishLabel, unitKey, type Finish, CARD_FLAGS, PRICE_MASK } from "./constants";
import type { Country } from "./country";
import { cardImage } from "./images";
import { matchCsvRows, parseCollectionCsv, type CsvData } from "./collection-csv";
import { parseDeckList } from "./deck";
import { loaderData, resolveDeckLines } from "./deck-price";
import { normalizeFoil } from "./track";
import { isPremium, type EntitlementFields } from "./premium";
import { addCopies, collectionRowStore } from "./collection-add";
import { costAfterQuantityChange, investedCents, QUANTITY_CAP, unitCostCents } from "./collection-cost";
import { CONDITION_MULTIPLIER, copyValueCents, finishOfRow, isConditionKey } from "./collection-conditions";
import { checkFreeAllowance, freeLimitBody, FREE_LIMIT_STATUS, type Allowance, type HoldingsCounter } from "./free-limits";
import { indexChange, METHODOLOGY_BREAKS, portfolioPerformance, scaleSeries, type PricePoint } from "./portfolio-performance";

// The portfolio tracker (value history, cost-basis P&L, benchmark, CSV export) is
// FREE for every account, (PORTFOLIO_FREE) — flip this to
// false to put it back behind a paid tier. Gates read `isPremium(user) ||
// PORTFOLIO_FREE`, so re-gating is a one-line change with no other edits. The
// 50-card free LIMIT (lib/free-limits.ts) is separate and always enforced.
export const PORTFOLIO_FREE = true;

/** Rows one GET returns: even power collections stay bounded per request (egress). */
export const COLLECTION_TAKE = 2000;
/** Days of history the value chart draws . */
export const PORTFOLIO_WINDOW_DAYS = 90;

export type Account = EntitlementFields & { id: string; email: string };

export interface RouteResult {
  status: number;
  body: Record<string, unknown>;
}

const ok = (body: Record<string, unknown>): RouteResult => ({ status: 200, body });
const err = (status: number, error: string, extra: Record<string, unknown> = {}): RouteResult => ({ status, body: { error, ...extra } });

// ── The card a row shows (from the cached catalogue) ────────────────────────

/** The narrow card fields the editor and the share page render. */
export interface CollectionCardInfo {
  id: number;
  slug: string;
  name: string;
  number: string | null;
  /** The treatment words of the product ("Borderless", "Extended Art"), null for a plain one. */
  variant: string | null;
  /** The first treatment key ("borderless"), "standard" for a plain product. */
  printing: string;
  rarity: string | null;
  setCode: string;
  hasImage: boolean;
  img: string | null;
  /** Which finishes the product has a TCGplayer row for. A Foil-only product (Foil Etched, Surge Foil ...) has hasN false. */
  hasN: boolean;
  hasF: boolean;
  /** What the Foil unit is called on this product: "Foil", "Foil Etched", "Surge Foil" ... */
  foilLabel: string;
  /** TCGplayer market price of each finish in US cents (null = no row, or low-only); the editor shows them beside the finish switch. */
  marketN: number | null;
  marketF: number | null;
}

export function cardInfo(card: CardLite, setCode: string): CollectionCardInfo {
  return {
    id: card.id,
    slug: card.slug,
    name: card.name,
    number: card.number,
    variant: card.variant,
    printing: card.printing,
    rarity: card.rarity,
    setCode,
    hasImage: card.hasImage,
    img: card.hasImage ? cardImage.thumb(card.id) : null,
    hasN: card.n != null,
    hasF: card.f != null,
    foilLabel: finishLabel(card, "F"),
    marketN: card.n?.market ?? null,
    marketF: card.f?.market ?? null,
  };
}

/** The finishes a product has, as the mask normalizeFoil reads. */
export const maskOfCard = (c: Pick<CardLite, "n" | "f">): number => (c.n ? PRICE_MASK.HASN : 0) | (c.f ? PRICE_MASK.HASF : 0);

/** "Stingcaster Mage (Borderless · Facet Foil)": the name with its treatment words, as every list shows it. */
export const displayName = (c: { name: string; variant: string | null }) => `${c.name}${c.variant ? ` (${c.variant})` : ""}`;

// ── Reads ───────────────────────────────────────────────────────────────────

export interface CollectionRow {
  id: string;
  cardId: number;
  condition: string;
  isFoil: boolean;
  quantity: number;
  costBasisCents: number | null;
  costBasisIsTotal: boolean;
  note: string | null;
}

const ROW_SELECT = {
  id: true, cardId: true, condition: true, isFoil: true, quantity: true, costBasisCents: true, costBasisIsTotal: true, note: true,
} as const;

/** One account's rows, newest edit first, capped. No card join. */
export function collectionRows(userId: string, take = COLLECTION_TAKE): Promise<CollectionRow[]> {
  return prisma.collectionCard.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take, select: ROW_SELECT });
}

export type CollectionItem = CollectionRow & { card: CollectionCardInfo };

/** The editor's list: rows with their card from the catalogue; a row whose card is gone is dropped. */
export async function collectionItems(userId: string): Promise<CollectionItem[]> {
  const rows = await collectionRows(userId);
  const cards = await getCardsByIds(rows.map((r) => r.cardId));
  return rows
    .map((r) => {
      const card = cards.get(r.cardId);
      return card ? { ...r, card: cardInfo(card, card.setCode) } : null;
    })
    .filter((x): x is CollectionItem => x != null);
}

// ── The free portfolio limit ────────
// One row per condition (5) × foil (2) per card at most; the take bounds the
// read to that. The distinct count is COUNT(DISTINCT "cardId") in SQL, never a
// row pull.
const ROWS_PER_PORTFOLIO_CARD = 10;

export type PortfolioLimitDb = {
  collectionCard: { findMany: (args: { where: object; select: { cardId: true }; take: number }) => PromiseLike<{ cardId: number }[]> };
  $queryRaw: (q: TemplateStringsArray, ...v: unknown[]) => PromiseLike<{ n: number | bigint }[]>;
};

/** Distinct cards in one account's portfolio (CollectionCard rows). */
export function portfolioHoldings(db: PortfolioLimitDb, userId: string): HoldingsCounter<number> {
  return {
    async held(cardIds) {
      const rows = await db.collectionCard.findMany({
        where: { userId, cardId: { in: cardIds } },
        select: { cardId: true },
        take: cardIds.length * ROWS_PER_PORTFOLIO_CARD,
      });
      return new Set(rows.map((r) => r.cardId));
    },
    async count() {
      const rows = await db.$queryRaw`SELECT COUNT(DISTINCT "cardId")::int AS n FROM "CollectionCard" WHERE "userId" = ${userId}`;
      return Number(rows[0]?.n ?? 0);
    },
  };
}

/** May these cards be added to `account`'s portfolio? */
export function portfolioAllowance(db: PortfolioLimitDb, account: EntitlementFields & { id: string }, cardIds: number[]): Promise<Allowance<number>> {
  return checkFreeAllowance(portfolioHoldings(db, account.id), "portfolio", cardIds, isPremium(account));
}

const limitDb = prisma as unknown as PortfolioLimitDb;

// ── Writes ──────────────────────────────────────────────────────────────────

const intIn = (v: unknown, lo: number, hi: number): number | undefined =>
  typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : undefined;

/** A card id from a body: a positive integer, or its decimal string. */
export function parseCardId(v: unknown): number | null {
  const n = typeof v === "string" && /^\d{1,10}$/.test(v) ? Number(v) : v;
  return typeof n === "number" && Number.isSafeInteger(n) && n > 0 ? n : null;
}

const MAX_COST_CENTS = 100_000_000;

export interface AddBody {
  cardId: number;
  condition: string;
  isFoil?: boolean;
  quantity: number;
  costBasisCents?: number | null;
  costBasisIsTotal?: boolean;
  note?: string | null;
}

/**
 * The POST body, validated (written out: the site carries no zod). null = 400. `condition` defaults to NM and `quantity` to 1; `isFoil`
 * left out means Normal (or the only finish the product has).
 */
export function parseAddBody(raw: unknown): AddBody | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const cardId = parseCardId(b.cardId);
  if (cardId == null) return null;
  const condition = b.condition === undefined ? "NM" : b.condition;
  if (!isConditionKey(condition)) return null;
  if (b.isFoil !== undefined && typeof b.isFoil !== "boolean") return null;
  const quantity = b.quantity === undefined ? 1 : intIn(b.quantity, 1, QUANTITY_CAP);
  if (quantity === undefined) return null;
  let costBasisCents: number | null | undefined;
  if (b.costBasisCents === null) costBasisCents = null;
  else if (b.costBasisCents !== undefined) {
    costBasisCents = intIn(b.costBasisCents, 0, MAX_COST_CENTS);
    if (costBasisCents === undefined) return null;
  }
  if (b.costBasisIsTotal !== undefined && typeof b.costBasisIsTotal !== "boolean") return null;
  let note: string | null | undefined;
  if (b.note === null) note = null;
  else if (b.note !== undefined) {
    if (typeof b.note !== "string") return null;
    note = b.note.trim();
    if (note.length > 120) return null;
  }
  return {
    cardId, condition, quantity, costBasisCents, note,
    ...(b.isFoil !== undefined ? { isFoil: b.isFoil as boolean } : {}),
    ...(b.costBasisIsTotal !== undefined ? { costBasisIsTotal: b.costBasisIsTotal as boolean } : {}),
  };
}

/**
 * POST /api/collection: add copies of a card (or increment the row already
 * there for the same card/condition/foil). 404 unknown card, 402 at the free
 * limit (a NEW card only), 409 full at 999 or busy after racing writes.
 */
export async function addToCollection(account: Account, raw: unknown): Promise<RouteResult> {
  const d = parseAddBody(raw);
  if (!d) return err(400, "Invalid input");
  const card = (await getCardsByIds([d.cardId])).get(d.cardId);
  if (!card) return err(404, "Card not found");

  // THE FREE PORTFOLIO LIMIT (lib/free-limits.ts): a free account keeps up to
  // FREE_PORTFOLIO_LIMIT distinct cards; any paid tier is unlimited. Only a card
  // NOT already in the portfolio is refused: more copies, another condition of
  // a card already held, and every existing entry of an account already over
  // the limit keep working.
  const allowance = await portfolioAllowance(limitDb, account, [card.id]);
  if (allowance.blocked.length) {
    return { status: FREE_LIMIT_STATUS, body: { ...freeLimitBody("portfolio", allowance.count ?? allowance.limit) } };
  }

  // ADDING COPIES HAS TO KEEP THE ROW'S COST HONEST AND NEVER LOSE A COPY
  // (lib/collection-add.ts, lib/collection-cost.ts): one narrow read on the
  // unique key and one guarded increment, so two overlapping adds both count.
  // The finish: what the owner picked, else Normal; the only finish a product has is forced (normalizeFoil).
  const isFoil = normalizeFoil({ mask: maskOfCard(card) }, d.isFoil ?? false);
  const store = collectionRowStore(prisma, { userId: account.id, cardId: card.id, condition: d.condition, isFoil }, d.note, card.setId);
  const res = await addCopies(store, { quantity: d.quantity, costBasisCents: d.costBasisCents, costBasisIsTotal: d.costBasisIsTotal });
  if (res.status === "full") {
    // Not "✓ Added": nothing changed, and the UI has to be able to say so.
    return err(409, `You already have ${QUANTITY_CAP} of this card in this condition — the most one entry holds.`, { full: true });
  }
  if (res.status === "busy") return err(409, "That card was being updated at the same time — please try again.");
  return ok({ ok: true, added: res.added });
}

export interface PatchBody {
  quantity?: number;
  condition?: string;
  isFoil?: boolean;
  costBasisCents?: number | null;
  costBasisIsTotal?: boolean;
  note?: string | null;
}

/** The PATCH body, validated. Quantity 0 is allowed (it deletes the row). */
export function parsePatchBody(raw: unknown): PatchBody | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const out: PatchBody = {};
  if (b.quantity !== undefined) {
    const q = intIn(b.quantity, 0, QUANTITY_CAP);
    if (q === undefined) return null;
    out.quantity = q;
  }
  if (b.condition !== undefined) {
    if (!isConditionKey(b.condition)) return null;
    out.condition = b.condition;
  }
  if (b.isFoil !== undefined) {
    if (typeof b.isFoil !== "boolean") return null;
    out.isFoil = b.isFoil;
  }
  if (b.costBasisCents !== undefined) {
    if (b.costBasisCents === null) out.costBasisCents = null;
    else {
      const c = intIn(b.costBasisCents, 0, MAX_COST_CENTS);
      if (c === undefined) return null;
      out.costBasisCents = c;
    }
  }
  if (b.costBasisIsTotal !== undefined) {
    if (typeof b.costBasisIsTotal !== "boolean") return null;
    out.costBasisIsTotal = b.costBasisIsTotal;
  }
  if (b.note !== undefined) {
    if (b.note === null) out.note = null;
    else if (typeof b.note === "string" && b.note.trim().length <= 120) out.note = b.note.trim();
    else return null;
  }
  return out;
}

async function own(userId: string, id: string) {
  const item = await prisma.collectionCard.findUnique({ where: { id }, select: { ...ROW_SELECT, userId: true } });
  return item && item.userId === userId ? item : null;
}

/** PATCH /api/collection/[id]: edit qty/condition/foil/cost/note; quantity 0 deletes; a condition clash merges. */
export async function patchCollectionRow(userId: string, id: string, raw: unknown): Promise<RouteResult> {
  const item = await own(userId, id);
  if (!item) return err(404, "Not found");
  const d = parsePatchBody(raw);
  if (!d) return err(400, "Invalid input");

  if (d.quantity === 0) {
    await prisma.collectionCard.delete({ where: { id: item.id } });
    return ok({ ok: true, deleted: true });
  }

  // Changing condition/foil could collide with an existing (user,card,cond,foil)
  // row; merge into it rather than violating the unique key.
  const nextCondition = d.condition ?? item.condition;
  // A finish the product does not have is not storable: the only finish it has is forced (normalizeFoil).
  let nextFoil = d.isFoil ?? item.isFoil;
  if (d.isFoil != null && d.isFoil !== item.isFoil) {
    const card = (await getCardsByIds([item.cardId])).get(item.cardId);
    if (card) nextFoil = normalizeFoil({ mask: maskOfCard(card) }, d.isFoil);
  }
  if (nextCondition !== item.condition || nextFoil !== item.isFoil) {
    const clash = await prisma.collectionCard.findUnique({
      where: { userId_cardId_condition_isFoil: { userId, cardId: item.cardId, condition: nextCondition, isFoil: nextFoil } },
      select: ROW_SELECT,
    });
    if (clash && clash.id !== item.id) {
      // Merging two rows merges what was PAID for them. Both outlays known →
      // record their sum as a total (lib/collection-cost.ts). If either side has
      // no cost recorded, there is no honest sum to write, so the survivor keeps
      // its own figure rather than inventing one.
      const movedQty = d.quantity ?? item.quantity;
      const clashPaid = investedCents(clash);
      const itemPaid = investedCents({ ...item, quantity: movedQty });
      const mergedCost =
        clashPaid != null && itemPaid != null
          ? { costBasisCents: clashPaid + itemPaid, costBasisIsTotal: true }
          : {};
      const merged = await prisma.$transaction([
        prisma.collectionCard.update({
          where: { id: clash.id },
          data: { quantity: Math.min(QUANTITY_CAP, clash.quantity + movedQty), ...mergedCost, ...(d.note !== undefined ? { note: d.note } : {}) },
          select: ROW_SELECT,
        }),
        prisma.collectionCard.delete({ where: { id: item.id }, select: { id: true } }),
      ]);
      return ok({ ok: true, item: merged[0], merged: true });
    }
  }

  // A quantity change has to carry a TOTAL cost basis with it (per-unit is
  // unaffected), unless the caller sets the cost itself in this same request.
  const rescaled =
    d.costBasisCents === undefined && d.quantity != null && d.quantity !== item.quantity
      ? costAfterQuantityChange(item, d.quantity)
      : undefined;

  const updated = await prisma.collectionCard.update({
    where: { id: item.id },
    data: {
      ...(d.quantity != null ? { quantity: d.quantity } : {}),
      ...(d.condition ? { condition: d.condition } : {}),
      ...(nextFoil !== item.isFoil ? { isFoil: nextFoil } : {}),
      ...(d.costBasisCents !== undefined ? { costBasisCents: d.costBasisCents } : {}),
      ...(d.costBasisIsTotal !== undefined ? { costBasisIsTotal: d.costBasisIsTotal } : {}),
      ...(rescaled !== undefined && rescaled !== null ? { costBasisCents: rescaled } : {}),
      ...(d.note !== undefined ? { note: d.note } : {}),
    },
    select: ROW_SELECT,
  });
  return ok({ ok: true, item: updated });
}

/** DELETE /api/collection/[id]. The userId in the where is the ownership check. */
export async function deleteCollectionRow(userId: string, id: string): Promise<RouteResult> {
  const { count } = await prisma.collectionCard.deleteMany({ where: { id, userId } });
  return count ? ok({ ok: true }) : err(404, "Not found");
}

// ── The binder: value, history, P&L ──────────────

export interface Holding {
  cardId: number;
  slug: string;
  name: string; // with its treatment: "Stingcaster Mage (Borderless · Facet Foil)"
  number: string | null;
  printing: string;
  setCode: string;
  img: string | null;
  quantity: number;
  condition: string;
  isFoil: boolean;
  /** The unit the row is valued in: Foil is its own price and history. */
  finish: Finish;
  /** "Foil", "Foil Etched", "Surge Foil" ...; null for a Normal copy. */
  finishLabel: string | null;
  unitCents: number | null; // the finish's TCGplayer market price (converted) × condition multiplier; null = no market price
  valueCents: number; // unit × quantity (0 when unpriced)
  d7pct: number | null; // the unit's own 7-day price move (US market price)
  costBasisCents: number | null; // per-copy cost (averaged when the row stores a total); null = unknown
  investedCents: number | null; // what the owner actually paid for this row; null = unknown
  plCents: number | null; // unrealised profit/loss for this row (null without cost+price)
  plPct: number | null;
}

// Cost-basis profit & loss, over holdings that have BOTH a recorded cost and a
// current price (so the comparison is coherent).
export interface PnL {
  investedCents: number;
  valueCents: number;
  plCents: number;
  plPct: number | null;
  costedRows: number;
}

export interface Portfolio {
  totalCents: number;
  pricedCount: number;
  unpricedCount: number;
  holdings: Holding[]; // dearest first
  // Value per daily snapshot, like-for-like (lib/portfolio-performance.ts), in
  // the visitor's currency: US price RATIOS anchored at today's real total.
  series: PricePoint[];
  d7: number | null;
  d30: number | null;
  pnl: PnL | null; // null when no cost basis is recorded anywhere
  // Benchmark: the market index move over the same windows.
  index: { d7: number | null; d30: number | null } | null;
}

const condMult = (condition: string) => CONDITION_MULTIPLIER[condition] ?? 1;
const unitKeyOfRow = (r: { cardId: number; isFoil: boolean }) => unitKey(r.cardId, finishOfRow(r.isFoil));

/**
 * Value the user's collection in their market: current totals for everyone,
 * plus a daily value-over-time series from the history files (carry-forward
 * per unit, weighted by owned quantity × condition; lib/portfolio-performance.ts).
 * A Foil row is valued at the Foil unit's market price, a Normal row at the Normal's.
 */
export async function getPortfolio(userId: string, country: Country): Promise<Portfolio> {
  const raw = await prisma.collectionCard.findMany({ where: { userId }, take: COLLECTION_TAKE, select: ROW_SELECT });
  const cards = await getCardsByIds(raw.map((r) => r.cardId));
  const rows = raw.map((r) => ({ ...r, card: cards.get(r.cardId) ?? null }));

  // Defensive: a cardId the published data no longer has (a product withdrawn,
  // a restore that did not carry every row) must not 500 the whole binder:
  // drop the row and keep going (a live crash on a sister site, 2026-09-01).
  const validRows = rows.filter((r) => r.card != null) as (CollectionRow & { card: CardLite })[];

  const holdings: Holding[] = validRows
    .map((r) => {
      const unit = copyValueCents(r.card, r.isFoil, r.condition, country);
      const valueCents = (unit ?? 0) * r.quantity;
      // NEVER `cost * quantity` BY HAND — lib/collection-cost.ts.
      const investedRow = investedCents(r);
      const cost = unitCostCents(r);
      const plCents = investedRow != null && unit != null ? valueCents - investedRow : null;
      const plPct = plCents != null && investedRow != null && investedRow > 0 ? Math.round((plCents / investedRow) * 1000) / 10 : null;
      return {
        cardId: r.cardId,
        slug: r.card.slug,
        name: displayName(r.card),
        number: r.card.number,
        printing: r.card.printing,
        setCode: r.card.setCode,
        img: r.card.hasImage ? cardImage.thumb(r.card.id) : null,
        quantity: r.quantity,
        condition: r.condition,
        isFoil: r.isFoil,
        finish: finishOfRow(r.isFoil),
        finishLabel: r.isFoil ? finishLabel(r.card, "F") : null,
        unitCents: unit,
        valueCents,
        d7pct: null as number | null,
        costBasisCents: cost,
        investedCents: investedRow,
        plCents,
        plPct,
      };
    })
    .sort((a, b) => b.valueCents - a.valueCents);

  // History of the dearest units first (getRecentHistory caps the units at 500): one series per (product, finish).
  // Best-effort: a GitHub hiccup costs the chart and the d7/d30 chips, never the page.
  const units = [...new Map(holdings.map((h) => [unitKey(h.cardId, h.finish), { id: h.cardId, finish: h.finish }])).values()];
  const since = Date.now() - PORTFOLIO_WINDOW_DAYS * 86400_000;
  const full = units.length ? await getRecentHistory(units).catch(() => new Map<string, Map<number, number>>()) : new Map<string, Map<number, number>>();
  const byCard = new Map<string, Map<number, number>>();
  for (const [key, m] of full) byCard.set(key, new Map([...m].filter(([t]) => t >= since)));

  // Each unit's own 7-day move, break-aware like the total below.
  const d7ByUnit = new Map<string, number | null>();
  for (const key of byCard.keys()) {
    d7ByUnit.set(key, portfolioPerformance([{ cardId: key, quantity: 1, multiplier: 1 }], byCard, METHODOLOGY_BREAKS).change(7));
  }
  for (const h of holdings) h.d7pct = d7ByUnit.get(unitKey(h.cardId, h.finish)) ?? null;

  const costed = holdings.filter((h) => h.investedCents != null && h.unitCents != null);
  const anyCost = holdings.some((h) => h.investedCents != null);
  const pnl: PnL | null = anyCost
    ? (() => {
        const invested = costed.reduce((s, h) => s + (h.investedCents ?? 0), 0);
        const valueCents = costed.reduce((s, h) => s + h.valueCents, 0);
        const plCents = valueCents - invested;
        return {
          investedCents: invested,
          valueCents,
          plCents,
          plPct: invested > 0 ? Math.round((plCents / invested) * 1000) / 10 : null,
          costedRows: holdings.filter((h) => h.investedCents != null).length,
        };
      })()
    : null;

  // Like-for-like steps on the US price ratios, then anchored at today's real
  // total in the visitor's currency.
  const perf = portfolioPerformance(
    validRows.map((r) => ({ cardId: unitKeyOfRow(r), quantity: r.quantity, multiplier: condMult(r.condition) })),
    byCard,
    METHODOLOGY_BREAKS,
  );
  const totalCents = holdings.reduce((s, h) => s + h.valueCents, 0);

  // Market benchmark for the same windows (best-effort — never block the page).
  const idx = await getIndexSeries().catch(() => []);
  const index = idx.length ? { d7: indexChange(idx, 7), d30: indexChange(idx, 30) } : null;

  return {
    totalCents,
    pricedCount: holdings.filter((h) => h.unitCents != null).length,
    unpricedCount: holdings.filter((h) => h.unitCents == null).length,
    holdings,
    series: scaleSeries(perf.series, totalCents),
    d7: perf.change(7),
    d30: perf.change(30),
    pnl,
    index,
  };
}

/**
 * The dashboard's "Collection value" card (member track, wave2-plan §4 contract):
 * today's total in `market` and its 7-day move. Never throws — a failure reads
 * as an empty binder rather than breaking the dashboard.
 */
export async function getPortfolioSummary(userId: string, market: Country): Promise<{ totalCents: number; d7: number | null; cards: number }> {
  try {
    const any = await prisma.collectionCard.findFirst({ where: { userId }, select: { id: true } });
    if (!any) return { totalCents: 0, d7: null, cards: 0 };
    const p = await getPortfolio(userId, market);
    return { totalCents: p.totalCents, d7: p.d7, cards: new Set(p.holdings.map((h) => h.cardId)).size };
  } catch {
    return { totalCents: 0, d7: null, cards: 0 };
  }
}

// ── Replacement cost (/api/portfolio/replacement) ───────────────────────────
// Behind a button, never on the page render: the route reads every eligible
// listing for every card held (lib/basket-server.ts loadStoreListings), a far
// bigger query than the page's own. This half is the binder side only: this
// user's holdings, one line per card, at most REPLACEMENT_MAX_HOLDINGS of them
// (the dearest), each with what it contributes to the headline value.
export const REPLACEMENT_MAX_HOLDINGS = 200;

export async function replacementWanted(userId: string, country: Country): Promise<{
  wanted: { cardId: number; name: string; slug: string; setCode: string; collectorNumber: string; qty: number; valueCents: number }[];
  skipped: number;
  empty: boolean;
}> {
  const p = await getPortfolio(userId, country);
  if (!p.holdings.length) return { wanted: [], skipped: 0, empty: true };
  // One line per card (conditions and finishes summed): stores sell what they have, so a
  // replacement is priced at the listed condition rather than yours. The store-listing
  // reader is per product (basket-server loadStoreListings), so a Foil copy is replaced
  // at the product's listed price; its VALUE above is still the Foil unit's.
  const byCard = new Map<number, { cardId: number; name: string; slug: string; setCode: string; collectorNumber: string; qty: number; valueCents: number }>();
  for (const h of p.holdings) {
    const w =
      byCard.get(h.cardId) ??
      byCard
        .set(h.cardId, { cardId: h.cardId, name: h.name, slug: h.slug, setCode: h.setCode, collectorNumber: h.number ?? "", qty: 0, valueCents: 0 })
        .get(h.cardId)!;
    w.qty += h.quantity;
    w.valueCents += h.valueCents;
  }
  const all = [...byCard.values()].sort((a, b) => b.valueCents - a.valueCents);
  return { wanted: all.slice(0, REPLACEMENT_MAX_HOLDINGS), skipped: Math.max(0, all.length - REPLACEMENT_MAX_HOLDINGS), empty: false };
}

// ── Import (/api/collection/import) ─────────────────────────────────────────
// A pasted list ("4 Lightning Bolt (M11) 146", "1 Sol Ring (C21) 263 *F*") through
// the /deck parser and resolver (lib/deck.ts, lib/deck-price.ts), or a binder CSV
// (lib/collection-csv.ts: TCGplayer, Moxfield, Deckbox, ManaBox, our own export).
// Free like every way of entering your own binder. Both match against the published
// data (no card query), then read the account's rows for the matched cards once and
// make one guarded write per row (lib/collection-add.ts). The free limit takes every
// already-held card first, then new cards in the order given, and reports the rest:
// never a silent partial import, never an all-or-nothing refusal.
export const IMPORT_MAX_TEXT_CHARS = 500_000;
const PASTE_LINE_CAP = 300;
const LIST_CAP = 30;
const WRITE_CONCURRENCY = 8;
const WRITE_BUDGET_MS = 40_000;

interface Want {
  cardId: number;
  qty: number;
  condition: string;
  /** The finish asked for; null = not stated (Normal). The product's own finishes decide in the end (normalizeFoil). */
  isFoil: boolean | null;
  label: string;
}

async function writeWants(account: Account, wants: Want[]) {
  const cards = await getCardsByIds([...new Set(wants.map((w) => w.cardId))]);
  const gone: string[] = [];
  const rows: (Want & { isFoil: boolean; setId: number })[] = [];
  for (const w of wants) {
    const card = cards.get(w.cardId);
    if (!card) {
      gone.push(w.label);
      continue;
    }
    rows.push({ ...w, isFoil: normalizeFoil({ mask: maskOfCard(card) }, w.isFoil ?? false), setId: card.setId });
  }
  // Merge lines that land on the same row (card, condition, foil).
  const merged = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const k = `${r.cardId}|${r.condition}|${r.isFoil ? 1 : 0}`;
    const prev = merged.get(k);
    if (prev) prev.qty = Math.min(QUANTITY_CAP, prev.qty + r.qty);
    else merged.set(k, { ...r });
  }
  const list = [...merged.values()];
  const labelById = new Map<number, string>();
  for (const r of list) if (!labelById.has(r.cardId)) labelById.set(r.cardId, r.label);

  const allowance = await portfolioAllowance(limitDb, account, [...new Set(list.map((r) => r.cardId))]);
  const blocked = new Set(allowance.blocked);
  const writable = list.filter((r) => !blocked.has(r.cardId));
  const ids = [...new Set(writable.map((r) => r.cardId))];
  // No `.catch(() => [])`: an empty answer would silently take the "new copies
  // are free" path. A failed read fails the import instead.
  const existingRows = ids.length
    ? await prisma.collectionCard.findMany({
        where: { userId: account.id, cardId: { in: ids } },
        select: { cardId: true, condition: true, isFoil: true, quantity: true, costBasisCents: true, costBasisIsTotal: true },
        take: ids.length * ROWS_PER_PORTFOLIO_CARD,
      })
    : [];
  const rowKey = (cardId: number, condition: string, isFoil: boolean) => `${cardId}|${condition}|${isFoil ? 1 : 0}`;
  const existingBy = new Map(existingRows.map((r) => [rowKey(r.cardId, r.condition, r.isFoil), r]));

  let added = 0;
  let copies = 0;
  const full: string[] = [];
  const failed: string[] = [...gone];
  const landed = new Set<number>();
  const deadline = Date.now() + WRITE_BUDGET_MS;
  for (let i = 0; i < writable.length; i += WRITE_CONCURRENCY) {
    const batch = writable.slice(i, i + WRITE_CONCURRENCY);
    if (Date.now() > deadline) {
      for (const m of batch) failed.push(m.label);
      continue;
    }
    const results = await Promise.all(
      batch.map((m) => {
        const key = { userId: account.id, cardId: m.cardId, condition: m.condition, isFoil: m.isFoil };
        return addCopies(collectionRowStore(prisma, key, undefined, m.setId), { quantity: m.qty }, { existing: existingBy.get(rowKey(m.cardId, m.condition, m.isFoil)) ?? null }).catch(() => null);
      }),
    );
    batch.forEach((m, j) => {
      const res = results[j];
      if (res?.status === "added") {
        added++;
        copies += res.added;
        landed.add(m.cardId);
      } else if (res?.status === "full") full.push(m.label);
      else failed.push(m.label);
    });
  }
  return {
    added,
    copies,
    cards: landed.size,
    matchedCards: new Set(list.map((r) => r.cardId)).size,
    ...(allowance.blocked.length
      ? {
          limitSkipped: allowance.blocked.length,
          limitSkippedNames: allowance.blocked.map((id) => labelById.get(id) ?? `#${id}`).slice(0, LIST_CAP),
          freeLimit: freeLimitBody("portfolio", allowance.count ?? allowance.limit),
        }
      : {}),
    full: full.slice(0, LIST_CAP),
    failed: failed.slice(0, LIST_CAP),
    failedCount: failed.length,
  };
}

/** The published data the CSV matcher reads (REQ-WP10-7: resolveBySetNumber is the whole-catalogue lookup by set and number). */
const csvData: CsvData = {
  byIds: (ids) => getCardsByIds(ids),
  bySetNumber: (pairs) => resolveBySetNumber(pairs),
  setCodes: async (names) => {
    const want = new Set(names);
    const out = new Map<string, string>();
    for (const s of await getSets()) for (const n of [s.name, s.tcgName]) if (want.has(fold(n)) && !out.has(fold(n))) out.set(fold(n), s.tok);
    return out;
  },
};

/** POST /api/collection/import { text }. */
export async function importCollection(account: Account, text: string): Promise<RouteResult> {
  if (text.length > IMPORT_MAX_TEXT_CHARS) {
    return err(413, "That file is over 500 KB. Split it into two and import them one after the other.");
  }
  const csv = parseCollectionCsv(text);
  if (csv) {
    if (!csv.rows.length) {
      return err(400, "No lines could be imported from that file.", { skippedCount: csv.skippedCount, skipped: csv.skipped.slice(0, LIST_CAP) });
    }
    const { matched, unmatched } = await matchCsvRows(csv.rows, csvData);
    const label = (m: (typeof matched)[number]) => m.copy.name ?? `${m.card.name} (${m.card.setCode}) ${m.card.number ?? ""}`.trim();
    const res = await writeWants(
      account,
      matched.map((m) => ({ cardId: m.card.id, qty: m.copy.qty, condition: m.copy.condition, isFoil: m.isFoil, label: label(m) })),
    );
    const warnings = matched.filter((m) => m.warning).map((m) => `${label(m)}: ${m.warning}`);
    return ok({
      ok: true,
      format: "csv",
      ...res,
      unmatched: [],
      skippedCount: csv.skippedCount + unmatched.length,
      skipped: [...csv.skipped, ...unmatched]
        .sort((a, b) => a.line - b.line)
        .slice(0, LIST_CAP)
        .map((s) => ({ line: s.line, reason: s.reason, text: s.text })),
      conditionDefaulted: csv.conditionDefaulted,
      warningCount: warnings.length,
      warnings: warnings.slice(0, LIST_CAP),
    });
  }

  // A pasted list: chunks through the /deck parser and resolver (it prices up to DECK_LINE_CAP lines a call).
  const rawLines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, PASTE_LINE_CAP);
  const lines = [];
  for (let i = 0; i < rawLines.length; i += 100) lines.push(...parseDeckList(rawLines.slice(i, i + 100).join("\n")));
  if (!lines.length) return err(400, "Paste a list like “4 Lightning Bolt (M11) 146” or “1 Sol Ring (C21) 263 *F*”.");
  const wants: Want[] = [];
  const unmatched: string[] = [];
  for (let i = 0; i < lines.length; i += 100) {
    const { rows } = await resolveDeckLines(lines.slice(i, i + 100), loaderData, { options: false });
    for (const r of rows) {
      if (!r.card) {
        unmatched.push(r.line.raw);
        continue;
      }
      // A binder holds what the owner owns, so a guess would silently misvalue it. A bare name (the cheap printing of a card
      // that has dozens), a set with no number, and several ordinary products sharing a set and number are skipped and reported,
      // like an ambiguous store listing (CLAUDE.md "Matching store listings"). A pinned product (#id) or a set and number is exact.
      if (r.how === "name") {
        unmatched.push(`${r.line.raw} (add the set and number)`);
        continue;
      }
      if (r.how === "set") {
        unmatched.push(`${r.line.raw} (add the collector number)`);
        continue;
      }
      if (r.ambiguous) {
        unmatched.push(`${r.line.raw} (several products share that set and number: add the TCGplayer id as #12345)`);
        continue;
      }
      wants.push({ cardId: r.card.id, qty: r.line.qty, condition: "NM", isFoil: r.finish === "F", label: r.line.raw.slice(0, 80) });
    }
  }
  const res = await writeWants(account, wants);
  return ok({ ok: true, ...res, unmatched: [...new Set(unmatched)].slice(0, LIST_CAP) });
}

// ── Export (/api/portfolio/export) ──────────────────────────────────────────
export async function exportRows(userId: string, country: Country) {
  const rows = await collectionRows(userId);
  const cards = await getCardsByIds(rows.map((r) => r.cardId));
  const out = [];
  for (const r of rows) {
    const c = cards.get(r.cardId);
    if (!c) continue;
    out.push({
      name: c.name,
      setCode: c.setCode,
      number: c.number,
      finish: r.isFoil ? (c.flags & CARD_FLAGS.ETCHED ? ("Etched" as const) : ("Foil" as const)) : ("" as const),
      condition: r.condition,
      quantity: r.quantity,
      unitCents: copyValueCents(c, r.isFoil, r.condition, country),
      costBasisCents: unitCostCents(r),
      note: r.note,
      tcgplayerId: c.id,
    });
  }
  return out;
}
