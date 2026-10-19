// Values for every market, computed on the server, picked in the browser.
//
// The card page is one CDN copy for every visitor and crawler (DECISIONS.md, "One card page for every market", 2026-10-19), rendered
// on DEFAULT_COUNTRY: it ships each market-dependent part for ALL six markets and a client island picks the visitor's after
// hydration (components/card/CardMarket.tsx). Markets that compute the same value share one entry, so a card with no listing
// anywhere ships one "no price" state, not six. Ported from OP Compare (src/lib/per-market.ts there). Pure and client-safe: no
// data, store or affiliate import.
import { DEFAULT_COUNTRY, MARKETS, type Country } from "./country";

/** One value per market, deduplicated. */
export interface PerMarket<T> {
  values: T[];
  /** Each market's index into `values`. */
  at: Record<Country, number>;
}

const keyOf = (v: unknown): string => JSON.stringify(v) ?? "undefined";

export function perMarket<T>(fn: (m: Country) => T): PerMarket<T> {
  const values: T[] = [];
  const seen = new Map<string, number>();
  const at = {} as Record<Country, number>;
  for (const m of MARKETS) {
    const v = fn(m);
    const k = keyOf(v);
    let i = seen.get(k);
    if (i == null) {
      i = values.length;
      values.push(v);
      seen.set(k, i);
    }
    at[m] = i;
  }
  return { values, at };
}

export function pickMarket<T>(pm: PerMarket<T>, m: Country): T {
  return pm.values[pm.at[m] ?? pm.at[DEFAULT_COUNTRY]];
}

/**
 * A list per market whose items mostly repeat across markets (the narrative's
 * paragraphs, the FAQ): every distinct item once, each market an ordered list
 * of indexes into the pool.
 */
export interface PerMarketList<T> {
  pool: T[];
  at: Record<Country, number[]>;
}

export function perMarketList<T>(fn: (m: Country) => T[]): PerMarketList<T> {
  const pool: T[] = [];
  const seen = new Map<string, number>();
  const at = {} as Record<Country, number[]>;
  for (const m of MARKETS) {
    at[m] = fn(m).map((v) => {
      const k = keyOf(v);
      let i = seen.get(k);
      if (i == null) {
        i = pool.length;
        pool.push(v);
        seen.set(k, i);
      }
      return i;
    });
  }
  return { pool, at };
}

export function pickMarketList<T>(pl: PerMarketList<T>, m: Country): T[] {
  return (pl.at[m] ?? pl.at[DEFAULT_COUNTRY]).map((i) => pl.pool[i]);
}
