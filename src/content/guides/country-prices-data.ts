// The by-country page's one loader (/guides/pokemon-booster-box-prices-by-country): every market's OPEN booster boxes of the
// candidate sets, then the lead set's open ETB and booster bundle in every market. Two capped reads of ProductStat ⋈ Product (about
// 6 sets × 7 markets, then 2 types × 7 markets: at most about 60 small rows, ~15 KB) and one aggregate for "prices checked", once per
// ISR render (src/lib/db.ts rules 1–2; no unstable_cache: the page is the cache).
import { cardSelect, OPEN, toCard } from "@/lib/data";
import { prisma } from "@/lib/db";
import type { Market } from "@/lib/regions";
import { TCGPLAYER } from "@/lib/stores";
import { BOX, candidateSets, LEAD_TYPES, shownSets, type MarketCard } from "./country-prices";

export interface CountryData {
  /** The render's day (YYYY-MM-DD, UTC): what "upcoming" is judged against. */
  today: string;
  /** When the stores were last read (ISO), or null before the first import. */
  checked: string | null;
  /** The sets the box tables show, the lead (an upcoming set when there is one) first. */
  sets: string[];
  /** The open booster boxes of those sets and the lead set's open ETB and bundle, in every market. */
  cards: MarketCard[];
}

const select = { market: true, ...cardSelect } as const;

export async function loadCountryData(now: Date = new Date()): Promise<CountryData> {
  const today = now.toISOString().slice(0, 10);
  const candidates = candidateSets(today).map((s) => s.code);
  const [boxRows, checked] = await Promise.all([
    prisma.productStat.findMany({
      where: { ...OPEN, lowestPriceCents: { gt: 0 }, product: { setCode: { in: candidates }, productType: BOX } },
      take: candidates.length * 7 * 2,
      select,
    }),
    prisma.storeStat.aggregate({ where: { store: { not: TCGPLAYER.key } }, _max: { lastOkAt: true } }),
  ]);
  const boxes: MarketCard[] = boxRows.map((row) => ({ ...toCard(row), market: row.market as Market }));
  const sets = shownSets(boxes, candidates);
  const lead = sets[0];
  const leadRows = lead
    ? await prisma.productStat.findMany({
        where: { ...OPEN, lowestPriceCents: { gt: 0 }, product: { setCode: lead, productType: { in: [...LEAD_TYPES] } } },
        take: LEAD_TYPES.length * 7 * 2,
        select,
      })
    : [];
  return {
    today,
    checked: checked._max.lastOkAt?.toISOString() ?? null,
    sets,
    cards: [...boxes.filter((c) => c.setCode && sets.includes(c.setCode)), ...leadRows.map((row) => ({ ...toCard(row), market: row.market as Market }))],
  };
}
