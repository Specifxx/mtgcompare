// The "Coming soon" block (landing page and region homes, components/ComingSoon.tsx): the next set to release, by lib/sets.ts dates
// alone, with its headline products' cheapest open STORE pre-order in a region. Every number is the stores' own (the set's price
// lists, data.ts setOfferGroups) or a count of them; US MSRP only where lib/rrp.ts has one. No set name is written here: on the
// set's release day the next one takes its place (or the block goes, when sets.ts knows of none). Pure (no data read, no React),
// so tests/coming-soon.test.ts checks the selection directly.
import { cheapestStoreOffer, storeOffers, type PreorderGroup, type PreorderOffer } from "./preorder-copy";
import { preorderPath } from "./preorder-guides";
import type { RegionInfo } from "./regions";
import { usMsrpCents } from "./rrp";
import { offerStock } from "./sealed-offers";
import { TYPE_BY_LABEL, type TypeKey } from "./sealed-title";
import { SETS, type MtgSet } from "./sets";

/** The soonest set whose release date is after `today` (YYYY-MM-DD), or null. On release day it is out, so it is not "next". */
export function nextUpcomingSet(today: string = new Date().toISOString().slice(0, 10)): MtgSet | null {
  let best: MtgSet | null = null;
  for (const s of SETS) if (s.releaseDate > today && (!best || s.releaseDate < best.releaseDate)) best = s;
  return best;
}

/** Whole days from `today` to `iso`. */
export function daysUntil(iso: string, today: string): number {
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400_000);
}

/** "out tomorrow", "out in 18 days". */
export function outIn(days: number): string {
  return days <= 1 ? "out tomorrow" : `out in ${days} days`;
}

// The headline products, in this order. Commander decks are one line: the cheapest named deck and how many decks are open.
const HEADLINE: { type: TypeKey; label: string }[] = [
  { type: "play-booster-box", label: "Play Booster Box" },
  { type: "collector-booster-box", label: "Collector Booster Box" },
  { type: "bundle", label: "Bundle" },
  { type: "commander-deck", label: "Commander decks" },
  { type: "prerelease-pack", label: "Prerelease Pack" },
  { type: "collector-booster", label: "Collector Booster Pack" },
];

export interface FeaturedItem {
  type: TypeKey;
  label: string;
  /** The product page of the cheapest open pre-order (for Commander decks, the cheapest deck's). */
  slug: string;
  /** The cheapest open store pre-order, in the region's currency. */
  cents: number;
  /** Distinct stores with an open pre-order (for Commander decks, of any deck). */
  stores: number;
  /** Commander decks only: how many different decks are open (a Collector's Edition counts as its own). */
  decks: number | null;
  /** The cheapest deck's name, Commander decks only. */
  deckName: string | null;
  /** US MSRP from lib/rrp.ts, US only, or null. */
  msrpCents: number | null;
}

export interface FeaturedSet {
  code: string;
  name: string;
  slug: string;
  releaseDate: string;
}

export interface Featured {
  set: FeaturedSet;
  /** The set's pre-order hub in the region, or (no guide yet) the set's page. */
  href: string;
  items: FeaturedItem[];
}

type Group = PreorderGroup<PreorderOffer> & { product: { slug: string } };

function openStores(g: Group, now: number): Set<string> {
  return new Set(storeOffers(g.offers, now).filter((o) => offerStock(o, now) === "open").map((o) => o.store));
}

/** The headline lines a region's price lists hold (only products with an open store pre-order; none invented). */
export function featuredItems(groups: readonly Group[], market: RegionInfo["market"], setCode: string, now: number = Date.now()): FeaturedItem[] {
  const out: FeaturedItem[] = [];
  for (const h of HEADLINE) {
    const of = groups.filter((g) => TYPE_BY_LABEL.get(g.product.productType)?.key === h.type);
    let best: { g: Group; cents: number } | null = null;
    const stores = new Set<string>();
    let decks = 0;
    for (const g of of) {
      const o = cheapestStoreOffer(g.offers, now);
      if (!o) continue;
      decks++;
      for (const s of openStores(g, now)) stores.add(s);
      if (!best || o.priceCents < best.cents) best = { g, cents: o.priceCents };
    }
    if (!best) continue;
    const deck = h.type === "commander-deck";
    out.push({
      type: h.type,
      label: h.label,
      slug: best.g.product.slug,
      cents: best.cents,
      // A set product is one product; a multi-product line (Prerelease Packs) counts the stores of the cheapest one.
      stores: deck ? stores.size : openStores(best.g, now).size,
      decks: deck ? decks : null,
      deckName: deck ? best.g.product.name : null,
      msrpCents: market === "US" ? usMsrpCents(h.type, setCode) : null,
    });
  }
  return out;
}

/** The block's data for a region, or null when no set is upcoming (on and after the last known set's release day). */
export function featuredFor(region: Pick<RegionInfo, "region" | "market">, groups: readonly Group[], today: string, now: number = Date.now()): Featured | null {
  const set = nextUpcomingSet(today);
  if (!set) return null;
  return {
    set: { code: set.code, name: set.name, slug: set.slug, releaseDate: set.releaseDate },
    href: preorderPath(region.region, set.code) ?? `/${region.region}/sets/${set.slug}`,
    items: featuredItems(groups, region.market, set.code, now),
  };
}
