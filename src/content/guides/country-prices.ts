// "Magic booster box prices by country" (/guides/magic-booster-box-prices-by-country): the one guide that compares all seven markets,
// so it lives outside the regions (src/app/(site)/guides/…), with one canonical URL and no hreflang. Everything here is pure (no
// database, no React): the page's facts, which sets it shows, the rows it draws and the FAQ, so tests/country-prices.test.ts checks
// them on fixtures.
//
// THE RULES: NO CURRENCY CONVERSION. Every price is a store's own, in its own currency; the page never says which country is
// "cheapest". Live numbers say "today"; nothing may match BANNED_COPY.
import type { ProductCardData } from "../../lib/data";
import { money, plural } from "../../lib/format";
import { REGION_LIST, type RegionInfo } from "../../lib/regions";
import { SET_BY_CODE } from "../../lib/sets";
import { familyOf, isOpenCard, perPackOf, type FamilyKey, type MarketCard } from "../families";

export type { MarketCard };

export const COUNTRY_GUIDE = {
  slug: "magic-booster-box-prices-by-country",
  path: "/guides/magic-booster-box-prices-by-country",
  title: "Magic booster box prices by country: US, UK, Australia & more",
  /** The H1: shorter than the <title>. */
  h1: "Magic booster box prices by country",
  description: "What a Magic booster box costs today in the US, the UK, Australia, Canada, New Zealand, Europe and Singapore: each country’s cheapest store price.",
  kicker: "Across countries",
  published: "2026-10-21",
  updated: "2026-10-21",
} as const;

/** The box families the page compares, in order. */
export const COUNTRY_FAMILIES: readonly FamilyKey[] = ["play-box", "collector-box"];
/** Kept for the page's lead line: the family the FAQ quotes. */
export const BOX: FamilyKey = "play-box";

/** How many sets the tables show. */
export const SHOWN_SETS = 4;

export interface MarketLine {
  r: RegionInfo;
  p: MarketCard | null;
  perPack: number | null;
}

/** The cheapest open product of a family of a set in each market, in REGION_LIST order (never sorted by price: currencies differ). */
export function marketLines(cards: readonly MarketCard[], setCode: string, fam: FamilyKey): MarketLine[] {
  return REGION_LIST.map((r) => {
    const p =
      cards
        .filter((c) => c.market === r.market && c.setCode === setCode && familyOf(c.name)?.key === fam && c.lowestPriceCents != null && isOpenCard(c))
        .sort((a, b) => (a.lowestPriceCents ?? 0) - (b.lowestPriceCents ?? 0))[0] ?? null;
    return { r, p, perPack: p ? perPackOf(p) : null };
  });
}

/** The sets the page shows: those with a box open in the most markets, newest first among equals, at most SHOWN_SETS. */
export function shownSets(cards: readonly MarketCard[]): string[] {
  const markets = new Map<string, Set<string>>();
  for (const c of cards) if (c.setCode && isOpenCard(c)) (markets.get(c.setCode) ?? markets.set(c.setCode, new Set()).get(c.setCode)!).add(c.market);
  return [...markets.entries()]
    .sort((a, b) => (SET_BY_CODE.get(b[0])?.releaseDate ?? "").localeCompare(SET_BY_CODE.get(a[0])?.releaseDate ?? "") || b[1].size - a[1].size)
    .filter(([, m]) => m.size >= 2)
    .slice(0, SHOWN_SETS)
    .map(([code]) => code);
}

/** "2 stores", "4 stores + TCGplayer" or "TCGplayer". */
export function whereOpen(p: Pick<ProductCardData, "inStockStores" | "marketplaceOpen">): string {
  if (p.inStockStores > 0) return `${plural(p.inStockStores, "store")}${p.marketplaceOpen ? " + TCGplayer" : ""}`;
  return p.marketplaceOpen ? "TCGplayer" : "—";
}

export const setByCode = (code: string) => SET_BY_CODE.get(code) ?? null;

export interface Faq {
  q: string;
  a: string;
}

/** The FAQ (and its FAQPage JSON-LD). `lead`: the first set shown, with its Play Booster box lines, for the one live answer. */
export function countryFaqs(lead: { name: string; lines: readonly MarketLine[] } | null): Faq[] {
  const uk = lead?.lines.find((l) => l.r.region === "uk");
  const us = lead?.lines.find((l) => l.r.region === "us");
  const live =
    lead && uk?.p && us?.p
      ? ` Right now the cheapest ${lead.name} Play Booster box is ${money(us.p.lowestPriceCents, "US")} in the US and ${money(uk.p.lowestPriceCents, "UK")} in the UK: convert one at your card’s rate on the day before you compare them.`
      : "";
  return [
    {
      q: "Is a Magic booster box cheaper in the US or the UK?",
      a: `We don’t convert currencies, so we don’t rank countries: each price here is a store’s own, in its own currency. US prices usually exclude sales tax, which is added at checkout, while UK prices include VAT, so a US sticker price looks lower than what you pay.${live}`,
    },
    {
      q: "What is the cheapest country to buy a Magic booster box?",
      a: "It changes with the set, the week and the exchange rate, so we don’t name one. Compare the prices after converting at your own card’s rate, and add shipping, tax and any import charges for the country you’d buy from.",
    },
    {
      q: "Is it worth importing a booster box from another country?",
      a: "Usually not for one box: international shipping on a box is expensive, your country may charge import tax or duty, and returning a damaged box overseas is hard. Work out the delivered price first.",
    },
    {
      q: "How often are these prices updated?",
      a: "We read each store’s listings about twice a day. A store’s own page is final: prices and stock can change between reads.",
    },
  ];
}
