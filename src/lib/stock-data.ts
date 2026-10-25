// The loaders behind /<region>/back-in-stock, /<region>/price-moves and /<region>/out-of-print (and the region home's older-sets
// section): the price-history file (lib/price-history.ts readPriceHistory) for the first two, today's ProductStat rows for the third,
// joined to product cards by small capped reads (data.ts cardsBySlugs: 48 at most). The decisions are lib/stock.ts's (pure, tested).
import { prisma } from "./db";
import { cardSelect, cardsBySlugs, setCounts, toCard, type ProductCardData } from "./data";
import { HOT_SETS } from "./popular";
import { readPriceHistory, type PriceHistory } from "./price-history";
import type { Market } from "./regions";
import {
  backInStock,
  groupOlderInStock,
  historyDays,
  MIN_DAYS_BACK,
  MIN_DAYS_MOVES,
  MOVE_TYPES,
  OLDER_TYPES,
  olderSets,
  popularSetCodes,
  priceMoves,
  type BackInStock,
  type PriceMove,
} from "./stock";

const today = () => new Date().toISOString().slice(0, 10);

export interface HistoryState {
  /** Days of snapshots in the file (0: no file). */
  days: number;
  /** The last snapshot's day (UTC days since 1970), or null. */
  through: number | null;
}

const stateOf = (h: PriceHistory | null): HistoryState => ({ days: historyDays(h), through: h?.through ?? null });

export async function backInStockData(market: Market, take = 48): Promise<HistoryState & { enough: boolean; items: { card: ProductCardData; back: BackInStock }[] }> {
  const h = readPriceHistory();
  const state = stateOf(h);
  const list = backInStock(h, market).slice(0, take);
  const cards = await cardsBySlugs(market, list.map((b) => b.slug));
  const bySlug = new Map(cards.map((c) => [c.slug, c]));
  // today's card must agree that it is open (the file and ProductStat are written by the same export; this only guards a mismatch)
  const items = list.flatMap((back) => {
    const card = bySlug.get(back.slug);
    return card && card.inStockStores + (card.marketplaceOpen ? 1 : 0) > 0 ? [{ card, back }] : [];
  });
  return { ...state, enough: state.days >= MIN_DAYS_BACK, items };
}

export async function priceMovesData(market: Market, now = today()): Promise<HistoryState & { enough: boolean; sets: string[]; up: { card: ProductCardData; move: PriceMove }[]; down: { card: ProductCardData; move: PriceMove }[] }> {
  const h = readPriceHistory();
  const state = stateOf(h);
  const counts = await setCounts(market);
  const sets = popularSetCodes(HOT_SETS, new Map([...counts].map(([c, v]) => [c, v.inStock])), now);
  const enough = state.days >= MIN_DAYS_MOVES;
  if (!enough) return { ...state, enough, sets, up: [], down: [] };
  const rows = await prisma.productStat.findMany({
    where: { market, product: { setCode: { in: sets }, productType: { in: MOVE_TYPES } } },
    take: 400,
    select: { product: { select: { slug: true } } },
  });
  const moves = priceMoves(h, market, rows.map((r) => r.product.slug));
  const pick = async (list: PriceMove[]) => {
    const some = list.slice(0, 24);
    const cards = new Map((await cardsBySlugs(market, some.map((m) => m.slug))).map((c) => [c.slug, c]));
    return some.flatMap((move) => (cards.get(move.slug) ? [{ card: cards.get(move.slug)!, move }] : []));
  };
  const [up, down] = await Promise.all([pick(moves.filter((m) => m.pct > 0)), pick(moves.filter((m) => m.pct < 0))]);
  return { ...state, enough, sets, up, down };
}

/** Older sets' headline product in stock at a store today, grouped by set (lib/stock.ts groupOlderInStock). One scoped read. */
export async function olderInStockData(market: Market, now = today()) {
  const codes = olderSets(now).map((s) => s.code);
  const rows = await prisma.productStat.findMany({
    where: { market, inStockStores: { gt: 0 }, product: { setCode: { in: codes }, productType: { in: OLDER_TYPES } } },
    take: 600,
    select: cardSelect,
  });
  return groupOlderInStock(rows.map(toCard), now);
}
