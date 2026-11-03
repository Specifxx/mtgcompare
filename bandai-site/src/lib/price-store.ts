// On-disk layout of the daily prices (written by scripts/import-all.ts, read
// by lib/data.ts):
//   data/public/prices/<setId>.json  every offer for the set's products
//   data/public/summary.json         per product: TCGplayer prices, changes,
//                                    in-stock source count and the cheapest
//                                    in-stock offer per market — enough for
//                                    every list page without the shards
import fs from "node:fs";
import path from "node:path";
import type { Market, Offer, PriceEntry, Product, TcgPrice } from "./site-types";
import { decodeOffer, encodeOffer, type OfferTuple } from "./offer-codec";

export const PRICES_DIR = path.join(process.cwd(), "data", "public", "prices");
export const SUMMARY_FILE = path.join(process.cwd(), "data", "public", "summary.json");

interface StoredEntry {
  t: Record<string, TcgPrice>;
  o: OfferTuple[];
  c7: number | null;
  c30: number | null;
}
export interface SummaryEntry {
  t: Record<string, TcgPrice>;
  c7: number | null;
  c30: number | null;
  /** distinct sources with an in-stock offer */
  n: number;
  /** distinct sources listing it at all (in stock or not) */
  l?: number;
  /** cheapest in-stock offer per market (and TCGplayer) */
  b: OfferTuple[];
  /** cheapest in-stock eBay listing per market (the card ad strips, lib/card-ads.ts) */
  e?: OfferTuple[];
}

export const decodeEntry = (e: StoredEntry): PriceEntry => ({
  tcg: e.t,
  offers: e.o.map(decodeOffer).filter((x): x is Offer => !!x),
  change7d: e.c7,
  change30d: e.c30,
});

export function summarize(e: PriceEntry): SummaryEntry {
  const best = new Map<string, Offer>();
  const ebay = new Map<string, Offer>();
  for (const o of e.offers) {
    if (!o.inStock) continue;
    const k = o.source === "tcgplayer" ? "tcg" : o.market;
    const cur = best.get(k);
    if (!cur || o.cents < cur.cents) best.set(k, o);
    if (o.source === "ebay" && !o.preorder && (!ebay.has(o.market) || o.cents < ebay.get(o.market)!.cents)) ebay.set(o.market, o);
  }
  const e8 = [...ebay.values()].map(encodeOffer).filter((x): x is OfferTuple => !!x);
  return {
    t: e.tcg,
    c7: e.change7d,
    c30: e.change30d,
    n: new Set(e.offers.filter((o) => o.inStock).map((o) => o.source)).size,
    l: new Set(e.offers.map((o) => o.source)).size,
    b: [...best.values()].map(encodeOffer).filter((x): x is OfferTuple => !!x),
    ...(e8.length ? { e: e8 } : {}),
  };
}

export function writePrices(byId: Record<string, PriceEntry>, products: Product[]) {
  fs.rmSync(PRICES_DIR, { recursive: true, force: true });
  fs.mkdirSync(PRICES_DIR, { recursive: true });
  const bySet = new Map<number, Record<string, StoredEntry>>();
  const summary: Record<string, SummaryEntry> = {};
  for (const p of products) {
    const e = byId[p.id];
    if (!e) continue;
    if (!bySet.has(p.setId)) bySet.set(p.setId, {});
    bySet.get(p.setId)![p.id] = {
      t: e.tcg,
      o: e.offers.map(encodeOffer).filter((x): x is OfferTuple => !!x),
      c7: e.change7d,
      c30: e.change30d,
    };
    summary[p.id] = summarize(e);
  }
  for (const [setId, entries] of bySet) fs.writeFileSync(path.join(PRICES_DIR, `${setId}.json`), JSON.stringify(entries) + "\n");
  fs.writeFileSync(SUMMARY_FILE, JSON.stringify(summary) + "\n");
}

export function readSetPrices(setId: number): Record<string, PriceEntry> {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(PRICES_DIR, `${setId}.json`), "utf8")) as Record<string, StoredEntry>;
    return Object.fromEntries(Object.entries(raw).map(([id, e]) => [id, decodeEntry(e)]));
  } catch {
    return {};
  }
}

export function readAllPrices(): Record<string, PriceEntry> {
  const out: Record<string, PriceEntry> = {};
  try {
    for (const f of fs.readdirSync(PRICES_DIR)) if (f.endsWith(".json")) Object.assign(out, readSetPrices(Number(f.replace(".json", ""))));
  } catch {}
  return out;
}

/** Rewrites summary.json from the committed shards (no import, no network):
 *  used when the summary gains a field, so pages get it before the next import. */
export function rebuildSummary(): number {
  const all = readAllPrices();
  const summary: Record<string, SummaryEntry> = {};
  for (const [id, e] of Object.entries(all)) summary[id] = summarize(e);
  fs.writeFileSync(SUMMARY_FILE, JSON.stringify(summary) + "\n");
  return Object.keys(summary).length;
}

export function readSummary(): Record<string, SummaryEntry> {
  try {
    return JSON.parse(fs.readFileSync(SUMMARY_FILE, "utf8"));
  } catch {
    return {};
  }
}

export type { Market };
