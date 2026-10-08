// What each share image shows, as pure functions of what the loaders return (no
// I/O, so tests/og.test.ts pins every rule against fixtures).
import { CARD_FLAGS, MAIN_SET_KINDS, TREATMENT_BY_KEY, finishLabel } from "../constants";
import type { Country } from "../country";
import { MARKETS } from "../country";
import type { CardLite, SealedLite, SetLite } from "../data";
import { usdCentsToCountry } from "../fx";
import type { HomeStats } from "../home";
import { imageFor, tcgplayerImage } from "../images";
import { OG_FALLBACK_ORDER } from "./theme";

/** One table row in a share image. `art` is filled in by the route (lib/og/art.ts) from `img`. */
export interface OgRow {
  id: number;
  name: string;
  /** The printing's own label ("Borderless · Showcase"), or null for a plain one. */
  variant: string | null;
  printing: string;
  /** The foil word of the unit shown ("Foil", "Foil Etched", "Surge Foil"); null for a non-foil unit. */
  finish: string | null;
  number: string | null;
  setCode: string;
  marketUsd: number | null;
  /** The cheapest listing in the image's market, or null when there is none worth showing. */
  low: number | null;
  stores: number;
  change7d: number | null;
  /** imageFor(c, "og"): a JPEG on both image hosts; null when the card has no scan at all (the placeholder is drawn). */
  img: string | null;
  art?: string | null;
}

const GUIDE_SET_KINDS: ReadonlySet<string> = new Set(MAIN_SET_KINDS);
/** Printings a reader would not call "the card": event prizes and stamped promos, serialized one-offs, foreign copies. */
const ODD_TREATMENT_KINDS: ReadonlySet<string> = new Set(["promo", "serial", "language"]);
const ODD_FLAGS = CARD_FLAGS.PROMO | CARD_FLAGS.SERIAL;
/** What the closed vocabulary cannot see: the free text of a label. */
const ODD_VARIANT = /serial|championship|regional|winner|finalist|judge|pre-?release|stamp|signed|signature|proof/i;

type CatalogLike = { cards: readonly CardLite[]; setById: Map<number, SetLite> };

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

/** Does the card have a scan a share image can draw (either host)? */
const hasArt = (c: CardLite): boolean => imageFor(c, "og") != null;

function isOddPrinting(c: CardLite): boolean {
  return (c.flags & ODD_FLAGS) !== 0 || c.treat.some((k) => ODD_TREATMENT_KINDS.has(TREATMENT_BY_KEY[k]?.kind ?? "")) || (!!c.variant && ODD_VARIANT.test(c.variant));
}

export function toRow(c: CardLite, country: Country = "US", low: number | null = c.low[country]): OgRow {
  return {
    id: c.id,
    name: c.name,
    variant: c.variant,
    printing: c.printing,
    finish: c.headFinish === "F" ? finishLabel(c, "F") : null,
    number: c.number,
    setCode: c.setCode,
    marketUsd: c.marketUsd,
    low,
    stores: c.stores[country],
    change7d: c.change7d,
    img: imageFor(c, "og"),
  };
}

/** One printing per card (the oracle), else per name: five printings of one card are one entry. */
function dedupeByCard(cards: CardLite[], n: number): CardLite[] {
  const seen = new Set<string>();
  const out: CardLite[] = [];
  for (const c of cards) {
    const key = c.oracleNo != null ? `o${c.oracleNo}` : c.name;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length === n) break;
  }
  return out;
}

/**
 * The top of the price guide (its default sort, market desc; the caller passes
 * the first page) minus the listings a reader would call wrong: promos,
 * serialized and event printings, sets outside the main kinds, $10-and-under
 * cards, single-store asks and listings more than 1.2× (or under half)
 * TCGplayer's market. Relaxes step by step (one store is enough, then no band)
 * before giving up; the caller draws the fallback when fewer than 3 rows come back.
 */
export function pickGuideRows(cat: CatalogLike, country: Country = "US", n = 5): OgRow[] {
  const base = cat.cards.filter((c) => {
    const set = cat.setById.get(c.setId);
    return hasArt(c) && c.marketUsd != null && c.marketUsd >= 1000 && !!set && GUIDE_SET_KINDS.has(set.kind) && c.low[country] != null && !isOddPrinting(c);
  });
  const steps: ((c: CardLite) => boolean)[] = [
    (c) => c.stores[country] >= 2 && inBand(c, country, GUIDE_BAND_HIGH),
    (c) => c.stores[country] >= 1 && inBand(c, country, GUIDE_BAND_HIGH),
    (c) => c.stores[country] >= 1,
  ];
  let picked: CardLite[] = [];
  for (const keep of steps) {
    picked = dedupeByCard(
      base.filter(keep).sort((a, b) => (b.low[country] ?? 0) - (a.low[country] ?? 0) || a.id - b.id),
      n,
    );
    if (picked.length >= n) break;
  }
  return picked.map((c) => toRow(c));
}

/** The last column shows 7-day moves only once at least 3 rows really moved; until then, store counts. */
export function showMoveColumn(rows: Pick<OgRow, "change7d">[]): boolean {
  return rows.filter((r) => r.change7d != null && Math.abs(r.change7d) >= 0.05).length >= 3;
}

/**
 * A set's most valuable printings (by TCGplayer market), one per card. A US ask
 * far outside the market band is dropped from the row (the market shows instead),
 * so a $50,000 single listing never reads as "cheapest".
 */
export function setTopRows(cards: readonly CardLite[], set: SetLite, n = 5, country: Country = "US"): OgRow[] {
  const mine = cards
    .filter((c) => c.setId === set.id && hasArt(c) && c.marketUsd != null)
    .sort((a, b) => (b.marketUsd ?? 0) - (a.marketUsd ?? 0) || a.id - b.id);
  return dedupeByCard(mine, n).map((c) => toRow(c, country, inBand(c, country) ? c.low[country] : null));
}

/** Up to n art-bearing printings of a set, any price: the upcoming-set composition. */
export function setPreviewCards(cards: readonly CardLite[], set: SetLite, n = 4): OgRow[] {
  const mine = cards
    .filter((c) => c.setId === set.id && hasArt(c))
    .sort((a, b) => (b.marketUsd ?? -1) - (a.marketUsd ?? -1) || (a.number ?? "~").localeCompare(b.number ?? "~", "en", { numeric: true }) || a.id - b.id);
  return dedupeByCard(mine, n).map((c) => toRow(c));
}

/**
 * Stores with an in-stock listing anywhere (TCGplayer included), or null before the
 * first store run: the stat is then left out of the image, never replaced by the
 * size of the registry (a store counts only once a run has priced it).
 */
export function storesTracked(stats: Pick<HomeStats, "liveStoresAll"> | null | undefined): number | null {
  return stats && stats.liveStoresAll > 0 ? stats.liveStoresAll : null;
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

/** The scan of a sealed product (TCGplayer's CDN, keyed by the product id): a JPEG, 400 px wide. */
export const sealedArt = (id: number): string => tcgplayerImage(id, "400w");

/** The art for a set's sealed product, booster box first: the upcoming-set image's stand-in. */
export function setBoxImage(all: readonly Pick<SealedLite, "id" | "setId" | "kind">[], setId: number): string | null {
  const rank = (k: string) => (k === "Booster Box" ? 0 : k === "Booster Pack" ? 1 : k === "Case" ? 3 : 2);
  const best = all.filter((s) => s.setId === setId).sort((a, b) => rank(a.kind) - rank(b.kind) || a.id - b.id)[0];
  return best ? sealedArt(best.id) : null;
}
