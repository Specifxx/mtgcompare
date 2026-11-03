// The homepage's sealed hero (SITE.homeSealedHero): booster boxes and pre-orders
// as the first, biggest thing on the page, on the sites whose money comes from
// sealed (YGO Compare, 2026-11-03: ~96% of its affiliate earnings were sealed
// and pre-order rows). DECISIONS.md, "Sealed hero on the homepage".
//
// Pages are cached for everyone, so this sends every market's cheapest store
// and the visitor's market is picked in the browser (components/SealedHero.tsx).
// Prices are each market's own stores in its own currency, never converted;
// eBay, Amazon and TCGplayer are never "the cheapest store" here. A saving is
// shown only when it is real: the cheapest store against the middle in-stock
// store of that market (3+ stores), or in the US against TCGplayer's market
// price, inside bounds that rule out a wrong match.
import { SITE } from "@/site.config";
import { CURRENCY, MARKETS, type Market, type Product } from "@/lib/site-types";
import { priceOf, refCents, setById, summaryOf } from "@/lib/data";
import { featuredSealed, preorderSetList, sealedInSet } from "@/lib/hubs";
import { imageAt } from "@/lib/image";
import { isPreorder, preorderPath } from "@/lib/preorders";
import { shortName } from "@/lib/names";

const NOT_A_STORE = new Set(["ebay", "amazon", "tcgplayer"]);
const STORE_NAME: Record<string, string> = Object.fromEntries(SITE.stores.map((s) => [s.key, s.name]));

export interface HeroPrice {
  cents: number;
  currency: string;
  source: string;
  store: string;
  url: string;
  /** In-stock (or pre-order) stores in this market. */
  stores: number;
  /** Percent saved, and against what; null when no honest comparison exists. */
  saving: { pct: number; vs: "stores" | "tcgplayer" } | null;
  preorder: boolean;
}

export interface HeroItem {
  id: number;
  slug: string;
  name: string;
  set: string | null;
  image: string | null;
  /** The release date when the product's set is still on pre-order. */
  releasesOn: string | null;
  preorderHref: string | null;
  totalStores: number;
  prices: Partial<Record<Market, HeroPrice>>;
  /** The cheapest in-stock eBay listing per market: a labelled "Ad" line beside the store price, never "the cheapest". */
  ebay: Partial<Record<Market, { cents: number; currency: string; url: string }>>;
}

export interface SealedHeroData {
  featured: HeroItem[];
  preorders: { name: string; href: string; releasesOn: string | null; items: HeroItem[] }[];
}

export function storeSaving(cheapest: number, others: number[], tcgCents: number | null, market: Market): HeroPrice["saving"] {
  if (others.length >= 3) {
    const c = [...others].sort((a, b) => a - b);
    const mid = c.length >> 1;
    const median = c.length % 2 ? c[mid] : Math.round((c[mid - 1] + c[mid]) / 2);
    const pct = Math.round((1 - cheapest / median) * 100);
    // Over 45% under the middle store is likelier a wrong match than a sale.
    if (pct >= 5 && pct <= 45) return { pct, vs: "stores" };
  }
  if (market === "US" && tcgCents && tcgCents >= 500) {
    const pct = Math.round((1 - cheapest / tcgCents) * 100);
    if (pct >= 3 && pct <= 45) return { pct, vs: "tcgplayer" };
  }
  return null;
}

export function heroItem(p: Product): HeroItem {
  const set = setById(p.setId);
  const pre = set ? isPreorder(set) : false;
  const tcg = refCents(p.id);
  const prices: HeroItem["prices"] = {};
  for (const m of MARKETS) {
    const best = new Map<string, { cents: number; url: string; preorder: boolean }>();
    for (const o of priceOf(p.id).offers) {
      if (o.market !== m || o.currency !== CURRENCY[m] || NOT_A_STORE.has(o.source)) continue;
      if (!o.inStock && !o.preorder) continue;
      const had = best.get(o.source);
      if (!had || o.cents < had.cents) best.set(o.source, { cents: o.cents, url: o.url, preorder: !!o.preorder });
    }
    if (!best.size) continue;
    const list = [...best.entries()].sort((a, b) => a[1].cents - b[1].cents);
    const [source, top] = list[0];
    prices[m] = {
      cents: top.cents,
      currency: CURRENCY[m],
      source,
      store: STORE_NAME[source] ?? source,
      url: top.url,
      stores: list.length,
      saving: storeSaving(top.cents, list.map(([, o]) => o.cents), tcg, m),
      preorder: top.preorder || pre,
    };
  }
  const ebay: HeroItem["ebay"] = {};
  for (const o of summaryOf(p.id).ebay) if (o.inStock && !ebay[o.market]) ebay[o.market] = { cents: o.cents, currency: o.currency, url: o.url };
  return {
    id: p.id,
    slug: p.slug,
    name: shortName(p.name),
    set: set?.name ?? null,
    image: imageAt(p.image, "400w"),
    releasesOn: pre ? set?.releasedOn ?? null : null,
    preorderHref: pre && set ? preorderPath(set) : null,
    totalStores: summaryOf(p.id).listedSources,
    prices,
    ebay,
  };
}

const PREORDER_TYPES = new Set(["Booster Box", "Display", "Collection", "Special Edition", "Tin", "Box"]);

/** The hero's products: the homepage shelf, then each set on pre-order with its boxes. Only products some store sells. */
export function sealedHero(featuredCount = 7, preorderSetsMax = 2, perSet = 3): SealedHeroData {
  const sold = (i: HeroItem) => Object.keys(i.prices).length > 0;
  const featured = featuredSealed(featuredCount + 4).map(heroItem).filter(sold).slice(0, featuredCount);
  const preorders = preorderSetList()
    .filter((s) => isPreorder(s))
    .map((s) => ({
      name: s.name,
      href: preorderPath(s),
      releasesOn: s.releasedOn ?? null,
      items: sealedInSet(s.id)
        .filter((p) => p.sealedType !== "Booster Pack" && p.sealedType !== "Case" && (PREORDER_TYPES.has(p.sealedType ?? "") || /box|display/i.test(p.name)))
        .map(heroItem)
        .filter(sold)
        .slice(0, perSet),
    }))
    .filter((s) => s.items.length > 0)
    .slice(0, preorderSetsMax);
  return { featured, preorders };
}
