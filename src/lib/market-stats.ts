// The statistics /market reports (RiftCompare's computeStats from lib/market-index.ts,
// ported pure over OP's chained index and the catalogue): one-of-each basket
// value, average and median card, the index's range, breadth (advancing against
// declining over 7 days) and recent realised volatility. Pure and client-safe.
export interface IndexPointLite {
  day: string;
  value: number;
}

export interface Constituent {
  id: number;
  slug: string;
  name: string;
  variant: string | null;
  number: string | null;
  setCode: string;
  /** TCGplayer market price, USD cents. */
  priceCents: number;
  /** Share of the basket's one-of-each value, one decimal. */
  weightPct: number;
  /** TCGplayer market change over 7 days, percent; null before a week of history. */
  d7pct: number | null;
  hasImage: boolean;
}

export interface MarketStats {
  basketValueCents: number;
  avgPriceCents: number;
  medianPriceCents: number;
  constituentCount: number;
  high: number;
  low: number;
  advancing: number;
  declining: number;
  unchanged: number;
  /** Std. dev. of the last snapshot-to-snapshot % moves; null with fewer than 5 moves. */
  volatilityPct: number | null;
}

/** How many of the latest points the volatility reads. */
export const VOLATILITY_LOOKBACK_POINTS = 30;
/** The basket is the cards priced at least this much (US$1), as the index itself is. */
export const INDEX_MIN_CENTS = 100;
/** The constituents table ships this many rows (under 2 MB per cache entry, and a page a person can read). */
export const INDEX_TABLE_SIZE = 200;

export function computeStats(points: readonly IndexPointLite[], constituents: readonly Pick<Constituent, "priceCents" | "d7pct">[]): MarketStats {
  const prices = constituents.map((c) => c.priceCents).filter((p) => p > 0);
  const basketValueCents = prices.reduce((a, b) => a + b, 0);
  const priced = prices.length;
  const avgPriceCents = priced ? Math.round(basketValueCents / priced) : 0;
  const sorted = [...prices].sort((a, b) => a - b);
  const medianPriceCents = !priced ? 0 : priced % 2 ? sorted[(priced - 1) / 2] : Math.round((sorted[priced / 2 - 1] + sorted[priced / 2]) / 2);

  let high = -Infinity;
  let low = Infinity;
  for (const p of points) {
    if (p.value > high) high = p.value;
    if (p.value < low) low = p.value;
  }
  if (!points.length) {
    high = 0;
    low = 0;
  }

  let advancing = 0;
  let declining = 0;
  let unchanged = 0;
  for (const c of constituents) {
    if (c.d7pct == null || c.d7pct === 0) unchanged++;
    else if (c.d7pct > 0) advancing++;
    else declining++;
  }

  const recent = points.slice(-VOLATILITY_LOOKBACK_POINTS);
  const returns: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    const prev = recent[i - 1].value;
    if (prev) returns.push(((recent[i].value - prev) / prev) * 100);
  }
  let volatilityPct: number | null = null;
  if (returns.length >= 5) {
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
    volatilityPct = Math.round(Math.sqrt(variance) * 100) / 100;
  }

  return {
    basketValueCents,
    avgPriceCents,
    medianPriceCents,
    constituentCount: constituents.length,
    high: Math.round(high * 10) / 10,
    low: Math.round(low * 10) / 10,
    advancing,
    declining,
    unchanged,
    volatilityPct,
  };
}

interface CardForIndex {
  id: number;
  slug: string;
  name: string;
  variant: string | null;
  number: string | null;
  setId: number;
  marketUsd: number | null;
  change7d: number | null;
  hasImage: boolean;
}

/**
 * The basket's top `size` cards by TCGplayer market price (the whole basket is
 * every card priced at US$1+; weights are against that whole basket), dearest first.
 */
export function indexConstituents(cards: readonly CardForIndex[], setCodeOf: (setId: number) => string, size = INDEX_TABLE_SIZE): { rows: Constituent[]; basketCount: number; basketCents: number } {
  const basket = cards.filter((c) => (c.marketUsd ?? 0) >= INDEX_MIN_CENTS);
  const total = basket.reduce((a, c) => a + c.marketUsd!, 0);
  const rows = [...basket]
    .sort((a, b) => b.marketUsd! - a.marketUsd! || a.id - b.id)
    .slice(0, size)
    .map(
      (c): Constituent => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        variant: c.variant,
        number: c.number,
        setCode: setCodeOf(c.setId),
        priceCents: c.marketUsd!,
        weightPct: total ? Math.round((c.marketUsd! / total) * 1000) / 10 : 0,
        d7pct: c.change7d,
        hasImage: c.hasImage,
      }),
    );
  return { rows, basketCount: basket.length, basketCents: total };
}

/** "As of <day> the index sits at X, up Y% over 7 days, with A of N cards higher": the sentence an answer engine can quote. */
export function indexSentence(opts: { day: string; value: number; d7: number | null; advancing: number; counted: number }): string {
  const { value, d7, advancing, counted } = opts;
  const move = d7 == null ? "" : d7 === 0 ? ", unchanged over 7 days" : `, ${d7 > 0 ? "up" : "down"} ${Math.abs(d7).toFixed(1)}% over 7 days`;
  const breadth = counted > 0 ? `, with ${advancing} of ${counted} cards higher` : "";
  return `As of ${opts.day} the OP Compare Index sits at ${value.toFixed(1)}${move}${breadth}.`;
}
