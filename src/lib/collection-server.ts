// THE BINDER, server side — every database read and write behind /portfolio,
// /api/collection/** and /api/portfolio/** (RiftCompare's api/collection routes,
// getPortfolio from its lib/premium.ts and the portfolio half of its
// lib/free-limits-server.ts, ported in wave 2, 2026-10-03). Route files may
// export only their handlers and may not import @/lib/db
// (tests/app-no-db-import.test.ts), so the logic lives here and the routes keep
// only the session read, the same-origin check, the rate limit and the response.
//
// Egress (CLAUDE.md, the accounts exception): every query is scoped to ONE
// account, select-limited and bounded — the rows carry card ids and NO card
// join: each row is priced from the cached catalogue (getCatalog in
// lib/data.ts), exactly as the watchlist route does. Called only from /api/*
// routes and account pages (/portfolio/**), never from a cached loader or the
// root layout.
//
// Card ids are numbers (Card.id, the TCGplayer productId — one printing). OP
// has one printing per productId and TCGplayer prices the foil finish as its
// own product, so a row's `isFoil` is not a user toggle here: it defaults from
// the card's own finish (Card.finish === "Foil") and is kept for CSV and schema
// parity.
import { prisma } from "./db";
import { getCatalog, getIndexSeries, getRecentHistory, type CardLite } from "./data";
import { MARKETS, type Country } from "./country";
import { cardImage } from "./images";
import { sourceLabel } from "./stores";
import { matchCsvRows, parseCollectionCsv } from "./collection-csv";
import { indexCards, parseDeckList, resolveLine } from "./deck";
import { isPremium, type EntitlementFields } from "./premium";
import { addCopies, collectionRowStore } from "./collection-add";
import { costAfterQuantityChange, investedCents, QUANTITY_CAP, unitCostCents } from "./collection-cost";
import { CONDITION_MULTIPLIER, isConditionKey } from "./collection-conditions";
import { checkFreeAllowance, freeLimitBody, FREE_LIMIT_STATUS, type Allowance, type HoldingsCounter } from "./free-limits";
import { indexChange, METHODOLOGY_BREAKS, portfolioPerformance, scaleSeries, type PricePoint } from "./portfolio-performance";

// The portfolio tracker (value history, cost-basis P&L, benchmark, CSV export) is
// FREE for every account, as on RiftCompare (its PORTFOLIO_FREE) — flip this to
// false to put it back behind a paid tier. Gates read `isPremium(user) ||
// PORTFOLIO_FREE`, so re-gating is a one-line change with no other edits. The
// 50-card free LIMIT (lib/free-limits.ts) is separate and always enforced.
export const PORTFOLIO_FREE = true;

/** Rows one GET returns: even power collections stay bounded per request (egress). */
export const COLLECTION_TAKE = 2000;
/** Days of history the value chart draws (RiftCompare's windowDays). */
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
  variant: string | null;
  printing: string;
  rarity: string | null;
  setCode: string;
  hasImage: boolean;
  img: string | null;
  /** Cheapest open listing per market, in that market's currency (Card.low<M>). */
  low: Record<Country, number | null>;
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
    low: card.low,
  };
}

/** "Shanks (Parallel)" — the name with its printing, as every OP list shows it. */
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
  const [rows, cat] = await Promise.all([collectionRows(userId), getCatalog()]);
  return rows
    .map((r) => {
      const card = cat.byId.get(r.cardId);
      return card ? { ...r, card: cardInfo(card, cat.setById.get(card.setId)?.code ?? "") } : null;
    })
    .filter((x): x is CollectionItem => x != null);
}

// ── The free portfolio limit (RiftCompare lib/free-limits-server.ts) ────────
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
 * The POST body, validated (RiftCompare's zod schema, written out: OP carries no
 * zod). null = 400. `condition` defaults to NM and `quantity` to 1; `isFoil`
 * left out means "the card's own finish".
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
  const card = await prisma.card.findUnique({ where: { id: d.cardId }, select: { id: true, finish: true } });
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
  const isFoil = d.isFoil ?? card.finish === "Foil";
  const store = collectionRowStore(prisma, { userId: account.id, cardId: card.id, condition: d.condition, isFoil }, d.note);
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
  const nextFoil = d.isFoil ?? item.isFoil;
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
      ...(d.isFoil != null ? { isFoil: d.isFoil } : {}),
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

// ── The binder: value, history, P&L (RiftCompare getPortfolio) ──────────────

export interface Holding {
  cardId: number;
  slug: string;
  name: string; // with its printing: "Shanks (Parallel)"
  number: string | null;
  printing: string;
  setCode: string;
  img: string | null;
  quantity: number;
  condition: string;
  isFoil: boolean;
  unitCents: number | null; // current lowest market price × condition multiplier
  valueCents: number; // unit × quantity (0 when unpriced)
  d7pct: number | null; // the card's own 7-day price move (US market price)
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
  // Benchmark: the OP Compare Index move over the same windows.
  index: { d7: number | null; d30: number | null } | null;
}

const condMult = (condition: string) => CONDITION_MULTIPLIER[condition] ?? 1;

/**
 * Value the user's collection in their market: current totals for everyone,
 * plus a daily value-over-time series from the history files (carry-forward
 * per card, weighted by owned quantity × condition; lib/portfolio-performance.ts).
 */
export async function getPortfolio(userId: string, country: Country): Promise<Portfolio> {
  const [raw, cat] = await Promise.all([
    prisma.collectionCard.findMany({ where: { userId }, take: COLLECTION_TAKE, select: ROW_SELECT }),
    getCatalog(),
  ]);
  const rows = raw.map((r) => ({ ...r, card: cat.byId.get(r.cardId) ?? null }));

  // Defensive: a cardId the catalogue no longer has (a card TCGplayer withdrew,
  // a restore that did not carry every row) must not 500 the whole binder —
  // drop the row and keep going (RiftCompare's live crash, 2026-09-01).
  const validRows = rows.filter((r) => r.card != null) as (CollectionRow & { card: CardLite })[];

  const holdings: Holding[] = validRows
    .map((r) => {
      const market = r.card.low[country];
      const unit = market != null ? Math.round(market * condMult(r.condition)) : null;
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
        setCode: cat.setById.get(r.card.setId)?.code ?? "",
        img: r.card.hasImage ? cardImage.thumb(r.card.id) : null,
        quantity: r.quantity,
        condition: r.condition,
        isFoil: r.isFoil,
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

  // History for the dearest cards first (getRecentHistory caps the ids).
  // Best-effort: a GitHub hiccup costs the chart and the d7/d30 chips, never the page.
  const ids = [...new Set(holdings.map((h) => h.cardId))];
  const since = Date.now() - PORTFOLIO_WINDOW_DAYS * 86400_000;
  const full = ids.length ? await getRecentHistory(ids).catch(() => new Map<number, Map<number, number>>()) : new Map<number, Map<number, number>>();
  const byCard = new Map<number, Map<number, number>>();
  for (const [id, m] of full) byCard.set(id, new Map([...m].filter(([t]) => t >= since)));

  // Each card's own 7-day move, break-aware like the total below.
  const d7ByCard = new Map<number, number | null>();
  for (const cardId of byCard.keys()) {
    d7ByCard.set(cardId, portfolioPerformance([{ cardId, quantity: 1, multiplier: 1 }], byCard, METHODOLOGY_BREAKS).change(7));
  }
  for (const h of holdings) h.d7pct = d7ByCard.get(h.cardId) ?? null;

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
    validRows.map((r) => ({ cardId: r.cardId, quantity: r.quantity, multiplier: condMult(r.condition) })),
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

/** Every market's price for a row, for the CSV export. */
export function lowsFor(card: CardLite): Record<Country, number | null> {
  const out = {} as Record<Country, number | null>;
  for (const m of MARKETS) out[m] = card.low[m];
  return out;
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
  const [p, cat] = await Promise.all([getPortfolio(userId, country), getCatalog()]);
  if (!p.holdings.length) return { wanted: [], skipped: 0, empty: true };
  // One line per card (conditions summed): stores sell what they have, so a
  // replacement is priced at the listed condition rather than yours.
  const byCard = new Map<number, { cardId: number; name: string; slug: string; setCode: string; collectorNumber: string; qty: number; valueCents: number }>();
  for (const h of p.holdings) {
    const c = cat.byId.get(h.cardId);
    const w =
      byCard.get(h.cardId) ??
      byCard
        .set(h.cardId, { cardId: h.cardId, name: h.name, slug: h.slug, setCode: c ? (cat.setById.get(c.setId)?.code ?? "") : "", collectorNumber: c?.number ?? "", qty: 0, valueCents: 0 })
        .get(h.cardId)!;
    w.qty += h.quantity;
    w.valueCents += h.valueCents;
  }
  const all = [...byCard.values()].sort((a, b) => b.valueCents - a.valueCents);
  return { wanted: all.slice(0, REPLACEMENT_MAX_HOLDINGS), skipped: Math.max(0, all.length - REPLACEMENT_MAX_HOLDINGS), empty: false };
}

// ── Import (/api/collection/import) ─────────────────────────────────────────
// A pasted list ("4 Monkey.D.Luffy", "4xOP01-016", "1 OP01-120 Shanks
// (Parallel)") through the /deck parser (lib/deck.ts), or a printing-aware CSV
// (lib/collection-csv.ts). Free like every way of entering your own binder.
// Both match against the CACHED catalogue (no card query), then read the
// account's rows for the matched cards once and make one guarded write per row
// (lib/collection-add.ts). The free limit takes every already-held card first,
// then new cards in the order given, and reports the rest — never a silent
// partial import, never an all-or-nothing refusal.
export const IMPORT_MAX_TEXT_CHARS = 500_000;
const PASTE_LINE_CAP = 300;
const LIST_CAP = 30;
const WRITE_CONCURRENCY = 8;
const WRITE_BUDGET_MS = 40_000;

// A printing named in a pasted line's words: "Shanks (Parallel)", "Luffy manga".
const PASTE_PRINTING: [RegExp, string][] = [
  [/\b(parallel|alt(ernate)?\s*art|alt)\b/i, "alt"],
  [/\bmanga\b/i, "manga"],
  [/\bsp\b/i, "sp"],
  [/\btreasure\b/i, "treasure"],
  [/\breprint\b/i, "reprint"],
];

interface Want {
  cardId: number;
  qty: number;
  condition: string;
  isFoil: boolean | null;
  label: string;
}

async function writeWants(account: Account, wants: Want[]) {
  const { finishById } = await finishes(wants.filter((w) => w.isFoil == null).map((w) => w.cardId));
  const rows = wants.map((w) => ({ ...w, isFoil: w.isFoil ?? finishById.get(w.cardId) === "Foil" }));
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
  const failed: string[] = [];
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
        return addCopies(collectionRowStore(prisma, key), { quantity: m.qty }, { existing: existingBy.get(rowKey(m.cardId, m.condition, m.isFoil)) ?? null }).catch(() => null);
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

/** Each card's TCGplayer finish (Normal | Foil), for rows whose foil flag the input did not state. */
async function finishes(ids: number[]): Promise<{ finishById: Map<number, string | null> }> {
  const uniq = [...new Set(ids)];
  if (!uniq.length) return { finishById: new Map() };
  const rows = await prisma.card.findMany({ where: { id: { in: uniq } }, select: { id: true, finish: true }, take: uniq.length });
  return { finishById: new Map(rows.map((r) => [r.id, r.finish])) };
}

/** POST /api/collection/import { text }. */
export async function importCollection(account: Account, text: string): Promise<RouteResult> {
  if (text.length > IMPORT_MAX_TEXT_CHARS) {
    return err(413, "That file is over 500 KB. Split it into two and import them one after the other.");
  }
  const cat = await getCatalog();
  const csv = parseCollectionCsv(text);
  if (csv) {
    if (!csv.rows.length) {
      return err(400, "No lines could be imported from that file.", { skippedCount: csv.skippedCount, skipped: csv.skipped.slice(0, LIST_CAP) });
    }
    const catalogue = cat.cards.map((c) => ({
      id: c.id, number: c.number, printing: c.printing, setCode: cat.setById.get(c.setId)?.code ?? "", setName: cat.setById.get(c.setId)?.name ?? "",
    }));
    const { matched, unmatched } = matchCsvRows(csv.rows, catalogue);
    const label = (m: (typeof matched)[number]) => m.copy.name ?? displayName(cat.byId.get(m.card.id) ?? { name: m.copy.number ?? `#${m.card.id}`, variant: null });
    const res = await writeWants(
      account,
      matched.map((m) => ({ cardId: m.card.id, qty: m.copy.qty, condition: m.copy.condition, isFoil: m.copy.isFoil, label: label(m) })),
    );
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
    });
  }

  // A pasted list: chunks through the /deck parser (it reads 120 lines a call).
  const rawLines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, PASTE_LINE_CAP);
  const lines = [];
  for (let i = 0; i < rawLines.length; i += 100) lines.push(...parseDeckList(rawLines.slice(i, i + 100).join("\n")));
  if (!lines.length) return err(400, "Paste a list like “4 OP01-003 Monkey.D.Luffy” or “1 OP01-120 Shanks (Parallel)”.");
  const idx = indexCards(cat.cards);
  const wants: Want[] = [];
  const unmatched: string[] = [];
  for (const l of lines) {
    const r = resolveLine(l, idx);
    if (!r.card) {
      unmatched.push(l.raw);
      continue;
    }
    // A bare name shared by several cards ("Monkey.D.Luffy" is dozens) is not a
    // card: /deck guesses and flags it, but a binder holds what the owner owns,
    // so a guess would silently misvalue it. Skipped and reported, like an
    // ambiguous store listing (CLAUDE.md "Matching store listings").
    if (r.how === "name" && r.ambiguous) {
      unmatched.push(`${l.raw} (add the card number)`);
      continue;
    }
    const base = r.card;
    let card = base;
    // "1 OP01-120 Shanks (Parallel)": a printing named in the words picks it.
    if (r.how !== "pinned" && !l.parallel) {
      const named = PASTE_PRINTING.find(([re]) => re.test(l.name))?.[1];
      const pick = named ? r.options.filter((c) => c.printing === named && (!base.number || c.number === base.number)).sort((a, b) => a.id - b.id)[0] : undefined;
      if (pick) card = pick;
    }
    wants.push({ cardId: card.id, qty: l.qty, condition: "NM", isFoil: null, label: l.raw.slice(0, 80) });
  }
  const res = await writeWants(account, wants);
  return ok({ ok: true, ...res, unmatched: [...new Set(unmatched)].slice(0, LIST_CAP) });
}

// ── Export (/api/portfolio/export) ──────────────────────────────────────────
export async function exportRows(userId: string, country: Country) {
  const [rows, cat] = await Promise.all([collectionRows(userId), getCatalog()]);
  const out = [];
  for (const r of rows) {
    const c = cat.byId.get(r.cardId);
    if (!c) continue;
    const market = c.low[country];
    out.push({
      name: c.name,
      setCode: cat.setById.get(c.setId)?.code ?? "",
      number: c.number,
      printing: c.printing,
      condition: r.condition,
      isFoil: r.isFoil,
      quantity: r.quantity,
      unitCents: market != null ? Math.round(market * condMult(r.condition)) : null,
      costBasisCents: unitCostCents(r),
      note: r.note,
      tcgplayerId: c.id,
    });
  }
  return out;
}
