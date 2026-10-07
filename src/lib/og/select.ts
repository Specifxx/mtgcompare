// What each share image shows, as pure functions of the cached catalogue (no
// I/O, so tests/og.test.ts pins every rule against fixtures).
import type { Country } from "../country";
import { MARKETS } from "../country";
import type { CardLite, SetLite, SealedLite, SiteStats } from "../data";
import { usdCentsToCountry } from "../fx";
import { STORES } from "../stores";
import { OG_FALLBACK_ORDER } from "./theme";

/** One table row in a share image. `art` is filled in by the route (lib/og/art.ts). */
export interface OgRow {
  id: number;
  name: string;
  variant: string | null;
  printing: string;
  number: string | null;
  setCode: string;
  marketUsd: number | null;
  /** The cheapest listing in the image's market, or null when there is none worth showing. */
  low: number | null;
  stores: number;
  change7d: number | null;
  art?: string | null;
}

const GUIDE_PRINTINGS = new Set(["standard", "alt", "manga", "sp", "treasure"]);
const GUIDE_SET_KINDS = new Set(["booster", "extra", "premium"]);
/** Variants a reader would not call "the card": one-offs, event prizes, signed copies. */
const ODD_VARIANT = /serial|championship|regional|winner|judge|pre-?release|stamp|signature/i;

type CatalogLike = { cards: CardLite[]; setById: Map<number, SetLite> };

/** Above this multiple of TCGplayer's market, a cheapest listing reads as a data error, not a price. */
export const ASK_OUTLIER = 1.5;
/** The site's default share image is held to a tighter band: its first row is what a scroller sees. */
export const GUIDE_BAND_HIGH = 1.2;

/** TCGplayer's market in a market's own currency (US cents converted). */
function marketIn(marketUsd: number, country: Country): number {
  return country === "US" ? marketUsd : usdCentsToCountry(marketUsd, country);
}

/** A listing within 0.5–hi× of TCGplayer's market (or any listing when there is no market). */
function inBand(c: CardLite, country: Country, hi = ASK_OUTLIER): boolean {
  const low = c.low[country];
  if (low == null) return false;
  if (c.marketUsd == null) return true;
  const ref = marketIn(c.marketUsd, country);
  return low >= 0.5 * ref && low <= hi * ref;
}

export function toRow(c: CardLite, setCode: string, country: Country = "US", low: number | null = c.low[country]): OgRow {
  return {
    id: c.id,
    name: c.name,
    variant: c.variant,
    printing: c.printing,
    number: c.number,
    setCode,
    marketUsd: c.marketUsd,
    low,
    stores: c.stores[country],
    change7d: c.change7d,
  };
}

function dedupeByName(cards: CardLite[], n: number): CardLite[] {
  const seen = new Set<string>();
  const out: CardLite[] = [];
  for (const c of cards) {
    if (seen.has(c.name)) continue;
    seen.add(c.name);
    out.push(c);
    if (out.length === n) break;
  }
  return out;
}

/**
 * The top of the price guide (its default sort, price desc) minus the listings a
 * reader would call wrong: promos, event prizes, $10-and-under cards, single-store
 * asks and listings more than 1.2× (or under half) TCGplayer's market. Relaxes step by step (one
 * store is enough, then no band) before giving up; the caller draws the fallback
 * when fewer than 3 rows come back.
 */
export function pickGuideRows(cat: CatalogLike, country: Country = "US", n = 5): OgRow[] {
  const base = cat.cards.filter((c) => {
    const set = cat.setById.get(c.setId);
    return (
      c.hasImage &&
      c.marketUsd != null &&
      c.marketUsd >= 1000 &&
      GUIDE_PRINTINGS.has(c.printing) &&
      !!set &&
      GUIDE_SET_KINDS.has(set.kind) &&
      c.low[country] != null &&
      !(c.variant && ODD_VARIANT.test(c.variant))
    );
  });
  const steps: ((c: CardLite) => boolean)[] = [
    (c) => c.stores[country] >= 2 && inBand(c, country, GUIDE_BAND_HIGH),
    (c) => c.stores[country] >= 1 && inBand(c, country, GUIDE_BAND_HIGH),
    (c) => c.stores[country] >= 1,
  ];
  let picked: CardLite[] = [];
  for (const keep of steps) {
    picked = dedupeByName(
      base.filter(keep).sort((a, b) => (b.low[country] ?? 0) - (a.low[country] ?? 0) || a.id - b.id),
      n,
    );
    if (picked.length >= n) break;
  }
  return picked.map((c) => toRow(c, cat.setById.get(c.setId)?.code ?? ""));
}

/** The last column shows 7-day moves only once at least 3 rows really moved; until then, store counts. */
export function showMoveColumn(rows: Pick<OgRow, "change7d">[]): boolean {
  return rows.filter((r) => r.change7d != null && Math.abs(r.change7d) >= 0.05).length >= 3;
}

/**
 * A set's most valuable printings (by TCGplayer market), one per name. A US ask
 * far outside the market band is dropped from the row (the market shows instead),
 * so a $50,000 single listing never reads as "cheapest".
 */
export function setTopRows(cat: CatalogLike, set: SetLite, n = 5, country: Country = "US"): OgRow[] {
  const cards = cat.cards
    .filter((c) => c.setId === set.id && c.hasImage && c.marketUsd != null)
    .sort((a, b) => (b.marketUsd ?? 0) - (a.marketUsd ?? 0) || a.id - b.id);
  return dedupeByName(cards, n).map((c) => toRow(c, set.code, country, inBand(c, country) ? c.low[country] : null));
}

/** Up to n art-bearing printings of a set, any price — the upcoming-set composition. */
export function setPreviewCards(cat: CatalogLike, set: SetLite, n = 4): OgRow[] {
  const cards = cat.cards
    .filter((c) => c.setId === set.id && c.hasImage)
    .sort((a, b) => (b.marketUsd ?? -1) - (a.marketUsd ?? -1) || (a.number ?? "~").localeCompare(b.number ?? "~") || a.id - b.id);
  return dedupeByName(cards, n).map((c) => toRow(c, set.code));
}

/** Stores with at least one in-stock offer (TCGplayer included); the registry size when there are none yet. */
export function storesTracked(stats: Pick<SiteStats, "storeOffers"> | null | undefined): number {
  const n = new Set((stats?.storeOffers ?? []).filter((s) => s.inStock > 0).map((s) => s.source)).size;
  return n > 0 ? n : STORES.length + 1;
}

export interface OgPrice {
  /** "listing": the cheapest open listing (`stores` = real stores among them, can be 0); "reference": TCGplayer's market (≈); "none": no price at all. */
  kind: "listing" | "reference" | "none";
  country: Country;
  cents: number | null;
  stores: number;
  /** With "reference": the store listing that was passed over because it sits far above the market. */
  ask?: { country: Country; cents: number; stores: number };
}

type PricedLike = { low: Record<Country, number | null>; stores: Record<Country, number>; marketUsd: number | null };

/**
 * The headline price for a share image: the US listing, else the first market in
 * OG_FALLBACK_ORDER with a listing (in its own currency), else TCGplayer's market
 * in US$. A leading listing more than ASK_OUTLIER× the market (one store asking
 * US$50,000 for a US$13,000 card) does not lead: the market does, and the ask
 * rides along as `ask` for a secondary line. Plus the other markets with a
 * listing, for the chips row.
 */
export function ogPriceLines(p: PricedLike, max = 5): { head: OgPrice; others: { country: Country; cents: number }[] } {
  const lead = OG_FALLBACK_ORDER.find((m) => p.low[m] != null);
  const leadCents = lead ? (p.low[lead] as number) : null;
  const outlier = lead != null && leadCents != null && p.marketUsd != null && leadCents > ASK_OUTLIER * marketIn(p.marketUsd, lead);
  const head: OgPrice =
    lead && leadCents != null && !outlier
      ? { kind: "listing", country: lead, cents: leadCents, stores: p.stores[lead] }
      : p.marketUsd != null
        ? {
            kind: "reference",
            country: "US",
            cents: p.marketUsd,
            stores: 0,
            ...(lead && leadCents != null ? { ask: { country: lead, cents: leadCents, stores: p.stores[lead] } } : {}),
          }
        : { kind: "none", country: "US", cents: null, stores: 0 };
  const others = MARKETS.filter((m) => m !== head.country && p.low[m] != null)
    .slice(0, max)
    .map((m) => ({ country: m, cents: p.low[m] as number }));
  return { head, others };
}

/** The number of markets where a real store has it in stock (stores<M> never counts TCGplayer or eBay). */
export function marketsInStock(p: Pick<PricedLike, "stores">): number {
  return MARKETS.filter((m) => p.stores[m] > 0).length;
}

/** The sealed product behind a slug, from the cached sealed catalogue. */
export function findSealed(all: SealedLite[], slug: string): SealedLite | null {
  return all.find((s) => s.slug === slug) ?? null;
}

/** The art for a set's sealed product, booster box first: the upcoming-set image's stand-in. */
export function setBoxImage(all: SealedLite[], setId: number): string | null {
  const mine = all.filter((s) => s.setId === setId && s.imageUrl);
  const rank = (k: string) => (k === "Booster Box" ? 0 : k === "Booster Pack" ? 1 : k === "Booster Case" ? 3 : 2);
  return mine.sort((a, b) => rank(a.kind) - rank(b.kind) || a.id - b.id)[0]?.imageUrl ?? null;
}
