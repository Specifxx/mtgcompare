import { prisma } from "./db";
import { cardSelect, toCard, type ProductCardData } from "./data";
import type { Market } from "./regions";
import type { MtgSet } from "./sets";

// The Black Friday / Cyber Monday PRICE WATCH (DECISIONS.md, 2026-11-06). The owner's October numbers: the US made 73% of
// affiliate earnings at a US$108 average order, one US$6.4k order earned as much as twelve ordinary days, and eBay credits only a
// purchase made within 24 hours of the click. So /<region>/black-friday and /<region>/cyber-monday carry, under the deals, the
// high-value end of the market with an eBay search beside every row (the live listing strips stay what they are everywhere: client
// fetched, never in the server HTML, components/EbayStrip.tsx): the dearest sealed in stock, the week's moves down (lib/stock.ts
// priceMoves), older sets still in stock (lib/stock.ts groupOlderInStock, one product per set) and graded chase-card searches.
// The copy stays inside lib/copy-rules.ts: never "price drops", "dropped", a "was" price or a countdown.

export const DEAREST_ROWS = 10;
export const DOWN_ROWS = 8;
export const OLDER_ROWS = 8;

/** Rows of a market's dearest sealed products an independent store has in stock today: a scoped, capped read (src/lib/db.ts rules). */
export async function dearestInStock(market: Market, take = DEAREST_ROWS): Promise<ProductCardData[]> {
  const rows = await prisma.productStat.findMany({
    where: { market, inStockStores: { gt: 0 }, lowestPriceCents: { gt: 0 } },
    orderBy: { lowestPriceCents: "desc" },
    take,
    select: cardSelect,
  });
  return rows.map(toCard);
}

/** One product per older set (the set's most-stocked headline product), the sets most stores carry first: pure over groupOlderInStock's groups. */
export function olderShelf<T>(groups: readonly { set: MtgSet; items: readonly T[] }[], take = OLDER_ROWS): { set: MtgSet; item: T }[] {
  return groups.filter((g) => g.items.length > 0).slice(0, take).map((g) => ({ set: g.set, item: g.items[0] }));
}

/** The graded chase-card searches the page offers (eBay Buy It Now, tagged): the cards buyers grade and chase most. */
export interface GradedSearch {
  label: string;
  query: string;
}
export const GRADED_SEARCHES: readonly GradedSearch[] = [
  { label: "PSA 10 Black Lotus", query: "PSA Black Lotus" },
  { label: "Graded Alpha or Beta", query: "PSA Alpha Beta Magic the Gathering" },
  { label: "PSA 10 Mox", query: "PSA 10 Mox Magic" },
  { label: "Graded Reserved List", query: "PSA Reserved List Magic" },
  { label: "PSA 10 Sheoldred", query: "PSA 10 Sheoldred the Apocalypse" },
  { label: "BGS 10 Magic", query: "BGS 10 Magic the Gathering card" },
];
