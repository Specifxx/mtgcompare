// src/lib/data/lite.ts (owner WP02, FROZEN). The pure hydrator from PUBLISHED ROWS to a CardLite. Two producers feed it: the bucket fan-in (cat + px + un rows of one product: rowFromPlane) and the browse index
// (columnar rows: the engine builds a CardLiteRow itself). Used by every list and lookup loader; unit-tested without a network (tests/lite.test.ts).
import { CARD_FLAGS, PRICE_MASK, PRIMARY_TYPES, PRIMARY_TYPE_LABEL, availableFinishes, colorsOfMask, fold, parseTreat, printingOf, trackedBits, type Finish, type Rarity, type TreatmentKey } from "../constants";
import { MARKETS, type Country } from "../country";
import { liveOffersFrom, type StoreRegistry } from "../offer-read";
import type { BoardRow, CatRow, OfferTuple, OracleRow, PxRow, StoreRunsFile, UnRow } from "./plane/formats";
import type { CardDetail, CardLite, CardMini, FamilyMember, OfferRow, OracleDetail, OracleMini, Quote, ScrySetLite, SetLite, UnitAgg } from "./types";

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

// ── ADDED by the loader modules (catalog.ts, history.ts): pure assembly of the other shapes the pages need, so the loaders only fetch and every rule is testable without a network ──────────────────────────────────────────────────────────────────
/** The tile subset of a lite (about 160 B). */
export const miniOf = (c: CardLite): CardMini => ({ id: c.id, slug: c.slug, name: c.name, alt: c.alt, setId: c.setId, setCode: c.setCode, number: c.number, rarity: c.rarity, treat: c.treat, label: c.label, flags: c.flags, scryId: c.scryId, marketUsd: c.marketUsd, valueUsd: c.valueUsd, lowOnly: c.lowOnly, headFinish: c.headFinish, tracked: c.tracked, thin: c.thin });
/** A set board row (st/<setId>.json) as a CardMini of its headline unit. The board carries no alt name and no Scryfall id, so both are null here (a tile that needs the Scryfall image fetches the card). */
export function miniFromBoard(r: BoardRow, set: Pick<SetLite, "id" | "tok">): CardMini {
  const mask = r[14], head = headlineFinish(mask), market = head === "N" ? r[10] : r[11], low = head === "N" ? r[12] : r[13], value = market ?? low;
  return {
    id: r[0], slug: r[1], name: r[2], alt: null, setId: set.id, setCode: (z(r[9]) ?? set.tok).toUpperCase(), number: z(r[3]), rarity: r[4] as Rarity, treat: parseTreat(r[6]), label: z(r[7]), flags: r[8], scryId: null,
    marketUsd: market, valueUsd: value, lowOnly: market == null && value != null, headFinish: head, tracked: trackedBits(mask), thin: (mask & PRICE_MASK.THIN) !== 0,
  };
}
/** An oracle row of or/<n>.json as the page object. Keywords are published as one space-separated string of lower-case tokens; an absent layout is "normal". */
export function oracleFromRow(r: OracleRow): OracleDetail {
  return { no: r[0], scryfallId: r[1], slug: r[2], name: r[3], manaCost: r[4], manaValue: r[5], typeLine: r[6], colors: r[7], identity: r[8], legal: r[9], edhrecRank: z(r[10]), flags: r[11], layout: z(r[12]) ?? "normal", pt: z(r[13]), loyalty: z(r[14]), oracleText: z(r[15]), keywords: r[16] ? r[16].split(" ") : [], faces: z(r[17]) ?? 1, nPrint: r[18] };
}
export const oracleMiniOf = (o: OracleDetail): OracleMini => ({ no: o.no, slug: o.slug, name: o.name, nameKey: fold(o.name), colors: o.colors, identity: o.identity, typeLine: o.typeLine, nPrint: o.nPrint, legal: o.legal, flags: o.flags });
/** The family key of a catalogue row: the root it points at, or itself. Two rows are the same Scryfall printing (a base product, its etched twin, a variant) when the keys are equal. */
export const familyKey = (r: Pick<CatRow, 0 | 16>): number => r[16] || r[0];
/** The other products of the card's Scryfall printing, from the rows of its bucket(s); `pxOf` supplies the mask (finishes priced). Sorted by id. */
export function familyMembers(cat: CatRow, rows: readonly CatRow[], pxOf: (id: number) => PxRow | undefined): FamilyMember[] {
  const key = familyKey(cat);
  return rows.filter((r) => r[0] !== cat[0] && familyKey(r) === key).sort((a, b) => a[0] - b[0]).map((r) => {
    const mask = pxOf(r[0])?.[5] ?? 0;
    return { id: r[0], slug: r[1], name: r[2], label: z(r[11]), treat: parseTreat(r[10]), flags: r[12], hasN: (mask & PRICE_MASK.HASN) !== 0, hasF: (mask & PRICE_MASK.HASF) !== 0 };
  });
}
export interface DetailInput { cat: CatRow; px: PxRow | undefined; un: readonly UnRow[]; of: readonly OfferTuple[]; set: SetLite; origin: ScrySetLite | null; oracle: OracleRow | null; family: FamilyMember[]; runs: StoreRunsFile | null; pricesAt: string }
export const DETAIL_OFFER_CAP = 200;
/** The card page's object from the published rows of ONE product. `un` and `of` are the product's tracked-unit rows (empty for an untracked card). The offers are the live-offer rule of offer-read.ts (one implementation: a stale or failed feed comes back out of stock, never dropped),
 *  the synthesised TCGplayer rows (one per finish with a low, store 0, market US, dated by the publish) and no eBay row, cheapest first, at most 200. */
export function detailFromPlane(i: DetailInput, o: { registry?: StoreRegistry; now?: number } = {}): CardDetail {
  const row = rowFromPlane(i.cat, i.px, i.set.tok, i.un), lite = liteFromRow(row), mask = row.mask, id = i.cat[0];
  const units: UnitAgg[] = (["N", "F"] as const).filter((f) => (mask & (f === "N" ? PRICE_MASK.TRACKN : PRICE_MASK.TRACKF)) !== 0).map((finish) => {
    const u = rowFromPlane(i.cat, i.px, i.set.tok, i.un, finish), l = liteFromRow(u);
    return { finish, low: l.low, stores: l.stores, change7d: u.change7d, change30d: u.change30d, high90: u.high90 };
  });
  const live = liveOffersFrom(availableFinishes(mask).map((finish) => ({ id, finish })), i.of, new Map(i.px ? [[id, i.px] as const] : []), i.runs, { includeTcgplayer: true, now: o.now, registry: o.registry });
  const offers: OfferRow[] = live.map((l) => ({ finish: l.finish, storeId: l.storeId, source: l.source, market: l.market, priceCents: l.priceCents, currency: l.currency, url: l.url, inStock: l.inStock, condition: l.condition, shippingCents: null, updatedAt: l.storeId === 0 ? i.pricesAt : l.refreshedAt.toISOString() }))
    .sort((a, b) => a.priceCents - b.priceCents || a.storeId - b.storeId || (a.finish < b.finish ? -1 : 1)).slice(0, DETAIL_OFFER_CAP);
  return { ...lite, tcgName: z(i.cat[17]) ?? i.cat[2], tn: z(i.cat[17]), fnum: z(i.cat[7]), link: i.cat[13], rootId: z(i.cat[16]), set: i.set, origin: i.origin, oracle: i.oracle ? oracleFromRow(i.oracle) : null, family: i.family, mask, units, offers, pricesAt: i.pricesAt };
}
