// owner: WP02
// src/lib/data/core.ts: C0 STUB (contract 9.3 step 2), the section "core.ts" of api.ts. Every function below throws until WP02 implements it;
// the names, arguments, result types, cache kinds and tags are FROZEN (contract 7.12): change the BODY only, add exports, never rename (requests/ protocol, 9.4).
import { STALE_HOURS } from "../constants";
import type { CardQuery } from "./types";
import type { PointerFile } from "./plane/formats";
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
/** Sorts arrays, folds q (<= 60 chars), clamps per to PAGE_SIZES and page to 1..MAX_PAGE, drops defaults, empties and unknown values. The only way a request becomes a CardQuery. */
export function canonicalQuery(q: Partial<CardQuery>): CardQuery { throw new Error("not implemented: WP02"); }
export function offerLive(inStock: boolean, refreshedAt: Date | string | number, now?: number): boolean { throw new Error("not implemented: WP02"); }
export function jsonBytes(v: unknown): number { throw new Error("not implemented: WP02"); }
/** The pointer of the data the site is serving (memo 20 s, single flight, never backwards); null only on a cold instance that cannot reach the host. P-free: the pointer fetch is no-store behind the memo. */
export function getDataRef(): Promise<PointerFile | null> { throw new Error("not implemented: WP02"); }
export function planeHealth(): PlaneHealth { throw new Error("not implemented: WP02"); }                                                       // GET /api/data-status; reads memory only
export function getPlaneStatus(): Promise<StatusFile | null> { throw new Error("not implemented: WP02"); }                                  // P (status.json at the pointed sha): the admin panel (publicationStatusOf) and the freshness alarms
