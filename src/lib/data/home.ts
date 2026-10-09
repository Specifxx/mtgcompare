// owner: WP15
// src/lib/data/home.ts: the section "home.ts" of api.ts (contract 7.12). The home feed and the market views are PUBLISHED FILES (hm/home.json, mk/overview.json, mk/records.json) read through the PlaneSource of the request, pinned to one data commit;
// no database, no unstable_cache (kind P of contract 7.5). The names, arguments, result types, cache kinds and tags of api.ts are FROZEN: this module only adds exports (HomeCard, HomeBoard, getHomeBoard).
//
// What a home render costs: hm/home.json (8 KB) + meta/sets.json (the page needs it anyway). The tiles of the file carry no change figure, no printing label and, for the one free savings row per market, no set code or collector number, so
// three small hydrations stand in (getCardsByIds with stores:false, at most 8 ids = at most 8 bucket pairs, never the browse index); each disappears the day the publisher appends the field (REQ-WP15-1, REQ-WP15-2: trailing elements are additive inside v1).
import { CARD_FLAGS, finishFromIndex, type Finish } from "../constants";
import { MARKETS, marketFromIndex, type Country } from "../country";
import { getBrowseIndex, getCardsByIds, getSets } from "./catalog";
import type { HomeFile, HomeTileRow, MarketFile, RecordsFile } from "./plane/formats";
import { memoByRef, memoKey, optionalOf, planeSource } from "./plane/runtime";
import type { CardLite, SetLite } from "./types";

export interface HomeTile { id: number; slug: string; name: string; setCode: string; number: string | null; rarity: string; flags: number; headFinish: Finish; marketUsd: number | null }
export interface HomeFeed { at: string; stats: { cards: number; tracked: number; sets: number; sealed: number; oracles: number }; newest: SetLite[]; upcoming: SetLite[]; chase: HomeTile[]; popular: HomeTile[]; up: HomeTile[]; down: HomeTile[]; dealCounts: Record<Country, number>; dealsFree: Record<Country, (HomeTile & { buyCents: number; belowPct: number }) | null> }

/** A tile with what the cards on the page also show: the printing label ("Borderless", "Serialized"), its printing key and, for the movers columns, the 7-day change. All three are null/"standard" when neither the file nor the hydration knows them. */
export interface HomeCard extends HomeTile { variant: string | null; printing: string; change7d: number | null }
/** getHomeFeed's value with the richer tiles the page reads. HomeCard[] is a HomeTile[], so the frozen HomeFeed is a supertype. */
export interface HomeBoard extends HomeFeed { chase: HomeCard[]; popular: HomeCard[]; up: HomeCard[]; down: HomeCard[]; dealsFree: Record<Country, (HomeCard & { buyCents: number; belowPct: number }) | null> }

/** Trailing elements the publisher may append to a HomeTileRow (additive inside v1): [9] the 7-day change of the headline unit, [10] the printing label, [11] the printing key. */
type TileRowX = HomeTileRow | [...HomeTileRow, change7d?: number | null, label?: string | 0, printing?: string];
/** Trailing elements of a dealsFree row: [5] Scryfall set code, [6] collector number, [7] flags, [8] head finish (0 | 1). */
type DealRow = [id: number, slug: string, name: string, buyCents: number, belowPct: number, sc?: string | 0, number?: string | 0, flags?: number, headFinish?: 0 | 1];

const upper = (s: string | 0 | undefined): string => (s ? String(s).toUpperCase() : "");
/** A label the card shows when the file gives none: only what the flags alone can say. */
function flagLabel(flags: number): string | null {
  if (flags & CARD_FLAGS.SERIAL) return "Serialized";
  if (flags & CARD_FLAGS.ETCHED) return "Foil etched";
  return null;
}
function cardOfRow(r: TileRowX): HomeCard {
  const x = r as readonly unknown[], flags = r[6];
  const change = typeof x[9] === "number" ? (x[9] as number) : null, label = typeof x[10] === "string" && x[10] ? (x[10] as string) : null, printing = typeof x[11] === "string" && x[11] ? (x[11] as string) : "standard";
  return { id: r[0], slug: r[1], name: r[2], setCode: upper(r[3]), number: r[4] || null, rarity: r[5], flags, headFinish: finishFromIndex(r[7]), marketUsd: r[8], variant: label ?? flagLabel(flags), printing, change7d: change };
}
function cardOfLite(c: CardLite): HomeCard {
  return { id: c.id, slug: c.slug, name: c.name, setCode: c.setCode, number: c.number, rarity: c.rarity, flags: c.flags, headFinish: c.headFinish, marketUsd: c.marketUsd, variant: c.variant, printing: c.printing, change7d: c.change7d };
}
async function hydrate(ids: readonly number[]): Promise<Map<number, CardLite>> {
  if (!ids.length) return new Map();
  try { return await getCardsByIds(ids, { stores: false }); } catch { return new Map(); }   // the home page renders without the figures a failed read would have added
}

/** The tile of a free savings row: from the row's own trailing elements when the publisher writes them, else from the hydrated card, else none. */
function dealTile(r: DealRow, lite: Map<number, CardLite>): HomeCard | null {
  if (r[6] !== undefined) return { id: r[0], slug: r[1], name: r[2], setCode: upper(r[5]), number: r[6] || null, rarity: "", flags: r[7] ?? 0, headFinish: finishFromIndex(r[8] ?? 0), marketUsd: null, variant: null, printing: "standard", change7d: null };
  const l = lite.get(r[0]);
  return l ? cardOfLite(l) : null;
}

async function buildBoard(): Promise<HomeBoard> {
  const { src } = await planeSource();
  const [f, sets] = await Promise.all([src.json<HomeFile>("hm/home.json"), getSets()]);
  const byId = new Map(sets.map((s) => [s.id, s] as const)), pick = (ids: readonly number[]): SetLite[] => ids.flatMap((id) => { const s = byId.get(id); return s ? [s] : []; });
  const chase = f.chase.map((r) => cardOfRow(r)), popular = f.popular.map((r) => cardOfRow(r));
  // up and down: the change figure is the point of the column
  const up = f.up.map((r) => cardOfRow(r)), down = f.down.map((r) => cardOfRow(r));
  const lacking = [...up, ...down].filter((c) => c.change7d == null);
  if (lacking.length) { const lite = await hydrate(lacking.map((c) => c.id)); for (const c of lacking) { const l = lite.get(c.id); if (l) { c.change7d = l.change7d; if (!c.variant) c.variant = l.variant; c.printing = l.printing; } } }
  // the free savings row of each market: one row per market, a count beside it, never a list
  const rows = (f.dealsFree ?? []) as (DealRow | null)[], thin = rows.flatMap((r) => (r && r[6] === undefined ? [r[0]] : []));
  const lite = await hydrate([...new Set(thin)]);
  const dealsFree = {} as HomeBoard["dealsFree"], dealCounts = {} as Record<Country, number>;
  MARKETS.forEach((m, i) => {
    dealCounts[m] = f.dealCounts[i] ?? 0;
    const r = rows[i];
    if (!r) { dealsFree[m] = null; return; }
    const tile = dealTile(r, lite);
    dealsFree[m] = tile ? { ...tile, buyCents: r[3], belowPct: r[4] } : null;
  });
  return { at: f.at, stats: f.stats, newest: pick(f.newest), upcoming: pick(f.upcoming), chase, popular, up, down, dealCounts, dealsFree };
}

/** The richer value behind getHomeFeed, one per data commit in this instance. */
export async function getHomeBoard(): Promise<HomeBoard> {
  const { ptr } = await planeSource();
  return memoByRef("home/board", memoKey(ptr), buildBoard);
}
export function getHomeFeed(): Promise<HomeFeed> { return getHomeBoard(); }                                                          // P hm/home.json (8 KB) + meta/sets.json; free-safe by construction (one deal per market, counts)
/** The popular tiles: ranked by the published EDHREC column (Scryfall's edhrec_rank), then market value; never reordered by a Neon counter. The file holds 12. */
/** Basic lands are in every store's binder: they would fill a supply list on their own. */
const BASIC_LAND = /^(?:Snow-Covered )?(?:Plains|Island|Swamp|Mountain|Forest|Wastes)$/;
/** The home page's "Most stocked" tiles: the printings the most stores have in stock, counted on the headline finish and summed over the six markets
 *  (the browse index's per-market store counts, written by the store stage), dearest first on a tie. Basic lands are left out. One browse index read per
 *  instance and data ref (memoByRef); before the first store stage every count is 0 and the list is empty, so the page falls back to the popular tiles. */
export async function getMostStocked(n = 12): Promise<CardLite[]> {
  const c = await planeSource();
  const ids = await memoByRef("home:stocked", memoKey(c.ptr), async () => {
    const ix = await getBrowseIndex({ withOracle: false });
    return ix.mostStocked(48, (name) => BASIC_LAND.test(name));
  });
  if (!ids.length) return [];
  const byId = await getCardsByIds(ids.slice(0, Math.max(0, n)));
  return ids.slice(0, Math.max(0, n)).map((id) => byId.get(id)).filter((x): x is CardLite => x != null);
}

export async function getPopular(n = 12): Promise<HomeTile[]> { return (await getHomeBoard()).popular.slice(0, Math.max(0, n)); }   // P hm/home.json popular tiles (EDHREC rank, then market)

export interface MarketOverview { at: string; basket: { n: number; totalUsd: number; avg: number; median: number }; advancing: number; declining: number; constituents: { id: number; slug: string; name: string; cents: number }[]; sets: { setId: number; n: number; totalCents: number }[] }
export interface MarketRecords { gaps: { card: CardLite; finish: Finish; home: number; away: Country; awayCents: number; awayConverted: number; saving: number; pct: number }[]; highs: { card: CardLite; finish: Finish; cents: number; high90: number }[]; lows: { card: CardLite; finish: Finish; cents: number; high90: number; pctBelow: number }[] }

/** P mk/overview.json: replaces the whole-catalogue scan of /market. The basket is the listed singles at US$1 and up on their headline MARKET price; `constituents` are the dearest 200. */
export async function getMarketOverview(): Promise<MarketOverview> {
  const { src } = await planeSource(), f = await src.json<MarketFile>("mk/overview.json");
  return {
    at: f.at, basket: f.basket, advancing: f.adv, declining: f.dec,
    constituents: f.cons.map(([id, slug, name, cents]) => ({ id, slug, name, cents })),
    sets: f.sets.map(([setId, n, totalCents]) => ({ setId, n, totalCents })),
  };
}
/** P mk/records.json (stores only, never TCGplayer's own listing or an eBay ask) + the cards of its rows. A row is a unit (uid = id * 2 + finish); `home` is the cheapest STORE price at home in the home currency, which the file holds as converted + saving. */
export async function getMarketRecords(home: Country): Promise<MarketRecords> {
  const { src } = await planeSource(), f = await optionalOf<RecordsFile>(src, "mk/records.json");
  if (!f) return { gaps: [], highs: [], lows: [] };
  const gaps = f.gaps[home] ?? [], uids = [...gaps.map((g) => g[0]), ...f.highs.map((h) => h[0]), ...f.lows.map((l) => l[0])];
  const cards = new Map<number, CardLite>();
  for (const finish of ["N", "F"] as const) {
    const ids = [...new Set(uids.filter((u) => u % 2 === (finish === "N" ? 0 : 1)).map((u) => Math.floor(u / 2)))];
    if (ids.length) for (const [id, c] of await getCardsByIds(ids, { stores: false, unit: finish })) cards.set(id * 2 + (finish === "N" ? 0 : 1), c);
  }
  const fin = (uid: number): Finish => (uid % 2 === 1 ? "F" : "N");
  return {
    gaps: gaps.flatMap(([uid, , away, awayCents, converted, saving, pct]) => { const card = cards.get(uid); return card ? [{ card, finish: fin(uid), home: converted + saving, away: marketFromIndex(away), awayCents, awayConverted: converted, saving, pct }] : []; }),
    highs: f.highs.flatMap(([uid, cents, high90]) => { const card = cards.get(uid); return card ? [{ card, finish: fin(uid), cents, high90 }] : []; }),
    lows: f.lows.flatMap(([uid, cents, high90, pctBelow]) => { const card = cards.get(uid); return card ? [{ card, finish: fin(uid), cents, high90, pctBelow }] : []; }),
  };
}
