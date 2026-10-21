// The by-country page's one loader: every market's open Play and Collector Booster boxes (one capped read per family across all
// markets, at most about 560 small rows), and "prices checked".
import { cardSelect, OPEN, toCard } from "@/lib/data";
import { prisma } from "@/lib/db";
import type { Market } from "@/lib/regions";
import { FAMILY, familyOf, lastCheckedAnywhere } from "../live";
import { COUNTRY_FAMILIES, shownSets, type MarketCard } from "./country-prices";

export interface CountryData {
  today: string;
  checked: string | null;
  /** The sets the tables show, newest first. */
  sets: string[];
  cards: MarketCard[];
}

export async function loadCountryData(now: Date = new Date()): Promise<CountryData> {
  const today = now.toISOString().slice(0, 10);
  const [lists, checked] = await Promise.all([
    Promise.all(
      COUNTRY_FAMILIES.map((k) =>
        prisma.productStat.findMany({
          where: { ...OPEN, lowestPriceCents: { gt: 0 }, product: { name: { contains: FAMILY[k].query, mode: "insensitive" }, setCode: { not: null } } },
          take: 280,
          select: { market: true, ...cardSelect },
        }),
      ),
    ),
    lastCheckedAnywhere(),
  ]);
  const cards: MarketCard[] = lists
    .flat()
    .map((row) => ({ ...toCard(row), market: row.market as Market }))
    .filter((c) => COUNTRY_FAMILIES.includes(familyOf(c.name)?.key as never));
  const sets = shownSets(cards);
  return { today, checked, sets, cards: cards.filter((c) => c.setCode && sets.includes(c.setCode)) };
}
