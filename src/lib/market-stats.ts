// The statistics /market reports (RiftCompare's computeStats from lib/market-index.ts): one-of-each basket value, average and median card, the index's range, breadth (advancing against
// declining over 7 days) and recent realised volatility. Pure and client-safe. The basket aggregates come PUBLISHED (mk/overview.json, getMarketOverview: the importer computes them once a day
// over every tracked unit at US$1 or more), so nothing here scans a catalogue; this module turns them, the index series and the 200 constituents into what the page draws.
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
  /** The front image to draw (the TCGplayer scan of this product, else Scryfall's); null when neither host has one. */
  imageUrl: string | null;
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

/** The published basket: the units priced at US$1 or more, one of each (mk/overview.json). Amounts are USD cents. */
export interface BasketLite { n: number; totalCents: number; avgCents: number; medianCents: number; advancing: number; declining: number }

export function computeStats(points: readonly IndexPointLite[], basket: BasketLite): MarketStats {
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
    basketValueCents: basket.totalCents,
    avgPriceCents: basket.avgCents,
    medianPriceCents: basket.medianCents,
    constituentCount: basket.n,
    high: Math.round(high * 10) / 10,
    low: Math.round(low * 10) / 10,
    advancing: basket.advancing,
    declining: basket.declining,
    unchanged: Math.max(0, basket.n - basket.advancing - basket.declining),
    volatilityPct,
  };
}

/** What a constituent needs of its card beyond the published row (id, slug, name, market cents): the printing label, number, set, 7-day change and image. */
export interface CardForIndex {
  id: number;
  variant: string | null;
  number: string | null;
  setCode: string;
  change7d: number | null;
  hasImage: boolean;
  imageUrl: string | null;
}

/**
 * The basket's top `size` cards by TCGplayer market price, dearest first (the published rows are already the dearest 200; weights are against the WHOLE basket of `basketCents`).
 * A row whose card cannot be found keeps its name and price, without a label, number or change.
 */
export function indexConstituents(published: readonly { id: number; slug: string; name: string; cents: number }[], cards: ReadonlyMap<number, CardForIndex>, basketCents: number, size = INDEX_TABLE_SIZE): Constituent[] {
  return [...published]
    .filter((r) => r.cents >= INDEX_MIN_CENTS)
    .sort((a, b) => b.cents - a.cents || a.id - b.id)
    .slice(0, size)
    .map((r): Constituent => {
      const c = cards.get(r.id);
      return {
        id: r.id,
        slug: r.slug,
        name: r.name,
        variant: c?.variant ?? null,
        number: c?.number ?? null,
        setCode: c?.setCode ?? "",
        priceCents: r.cents,
        weightPct: basketCents ? Math.round((r.cents / basketCents) * 1000) / 10 : 0,
        d7pct: c?.change7d ?? null,
        hasImage: c?.hasImage ?? false,
        imageUrl: c?.imageUrl ?? null,
      };
    });
}

/** "As of <day> the index sits at X, up Y% over 7 days, with A of N cards higher": the sentence an answer engine can quote. */
export function indexSentence(opts: { day: string; value: number; d7: number | null; advancing: number; counted: number }): string {
  const { value, d7, advancing, counted } = opts;
  const move = d7 == null ? "" : d7 === 0 ? ", unchanged over 7 days" : `, ${d7 > 0 ? "up" : "down"} ${Math.abs(d7).toFixed(1)}% over 7 days`;
  const breadth = counted > 0 ? `, with ${advancing} of ${counted} cards higher` : "";
  return `As of ${opts.day} the MTG Compare Index sits at ${value.toFixed(1)}${move}${breadth}.`;
}
