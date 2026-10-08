// owner: WP02
// src/lib/data/core.ts: the section "core.ts" of api.ts (contract 7.12). The tags and TTLs, the one way a request becomes a CardQuery (canonicalQuery), the one freshness rule for an offer, the pointer of the data being served and the health of the reader.
// The names, arguments, result types, cache kinds and tags are FROZEN: change the BODY only, add exports, never rename (requests/ protocol, 9.4).
import { FORMATS, PRIMARY_TYPES, RARITY_KEYS, STALE_HOURS, TREATMENT_BY_KEY, fold, isRarity, type Finish, type Format } from "../constants";
import { isCountry } from "../country";
import type { CardQuery, SortKey } from "./types";
import type { PointerFile } from "./plane/formats";
import * as runtime from "./plane/runtime";
import type { PlaneHealth } from "./plane/runtime";
import type { StatusFile } from "./plane/status";

export const DECKS_TAG: "published-decks" = "published-decks";
export const RISING_SNAPSHOTS_TAG: "rising-snapshots" = "rising-snapshots";
export const EBAY_BANNER_TAG: "ebay-banner" = "ebay-banner";
export const RANK_TAG: "rank" = "rank";
/** The tags `POST /api/revalidate` purges (it replaces PRICES_TAG): only Neon-backed caches and the rankings. Plane data needs no purge (pinned URLs). */
export const NEON_TAGS: readonly ["published-decks", "rising-snapshots", "ebay-banner", "rank"] = [DECKS_TAG, RISING_SNAPSHOTS_TAG, EBAY_BANNER_TAG, RANK_TAG];
export const TTL: { readonly day: 86400; readonly week: 604800; readonly hours6: 21600; readonly live: 30 } = { day: 86400, week: 604800, hours6: 21600, live: 30 };
/** STALE_HOURS (72, import.ts) in milliseconds: an offer is live when it is in stock AND the run of its (store, market) in ss/runs.json is newer than this. */
export const STALE_MS: number = STALE_HOURS * 3_600_000;
export const MAX_PAGE: 100 = 100;
export const PAGE_SIZES: readonly [24, 48, 100] = [24, 48, 100];
const SORTS: readonly SortKey[] = ["value", "price-asc", "price-desc", "newest", "number", "name", "rising", "falling", "popular"];
const MODES = ["any", "exact", "within", "colorless", "multi"] as const;
const uniqSorted = <T extends string | number>(xs: readonly T[] | undefined, keep: (x: T) => boolean, max: number): T[] | undefined => {
  const out = [...new Set((xs ?? []).filter(keep))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return out.length ? out.slice(0, max) : undefined;
};
const posInt = (n: unknown): number | undefined => (typeof n === "number" && Number.isInteger(n) && n > 0 ? n : undefined);
const cents = (n: unknown): number | undefined => (typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined);
/** Sorts arrays, folds q (<= 60 chars), clamps per to PAGE_SIZES and page to 1..MAX_PAGE, drops defaults, empties and unknown values. The only way a request becomes a CardQuery. Keys are written in a fixed order, so JSON.stringify of the result is a stable cache key. */
export function canonicalQuery(q: Partial<CardQuery>): CardQuery {
  const per = q.per == null ? NaN : Number(q.per);                                            // absent (or null) is the default size, not "the smallest"
  const out: CardQuery = {
    sort: SORTS.includes(q.sort as SortKey) ? (q.sort as SortKey) : "value",
    page: Math.min(MAX_PAGE, Math.max(1, Math.floor(Number(q.page)) || 1)),
    per: PAGE_SIZES.find((p) => p >= per) ?? (Number.isFinite(per) ? 100 : 48),
  };
  const text = fold(q.q).slice(0, 60).trim(); if (text) out.q = text;
  const setIds = uniqSorted(q.setIds, (x) => posInt(x) !== undefined, 8); if (setIds) out.setIds = setIds;
  const sc = typeof q.sc === "string" ? q.sc.trim().toLowerCase() : ""; if (/^[a-z0-9][a-z0-9_-]{0,11}$/.test(sc)) out.sc = sc;
  const oracleNo = posInt(q.oracleNo); if (oracleNo) out.oracleNo = oracleNo;
  const oracleNos = uniqSorted(q.oracleNos, (x) => posInt(x) !== undefined, 24); if (oracleNos) out.oracleNos = oracleNos;
  const rootId = posInt(q.rootId); if (rootId) out.rootId = rootId;
  const rarities = uniqSorted(q.rarities, (x) => isRarity(x), RARITY_KEYS.length); if (rarities) out.rarities = rarities;
  const types = uniqSorted(q.types, (x) => (PRIMARY_TYPES as readonly string[]).includes(x), PRIMARY_TYPES.length); if (types) out.types = types;
  const treats = uniqSorted(q.treats, (x) => x in TREATMENT_BY_KEY, 24); if (treats) out.treats = treats;
  // an "any of these colours" filter with no colour chosen is no filter (the checkboxes are all off); "colorless" is its own mode
  if (q.colors && MODES.includes(q.colors.mode) && Number.isInteger(q.colors.mask) && q.colors.mask >= 0 && q.colors.mask <= 31 && !(q.colors.mode === "any" && q.colors.mask === 0)) out.colors = { mask: q.colors.mode === "colorless" ? 0 : q.colors.mask, mode: q.colors.mode };
  if (q.identity && Number.isInteger(q.identity.mask) && q.identity.mask >= 0 && q.identity.mask <= 31) out.identity = { mask: q.identity.mask };
  const keyword = typeof q.keyword === "string" ? q.keyword.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 40) : ""; if (keyword) out.keyword = keyword;
  if (q.format && (FORMATS as readonly string[]).includes(q.format.key)) out.format = { key: q.format.key as Format, playable: q.format.playable !== false };
  if (q.finish === "N" || q.finish === "F") out.finish = q.finish as Finish;
  let min = cents(q.minCents), max = cents(q.maxCents); if (min !== undefined && max !== undefined && min > max) [min, max] = [max, min];
  if (min !== undefined && min > 0) out.minCents = min; if (max !== undefined) out.maxCents = max;
  if (q.tracked === true) out.tracked = true;
  if (q.pricedIn && isCountry(q.pricedIn)) out.pricedIn = q.pricedIn;
  const classes = uniqSorted(q.classes, (x) => Number.isInteger(x) && x >= 0 && x <= 4, 5); if (classes && !(classes.length === 1 && classes[0] === 0)) out.classes = classes;
  if (q.includeUnlisted === true) out.includeUnlisted = true; if (q.includeHidden === true) out.includeHidden = true;
  return out;
}
/** The one freshness rule for a published offer: in stock AND refreshed within STALE_MS (72 h). Pure; `refreshedAt` is the run time of the offer's (store, market) in ss/runs.json. An unparseable time is stale. */
export function offerLive(inStock: boolean, refreshedAt: Date | string | number, now: number = Date.now()): boolean {
  const t = typeof refreshedAt === "number" ? refreshedAt : refreshedAt instanceof Date ? refreshedAt.getTime() : Date.parse(refreshedAt);
  return inStock && Number.isFinite(t) && now - t < STALE_MS;
}
/** The UTF-8 size of a value as JSON: what a FILE_BUDGETS row and the entry-size tests measure (CardLite is about 700 B). */
export function jsonBytes(v: unknown): number { const s = JSON.stringify(v); return s === undefined ? 0 : new TextEncoder().encode(s).length; }
/** The pointer of the data the site is serving (memo 20 s, single flight, never backwards, pinned for the length of a request); null only on a cold instance that cannot reach the host. P-free: the pointer fetch is no-store behind the memo. */
export function getDataRef(): Promise<PointerFile | null> { return runtime.getDataRef(); }
export function planeHealth(): PlaneHealth { return runtime.planeHealth(); }                                                       // GET /api/data-status; reads memory only
export function getPlaneStatus(): Promise<StatusFile | null> { return runtime.planeJson<StatusFile>("status.json", { optional: true }); }   // P (status.json at the pointed sha): the admin panel (publicationStatusOf) and the freshness alarms
