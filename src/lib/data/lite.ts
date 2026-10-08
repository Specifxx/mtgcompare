// src/lib/data/lite.ts (owner WP02, FROZEN). The pure hydrator from PUBLISHED ROWS to a CardLite. Two producers feed it: the bucket fan-in (cat + px + un rows of one product: rowFromPlane) and the browse index
// (columnar rows: the engine builds a CardLiteRow itself). Used by every list and lookup loader; unit-tested without a network (tests/lite.test.ts).
import { CARD_FLAGS, PRICE_MASK, PRIMARY_TYPES, PRIMARY_TYPE_LABEL, colorsOfMask, printingOf, trackedBits, type Finish, type Rarity, type TreatmentKey } from "../constants";
import { MARKETS, type Country } from "../country";
import type { CatRow, PxRow, UnRow } from "./plane/formats";
import type { CardLite, Quote } from "./types";

/** The intermediate row: everything liteFromRow needs, for ONE unit (the finish shown). low/stores are the shown unit's per-market aggregate in MARKETS order, null when the unit is untracked or has no `un` row yet. */
export interface CardLiteRow {
  id: number; slug: string; name: string; alt: string | null; setId: number; sc: string | null; number: string | null; rarity: string; cls: number; treat: string; label: string | null; flags: number;
  oracleNo: number | null; scryId: string | null; colors: number; mv: number; ptype: number; setTok: string;
  marketN: number | null; marketF: number | null; lowN: number | null; lowF: number | null; mask: number;
  shown: Finish;                                             // the finish this lite describes (the headline, or the finish a query named)
  low: readonly (number | null)[] | null; stores: readonly number[] | null;
  change7d: number | null; change30d: number | null; high90: number | null;
}
const quote = (market: number | null, low: number | null): Quote | null => (market == null && low == null ? null : { market, low });
const z = <T>(v: T | 0 | undefined): T | null => (v === 0 || v === undefined ? null : v);

export function liteFromRow(r: CardLiteRow): CardLite {
  const treat = (r.treat ? r.treat.split(" ") : []) as TreatmentKey[];
  const low = {} as Record<Country, number | null>, stores = {} as Record<Country, number>;
  MARKETS.forEach((m, i) => { low[m] = r.low?.[i] ?? null; stores[m] = r.stores?.[i] ?? 0; });
  const market = r.shown === "N" ? r.marketN : r.marketF;                      // MARKET ONLY: the ranking value
  const lowOfShown = r.shown === "N" ? r.lowN : r.lowF;
  const valueUsd = market ?? lowOfShown;                                       // display only
  return {
    id: r.id, slug: r.slug, name: r.name, alt: r.alt, setId: r.setId, sc: r.sc, setCode: (r.sc ?? r.setTok).toUpperCase(),
    number: r.number, rarity: r.rarity as Rarity, cls: r.cls, treat, label: r.label, flags: r.flags, oracleNo: r.oracleNo, scryId: r.scryId,
    colorMask: r.colors, mv: r.mv, ptype: r.ptype, marketUsd: market, headFinish: r.shown, valueUsd, lowOnly: market == null && valueUsd != null,
    n: quote(r.marketN, r.lowN), f: quote(r.marketF, r.lowF), tracked: trackedBits(r.mask),
    listed: (r.mask & PRICE_MASK.LISTED) !== 0, top: (r.mask & PRICE_MASK.TOP) !== 0, thin: (r.mask & PRICE_MASK.THIN) !== 0,
    low, stores, change7d: r.change7d, change30d: r.change30d, high90Usd: r.high90,
    colors: colorsOfMask(r.colors), variant: r.label, printing: printingOf(treat), cost: r.oracleNo ? Math.min(99, Math.max(0, Math.round(r.mv))) : null,
    cardType: PRIMARY_TYPE_LABEL[PRIMARY_TYPES[r.ptype] ?? "other"], hasImage: (r.flags & CARD_FLAGS.TCGIMG) !== 0,
  };
}

/** The headline finish of a mask (Normal first): HEADF set = Foil. */
export const headlineFinish = (mask: number): Finish => ((mask & PRICE_MASK.HEADF) !== 0 ? "F" : "N");
/** One product's published rows -> the intermediate row. `unit` names the finish to show (a unit view); default the headline. `un` = the product's un rows (uid = id * 2 + finish), either or both finishes. */
export function rowFromPlane(cat: CatRow, px: PxRow | undefined, setTok: string, un: readonly UnRow[] = [], unit?: Finish): CardLiteRow {
  const mask = px?.[5] ?? 0, shown = unit ?? headlineFinish(mask), fi = shown === "N" ? 0 : 1;
  const agg = un.find((u) => u[0] === cat[0] * 2 + fi);
  const at = (nIdx: number): number | null => { const v = px?.[shown === "N" ? nIdx : nIdx + 3]; return v === undefined ? null : v; };
  return {
    id: cat[0], slug: cat[1], name: cat[2], alt: z(cat[3]), setId: cat[4], sc: z(cat[5]), number: z(cat[6]), rarity: cat[8], cls: cat[9], treat: cat[10], label: z(cat[11]), flags: cat[12],
    oracleNo: cat[14] || null, scryId: z(cat[15]), colors: cat[18], mv: cat[19], ptype: cat[20], setTok,
    marketN: px?.[1] ?? null, marketF: px?.[2] ?? null, lowN: px?.[3] ?? null, lowF: px?.[4] ?? null, mask, shown,
    low: agg ? agg[1] : null, stores: agg ? agg[2] : null,
    change7d: at(6), change30d: at(7), high90: at(8),
  };
}
/** A page of lites. `total` is the number of matching rows before paging. A page past the last returns the last page with capped true (the route 404s for page > 100). */
export function pageOf(items: CardLite[], total: number, page: number, per: number): { total: number; pages: number; page: number; items: CardLite[]; capped: boolean } {
  const pages = Math.max(1, Math.ceil(total / per));
  return { total, pages, page: Math.min(page, pages), items, capped: page > pages };
}
