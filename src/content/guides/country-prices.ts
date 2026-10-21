// "Pokémon booster box prices by country" (/guides/pokemon-booster-box-prices-by-country): the one page that compares all seven
// markets, so it lives outside the regions (src/app/(site)/guides/…), with one canonical URL and no hreflang. Everything here is pure
// (no database, no React): the page's facts, which sets it shows, the rows it draws from the loader's ProductStat rows, the sentences
// built from them and the FAQ, so tests/country-prices.test.ts checks them on fixtures.
//
// THE RULES (the About page says them too):
//   • NO CURRENCY CONVERSION. Every price is a store's own, in its own currency; the site has no exchange-rate source it could print
//     (sealed-title.ts FLOOR_FX is a rough threshold table, never shown). So the page never says which country is "cheapest": it
//     shows each market's price and per-pack price side by side, says how to compare them, and states only currency-free facts
//     (where it is open, how many stores have it).
//   • US MSRP (rrp.ts, with RRP_NOTE) only on the US row.
//   • Live numbers say "today"/"right now"; nothing may match BANNED_COPY; no pull rates, EV, investment or trend claims.
import type { ProductCardData } from "../../lib/data";
import { money, plural } from "../../lib/format";
import { packsForLabel, perPackCents } from "../../lib/packs";
import { REGION_LIST, type Market, type RegionInfo } from "../../lib/regions";
import type { PokemonSet } from "../../lib/sets";
import { SET_BY_CODE } from "../../lib/sets";
import { andList, newestReleased, upcomingSets } from "./facts";

export const COUNTRY_GUIDE = {
  slug: "pokemon-booster-box-prices-by-country",
  path: "/guides/pokemon-booster-box-prices-by-country",
  title: "Pokémon booster box prices by country: Australia, US, UK & more",
  /** The H1: shorter than the <title>. */
  h1: "Pokémon booster box prices by country",
  description: "What a Pokémon booster box costs today in Australia, the US, the UK, Canada, New Zealand, Europe and Singapore: each country’s cheapest store price, per pack.",
  kicker: "Across countries",
  published: "2026-10-16",
  updated: "2026-10-16",
} as const;

/** The product types the page compares: the booster box in every set it shows, the ETB and bundle in its lead set. */
export const BOX = "Booster Box";
export const LEAD_TYPES = ["Elite Trainer Box", "Booster Bundle"] as const;

/** How many sets the box tables show, and how many the loader reads to find them (a set with no box listed anywhere is skipped). */
export const SHOWN_SETS = 4;

/** The loader's candidate sets: the soonest upcoming set sold as a booster box, then the newest released ones, newest first. */
export function candidateSets(today: string): PokemonSet[] {
  return [...upcomingSets(today).filter((s) => !s.noBoosterBox).slice(0, 1), ...newestReleased(today, SHOWN_SETS + 2, (s) => !s.noBoosterBox)];
}

/** One open listing of a product in one market: what a ProductStat row (with its market) becomes. */
export type MarketCard = ProductCardData & { market: Market };

/** One market's line of a table: its cheapest open product of the type, or null. */
export interface MarketLine {
  r: RegionInfo;
  p: MarketCard | null;
  perPack: number | null;
}

/** The cheapest open product of a type of a set in each market, in REGION_LIST order (never sorted by price: currencies differ). */
export function marketLines(cards: readonly MarketCard[], setCode: string, typeLabel: string): MarketLine[] {
  return REGION_LIST.map((r) => {
    const p =
      cards
        .filter((c) => c.market === r.market && c.setCode === setCode && c.productType === typeLabel && c.lowestPriceCents != null && (c.inStockStores > 0 || c.marketplaceOpen))
        .sort((a, b) => (a.lowestPriceCents ?? 0) - (b.lowestPriceCents ?? 0))[0] ?? null;
    return { r, p, perPack: p ? perPackCents(p.lowestPriceCents, packsForLabel(p.productType, p.setCode, p.name)) : null };
  });
}

/** The sets the page shows: the candidates with a booster box open in at least one market, at most SHOWN_SETS, in candidate order. */
export function shownSets(cards: readonly MarketCard[], candidates: readonly string[]): string[] {
  return candidates.filter((code) => marketLines(cards, code, BOX).some((l) => l.p)).slice(0, SHOWN_SETS);
}

/** "2 stores", "4 stores + TCGplayer" or "TCGplayer": where a market's cheapest is open. */
export function whereOpen(p: Pick<ProductCardData, "inStockStores" | "marketplaceOpen">): string {
  if (p.inStockStores > 0) return `${plural(p.inStockStores, "store")}${p.marketplaceOpen ? " + TCGplayer" : ""}`;
  return p.marketplaceOpen ? "TCGplayer" : "—";
}

/**
 * The lead set's sentence, currency-free except for each market's own price: where it is open, and what a pack in the cheapest box
 * works out to in each market's own currency. Null when no market has it.
 */
export function leadSummary(set: Pick<PokemonSet, "name" | "releaseDate">, lines: readonly MarketLine[], today: string): string | null {
  const open = lines.filter((l) => l.p);
  if (!open.length) return null;
  const pre = set.releaseDate > today;
  const where =
    open.length === lines.length
      ? `in all ${lines.length} markets we compare`
      : `in ${open.length} of the ${lines.length} markets we compare (${andList(open.map((l) => l.r.inName))})`;
  const most = [...open].sort((a, b) => (b.p!.inStockStores ?? 0) - (a.p!.inStockStores ?? 0))[0];
  const perPack = open.filter((l) => l.perPack != null).map((l) => `${money(l.perPack, l.r.market)} in ${l.r.inName}`);
  return [
    `Today the ${set.name} booster box is ${pre ? "open for pre-order" : "in stock"} ${where}.`,
    most.p!.inStockStores > 1 ? `${most.r.inName.replace(/^./, (c) => c.toUpperCase())} has the most stores with it ${pre ? "open" : "in stock"} (${most.p!.inStockStores}).` : "",
    perPack.length ? `A pack in the cheapest box works out to ${andList(perPack)}, each in its own currency.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export interface Faq {
  q: string;
  a: string;
}

/** The FAQ (and its FAQPage JSON-LD). `lead` is the set the first table shows, with its lines, for the one live answer. */
export function countryFaqs(lead: { set: Pick<PokemonSet, "name" | "releaseDate">; lines: readonly MarketLine[] } | null, today: string): Faq[] {
  const au = lead?.lines.find((l) => l.r.region === "au");
  const us = lead?.lines.find((l) => l.r.region === "us");
  const pre = lead ? lead.set.releaseDate > today : false;
  const live =
    lead && au?.p && us?.p
      ? ` Right now the cheapest ${lead.set.name} booster box ${pre ? "pre-order " : ""}is ${money(au.p.lowestPriceCents, "AU")} in Australia and ${money(us.p.lowestPriceCents, "US")} in the US: convert one at your card’s rate on the day before you compare them.`
      : "";
  return [
    {
      q: "Is a Pokémon booster box cheaper in Australia or the US?",
      a: `We don’t convert currencies, so we don’t rank countries: each price here is a store’s own, in its own currency. US prices usually exclude sales tax, which is added at checkout, while Australian prices include GST, so a US sticker price looks lower than what you pay.${live}`,
    },
    {
      q: "What is the cheapest country to buy a Pokémon booster box?",
      a: "It changes with the set, the week and the exchange rate, so we don’t name one. Compare the per-pack prices in the tables after converting at your own card’s rate, and add shipping, tax and any import charges for the country you’d buy from.",
    },
    {
      q: "Is it worth importing a booster box from another country?",
      a: "Usually not for one box: international shipping on a box is expensive, your country may charge import tax or duty, and returning a damaged box overseas is hard. Work out the delivered price first, and check your customs authority’s current rules.",
    },
    {
      q: "How often are these prices updated?",
      a: "We read each store’s listings about twice a day, and this page is updated from the latest read once a day. A store’s own page is final: prices and stock can change between reads.",
    },
  ];
}

/** The set a code names, for the body. */
export const setByCode = (code: string): PokemonSet | null => SET_BY_CODE.get(code) ?? null;
