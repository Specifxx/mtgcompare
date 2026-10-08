// src/lib/data/types.ts (owner WP02, FROZEN). Shared types of the data layer: what a tile, a list row, a card page and a query look like. The SOURCE of every value is a published file (contract section 12), never a table.
// CHANGED against the first draft: the oracle key is the ORDINAL `oracleNo` (the Scryfall uuid is carried only on OracleDetail); `marketUsd` is MARKET ONLY (null for a low-only unit) and the displayed value is the separate
// `valueUsd` + `lowOnly` (critique 5: 59 of the top 100 "market else low" cards were single thin listings); `popular` sorts by the published EDHREC column, not by a Neon counter. Everything else keeps OP's flat field names.
import type { Country } from "../country";
import type { Condition, ColorKey, Finish, Format, Rarity, SetKind, TreatmentKey } from "../constants";

export interface Quote { market: number | null; low: number | null }                 // USD cents, TCGplayer, ONE finish
export interface SetLite { id: number; slug: string; tok: string; code: string; name: string; tcgName: string; kind: SetKind; releasedOn: string | null; bucket: boolean; cardCount: number; trackedCount: number; sealedCount: number }
export interface SetIndex { sets: SetLite[]; byId: Map<number, SetLite>; bySlug: Map<string, SetLite>; byTok: Map<string, SetLite> }
export interface ScrySetLite { code: string; name: string; setType: string; releasedOn: string | null; parent: string | null }       // origin sets

/** What a tile, row or list needs: about 400 B as JSON in the draft; 716 to 778 B measured on 6,000 real hydrated rows (critique 8), which is why the caps of 7.11 are asserted on rows x measured bytes.
 *  ONE unit of the card is flattened into marketUsd/headFinish/low/stores/change: the headline unit (Normal first) by default, or the finish a query named (unit view), in which case `headFinish` is that finish. */
export interface CardLite {
  id: number; slug: string; name: string; alt: string | null;
  setId: number; sc: string | null; setCode: string;                    // setCode = (sc ?? Set.tok) upper-case, for display and search
  number: string | null; rarity: Rarity; cls: number; treat: TreatmentKey[]; label: string | null; flags: number;
  oracleNo: number | null; scryId: string | null;                       // oracleNo: the plane's oracle ordinal (write-once); both nullable: an unjoined product has no oracle
  colorMask: number; mv: number; ptype: number;
  /** The unit's TCGplayer MARKET price in USD cents; null for a low-only unit. Every sort key, range filter, hot-name score, index and chase pool reads THIS (marketOnlyCents), never `valueUsd`. */
  marketUsd: number | null; headFinish: Finish;
  /** What to DISPLAY as the unit's price: market, else the thin low (`lowOnly` true). Never a ranking input. */
  valueUsd: number | null; lowOnly: boolean;
  n: Quote | null; f: Quote | null;                                     // both finishes, TCGplayer
  tracked: number;                                                      // bit 1 = Normal tracked, bit 2 = Foil tracked ((mask >> 3) & 3)
  listed: boolean; top: boolean; thin: boolean;                         // LISTED / TOP / THIN bits of the catalogue mask (THIN: noindex, out of every sitemap)
  low: Record<Country, number | null>; stores: Record<Country, number>; // the HEADLINE unit's aggregate (un/ files); null / 0 when that unit is untracked or the store stage has not covered it yet
  change7d: number | null; change30d: number | null; high90Usd: number | null;   // headline unit, tracked only
  // OP-compatible aliases, derived in liteFromRow():
  colors: ColorKey[]; variant: string | null; printing: string; cost: number | null; cardType: string | null; hasImage: boolean;   // = colorsOfMask, label, printingOf(treat), round(mv) clamped 0..99 (null when no oracle), PRIMARY_TYPE_LABEL, flags & TCGIMG
}
export type CardMini = Pick<CardLite, "id" | "slug" | "name" | "alt" | "setId" | "setCode" | "number" | "rarity" | "treat" | "label" | "flags" | "scryId" | "marketUsd" | "valueUsd" | "lowOnly" | "headFinish" | "tracked" | "thin">;   // about 160 B
/** The oracle (rules object) of a page: `no` is the plane ordinal used by every key and URL; `scryfallId` is the Scryfall uuid, shown only where a link needs it. */
export interface OracleDetail { no: number; scryfallId: string; slug: string; name: string; manaCost: string; manaValue: number; typeLine: string; colors: number; identity: number; legal: string; edhrecRank: number | null; flags: number; layout: string; pt: string | null; loyalty: string | null; oracleText: string | null; keywords: string[]; faces: number; nPrint: number }
export interface OracleMini { no: number; slug: string; name: string; nameKey: string; colors: number; identity: number; typeLine: string; nPrint: number; legal: string; flags: number }
export interface FamilyMember { id: number; slug: string; name: string; label: string | null; treat: TreatmentKey[]; flags: number; hasN: boolean; hasF: boolean }   // the other products of the same Scryfall printing (rootId)
export interface UnitAgg { finish: Finish; low: Record<Country, number | null>; stores: Record<Country, number>; change7d: number | null; change30d: number | null; high90: number | null }
/** OP's shape + finish. TCGplayer rows are SYNTHESISED from px (source "tcgplayer", market US); store rows come from the of/ tuples (url = offerUrl(storeId, market, path), source = sourceOfStoreId(storeId), currency = the market's). eBay is NEVER an OfferRow (it is not in any published file). */
export interface OfferRow { finish: Finish; storeId: number; source: string; market: Country; priceCents: number; currency: string; url: string; inStock: boolean; condition: Condition | null; shippingCents: number | null; updatedAt: string }   // source: "tcgplayer" | "store:<key>" | "feed:<key>"; updatedAt = ss/runs.json refreshed-at of (store, market); shippingCents is always null for stores (kept for OP compatibility); the offer's own listing TITLE is not published (price-report flow: 2.9)
/** The card page's data. CardDetail extends CardLite so OP's flat field names (detail.name, detail.marketUsd, detail.set, detail.offers) keep working. Works for unlisted rows (a user can open the card page of any catalogue row). */
export interface CardDetail extends CardLite {
  tcgName: string; tn: string | null; fnum: string | null; link: number; rootId: number | null;
  set: SetLite; origin: ScrySetLite | null; oracle: OracleDetail | null; family: FamilyMember[];
  mask: number; units: UnitAgg[];                                       // units: [] when untracked; one per tracked finish
  offers: OfferRow[];                                                   // store/feed offers of both finishes + the synthesised TCGplayer rows (cap 200)
  pricesAt: string;                                                     // pointer.publishedAt of the ref this page was read at
}
export type SortKey = "value" | "price-asc" | "price-desc" | "newest" | "number" | "name" | "rising" | "falling" | "popular";   // "number" = collector order (nsort, id); "popular" = EDHREC rank, then market value (published columns only)
export interface CardQuery {
  q?: string;                                          // free text, parsed by parseSearch (<= 60 chars after folding); resolved to oracleNos / sc / number / treat / finish by the planner
  setIds?: number[];                                   // <= 8
  sc?: string;                                         // Scryfall set code (origin set), e.g. "pbro"
  oracleNo?: number; oracleNos?: number[]; rootId?: number;     // oracleNos <= 24
  rarities?: Rarity[]; types?: string[]; treats?: string[];     // ANY-of within each list; types are PRIMARY_TYPES keys
  colors?: { mask: number; mode: "any" | "exact" | "within" | "colorless" | "multi" };   // colour filters exclude unjoined rows (oracleNo null)
  identity?: { mask: number };                         // commander identity filter: oracle identity subset of mask
  keyword?: string; format?: { key: Format; playable: boolean };
  finish?: Finish;                                     // UNIT VIEW: only cards that have this finish priced, and every price, low, store count and change in the result is THAT finish's; omitted = the headline unit
  minCents?: number | null; maxCents?: number | null; // on marketUsd (MARKET only: a low-only unit matches no price range)
  tracked?: boolean; pricedIn?: Country;
  classes?: number[];                                  // default [0]; [0, 1, 2, 3, 4] only on opt-in pages
  includeUnlisted?: boolean; includeHidden?: boolean;  // default false: LISTED rows of non-hidden set kinds
  sort: SortKey; page: number; per: 24 | 48 | 100;
}
export interface CardPage { total: number; pages: number; page: number; items: CardLite[]; capped: boolean }
/** A structural subset of Catalog: resolveLocalItems(items, lookup) in watchlist-server.ts keeps its signature. */
export interface CardLookup { byId: Map<number, CardLite>; bySlug: Map<string, CardLite>; setById: Map<number, SetLite> }
export interface NameHit { oracleNo?: number; name: string; alt?: string; oracleSlug: string; topSlug: string; nPrint: number; topCents: number | null }
/** [oracleNo, name, oracleSlug, topSlug | 0, nPrint, topCents, alt | 0]. The typeahead table, hottest first (nm/0 = the top 8,000 oracles). */
export type NameIndexEntry = [no: number, name: string, oracleSlug: string, topSlug: string | 0, nPrint: number, topCents: number | null, alt: string | 0];
/** OP's shape; v4 files carry market only, so lowUsd is null and `lows` is absent. */
export interface HistoryPoint { day: string; marketUsd: number | null; lowUsd: number | null; lows?: (number | null)[] }
export interface IndexPoint { day: string; value: number; totalUsd: number; cardCount: number }
export interface CatalogStats { cards: number; tracked: number; units: number; oracles: number; sets: number; sealed: number; pricedByMarket: Record<Country, number>; pricesAt: string }

/** TRANSITION SHIM only (7.9): built from the browse index, 77 MB of heap when called; refuses to run in a production deployment; deleted at M3. */
export interface Catalog { cards: CardLite[]; sets: SetLite[]; setById: Map<number, SetLite>; setBySlug: Map<string, SetLite>; bySlug: Map<string, CardLite>; byId: Map<number, CardLite>; pricesAt: string; complete: true }
