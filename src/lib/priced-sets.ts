// NO SET PAGE WITHOUT PRICES (owner, 2026-11-26). A set's pre-order page, and every link to it (the menus, the home pill and
// banner, the release calendar, the set and product pages, the sitemap), exists in a market only once at least one STORE there
// lists the set with a price. A set discovered from Scryfall the day it is announced therefore stays off the site until the first
// store opens pre-orders, and goes live with that store's price on the next release (the evening sealed import), never as an
// empty page. TCGplayer is a marketplace, not a store, and does not count.
//
// data/sets/priced.json (set code → the markets a store prices it in) is written by scripts/export-public-data.ts from the same
// listed products and offers as data/public/, and rides the same data commit, so it always describes the snapshot being served.
import priced from "../../data/sets/priced.json";

export type PricedSets = Record<string, string[]>;

/** The table the site reads (a copy, so a test can add a made-up set). */
export const PRICED_SETS: PricedSets = { ...(priced as PricedSets) };

/** Set codes each market's stores price, from the listed products and offers (pure: the export calls it). */
export function buildPricedSets(
  products: readonly { id: string; setCode: string | null }[],
  offers: readonly { productId: string; store: string; market: string; priceCents: number | null }[],
  isStore: (storeKey: string) => boolean,
): PricedSets {
  const setOf = new Map(products.map((p) => [p.id, p.setCode]));
  const out = new Map<string, Set<string>>();
  for (const o of offers) {
    const code = setOf.get(o.productId);
    if (!code || !o.priceCents || o.priceCents <= 0 || !isStore(o.store)) continue;
    let m = out.get(code);
    if (!m) out.set(code, (m = new Set()));
    m.add(o.market);
  }
  return Object.fromEntries([...out.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([code, m]) => [code, [...m].sort()]));
}

/** A store prices this set in `where` (a region or a market; any market when left out). */
export function setPricedIn(setCode: string, where?: string | null, table: PricedSets = PRICED_SETS): boolean {
  const markets = table[setCode];
  if (!markets?.length) return false;
  return where ? markets.includes(where.toUpperCase()) : true;
}

/** One set per line, so an import changes only the lines of the sets it moved (git stores a small delta). */
export function serializePricedSets(table: PricedSets): string {
  const rows = Object.entries(table).map(([code, m]) => `  ${JSON.stringify(code)}: ${JSON.stringify(m)}`);
  return rows.length ? `{\n${rows.join(",\n")}\n}\n` : "{}\n";
}
