// Store data health: which scrapers broke quietly. PURE — no db, no Next — so
// /admin/store-health, scripts/store-health.ts (the import workflow's report
// step) and tests/store-health.test.ts all run the same rules.
//
// Input is each store's OWN recent appearances in ImportRun.summary.stores
// (newest first, ≤ 14), never "the last N runs": a partial run
// (IMPORT_ONLY_STORES / IMPORT_ONLY_COUNTRY) or a catalogue-only run simply
// contributes nothing for the stores it did not read. Every threshold below is
// exported and pinned by a test.
import { STALE_HOURS } from "./constants";
import { platformOf, type StoreInfo, type StorePlatform } from "./stores";

export interface StoreAppearance {
  runId: number;
  at: Date;
  products: number;
  cards: number;
  sealed: number;
  inStock: number;
  failed: boolean;
  skipped?: string;
  /** The reader's own words for a failed or empty read ("HTTP 503", "no price in GBP"). */
  note?: string;
  misses?: Record<string, number>;
}

export interface OfferStat {
  listings: number;
  inStock: number;
  newest: Date | null;
}

export type HealthAlertKind = "no-listings" | "stale" | "failing" | "last-read-failed" | "listings-dropped" | "match-rate-drop" | "implausible-prices" | "empty-read" | "currency-skip" | "not-admitted";

export interface StoreHealth {
  key: string;
  name: string;
  country: string;
  base: string;
  platform: StorePlatform;
  latest: StoreAppearance | null;
  offers: OfferStat;
  medianListings: number | null;
  matchRate: number | null;
  baselineMatchRate: number | null;
  alerts: { kind: HealthAlertKind; text: string }[];
}

/** Appearances kept per store. */
export const MAX_APPEARANCES = 14;
/** Hours after which a store's newest Offer row raises `stale`, well before… */
export const STALE_ALERT_HOURS = 30;
/** …the import drops it from the lows (the one constant of constants.ts that aggregate() uses). */
export { STALE_HOURS };
/**
 * Consecutive failed appearances that raise `failing`. A single failed latest
 * read raises the milder `last-read-failed` instead, so a store the /admin
 * home counts as "failed" is always listed under "Needs a look".
 */
export const FAILING_STREAK = 2;
/** Trend alerts need at least this many appearances (the latest + 2 earlier). */
export const MIN_TREND_APPEARANCES = 3;
/** `listings-dropped`: latest listings below this share of the earlier median. */
export const LISTINGS_DROP_RATIO = 0.7;
/** `match-rate-drop`: latest match rate below this share of the earlier median… */
export const MATCH_RATE_DROP_RATIO = 0.6;
/** …and only for stores that returned at least this many products. */
export const MIN_PRODUCTS_FOR_RATE = 20;
/** `implausible-prices`: share of the latest products refused as implausible. */
export const IMPLAUSIBLE_SHARE = 0.1;

const HOUR = 3600 * 1000;
const EMPTY_OFFERS: OfferStat = { listings: 0, inStock: 0, newest: null };

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

const listingsOf = (a: StoreAppearance) => a.cards + a.sealed;
const rateOf = (a: StoreAppearance) => (a.products > 0 ? listingsOf(a) / a.products : null);
const pctText = (x: number) => `${Math.round(x * 100)}%`;

/** The alerts for ONE store. `history` is newest first. */
export function storeAlerts(history: StoreAppearance[], offers: OfferStat, now = new Date()): { kind: HealthAlertKind; text: string }[] {
  const alerts: { kind: HealthAlertKind; text: string }[] = [];
  const latest = history[0] ?? null;

  // Not seen in any recent run: unknown, and only `stale` can fire.
  if (latest) {
    if (offers.listings === 0 && !latest.skipped) alerts.push({ kind: "no-listings", text: "No listings stored for this store" });
  }
  if (offers.newest && now.getTime() - offers.newest.getTime() > STALE_ALERT_HOURS * HOUR) {
    const h = Math.round((now.getTime() - offers.newest.getTime()) / HOUR);
    alerts.push({ kind: "stale", text: `Newest listing is ${h}h old; it drops out of the lows at ${STALE_HOURS}h` });
  }
  if (!latest) return alerts;

  const streak = history.slice(0, FAILING_STREAK);
  if (streak.length === FAILING_STREAK && streak.every((a) => a.failed)) {
    let n = 0;
    while (n < history.length && history[n]!.failed) n++;
    alerts.push({ kind: "failing", text: `Failed the last ${n} reads in a row${latest.note ? ` (${latest.note})` : ""}` });
  } else if (latest.failed) {
    alerts.push({ kind: "last-read-failed", text: `The latest read failed${latest.note ? ` (${latest.note})` : ""} (once; a second failure in a row raises “failing”)` });
  }
  // An unverified store that did not pass admission (10.26: at least 20 matched in-stock listings) is not broken, it is not published yet.
  if (latest.skipped) alerts.push({ kind: /^not admitted/.test(latest.skipped) ? "not-admitted" : "currency-skip", text: `Skipped: ${latest.skipped}` });
  if (latest.products === 0 && !latest.failed && !latest.skipped) {
    alerts.push({ kind: "empty-read", text: `Read 0 products without an error (robots.txt now blocks it, or its collections/feed are gone)${latest.note ? `: ${latest.note}` : ""}` });
  }
  const implausible = latest.misses?.["implausible-price"] ?? 0;
  if (latest.products > 0 && implausible / latest.products > IMPLAUSIBLE_SHARE) {
    alerts.push({ kind: "implausible-prices", text: `${implausible} of ${latest.products} products refused as implausible prices (${pctText(implausible / latest.products)})` });
  }

  // Trends: only over a clean latest read, against the store's own earlier reads.
  if (history.length >= MIN_TREND_APPEARANCES && !latest.failed && !latest.skipped) {
    const earlier = history.slice(1).filter((a) => !a.failed && !a.skipped);
    const base = median(earlier.map(listingsOf));
    if (base != null && base > 0 && earlier.length >= MIN_TREND_APPEARANCES - 1 && listingsOf(latest) < LISTINGS_DROP_RATIO * base) {
      alerts.push({ kind: "listings-dropped", text: `Listings fell to ${listingsOf(latest)} from a median of ${Math.round(base)}` });
    }
    const rate = rateOf(latest);
    const baseRate = median(earlier.map(rateOf).filter((r): r is number => r != null));
    if (latest.products >= MIN_PRODUCTS_FOR_RATE && rate != null && baseRate != null && baseRate > 0 && earlier.length >= MIN_TREND_APPEARANCES - 1 && rate < MATCH_RATE_DROP_RATIO * baseRate) {
      alerts.push({ kind: "match-rate-drop", text: `Match rate fell to ${pctText(rate)} from a median of ${pctText(baseRate)} (a title-format change?)` });
    }
  }
  return alerts;
}

export function computeStoreHealth(stores: readonly StoreInfo[], history: Map<string, StoreAppearance[]>, offers: Map<string, OfferStat>, now = new Date()): StoreHealth[] {
  return stores.map((s) => {
    const h = (history.get(s.key) ?? []).slice(0, MAX_APPEARANCES);
    const o = offers.get(s.key) ?? EMPTY_OFFERS;
    const latest = h[0] ?? null;
    const clean = h.filter((a) => !a.failed && !a.skipped);
    return {
      key: s.key,
      name: s.name,
      country: s.country,
      base: s.base,
      platform: platformOf(s),
      latest,
      offers: o,
      medianListings: median(clean.map(listingsOf)),
      matchRate: latest ? rateOf(latest) : null,
      baselineMatchRate: median(clean.slice(latest && clean[0] === latest ? 1 : 0).map(rateOf).filter((r): r is number => r != null)),
      alerts: storeAlerts(h, o, now),
    };
  });
}

/** Alerts that are worth a look but not yet a broken scraper (amber, not red). */
export const MILD_ALERTS: readonly HealthAlertKind[] = ["last-read-failed", "not-admitted"];
export const isMildAlert = (k: HealthAlertKind) => MILD_ALERTS.includes(k);

/** Group flat per-store rows (newest first) into each store's appearances, ≤ MAX_APPEARANCES. */
export function groupAppearances(rows: (StoreAppearance & { key: string })[]): Map<string, StoreAppearance[]> {
  const out = new Map<string, StoreAppearance[]>();
  for (const { key, ...a } of rows) {
    const list = out.get(key) ?? [];
    if (list.length < MAX_APPEARANCES) list.push(a);
    out.set(key, list);
  }
  return out;
}
