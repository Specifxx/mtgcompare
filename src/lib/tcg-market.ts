// TCGplayer's market price history: the dashed gold line of the price history chart (owner, 2026-11-19: "I really really like
// opcompare's price history where you have the tcgplayer market price as well as the cheapest price locally").
//
// WHERE IT COMES FROM. The TCGplayer read the import already makes (lib/tcgplayer.ts, one catalogue search, no extra request)
// carries each product's `marketPrice` (TCGplayer's recent-sales price, US$). The importer writes today's map, with the day's
// exchange rates, to data/public/tcg-market.json (writeTcgMarket); scripts/export-public-data.ts folds it into
// data/public/tcg-history.json, ONE series per product slug in US cents, change-points in the same format and with the same
// fold as the cheapest-price history (updatePriceHistory, market key "US"). A product is joined to TCGplayer only by the
// TCGplayer product id in its own TCGplayer offer's URL, never by a title.
//
// WHAT THE SITE MAY DO WITH IT. Draw it on the price history chart, converted at the file's rate into the region's currency and
// labelled "TCGplayer market (converted)" outside the US. It is never a price row, a best price, a deal, a sort, an alert or
// structured data: a converted price is not a price anyone can pay here.
import fs from "node:fs";
import path from "node:path";
import { publicDataDir } from "./public-data/format";
import { isPriceHistory, type PriceHistory, type TodayRow } from "./price-history";

export const TCG_MARKET_FILE = "tcg-market.json";
export const TCG_HISTORY_FILE = "tcg-history.json";
/** The one series key the TCGplayer history uses. */
export const TCG_SERIES = "US";
/** A market file older than this is not folded in: the line shows a gap rather than repeat a stale price. */
export const MAX_AGE_DAYS = 3;

export interface TcgMarketFile {
  /** The day the catalogue was read (UTC days since 1970). */
  day: number;
  /** 1 US$ = x of each currency, from the same day. */
  fx: Record<string, number>;
  /** TCGplayer product id → market price in US cents. */
  prices: Record<string, number>;
}

/** The TCGplayer product id in a tcgplayer.com/product/<id>/… URL, or null. */
export function tcgIdOfUrl(url: string | null | undefined): string | null {
  const m = /tcgplayer\.com\/product\/(\d+)/i.exec(url ?? "");
  return m ? m[1] : null;
}

/** Today's rows for the TCGplayer history: one per product whose TCGplayer offer carries an id with a market price. */
export function tcgRows(products: readonly { id: string; slug: string }[], offers: readonly { productId: string; store: string; url: string }[], file: TcgMarketFile | null, today: number): TodayRow[] {
  if (!file || today - file.day > MAX_AGE_DAYS) return [];
  const idOf = new Map<string, string>();
  for (const o of offers) {
    if (o.store !== "tcgplayer") continue;
    const id = tcgIdOfUrl(o.url);
    if (id && !idOf.has(o.productId)) idOf.set(o.productId, id);
  }
  const out: TodayRow[] = [];
  for (const p of products) {
    const id = idOf.get(p.id);
    const cents = id ? file.prices[id] : undefined;
    if (cents && cents > 0) out.push({ market: TCG_SERIES, slug: p.slug, cents, stores: 1 });
  }
  return out;
}

/** US cents → the currency's cents at `fx` (1 US$ = fx[currency]); null when the rate is unknown. */
export function convertUsd(cents: number | null, currency: string, fx: Record<string, number> | undefined): number | null {
  if (cents == null) return null;
  if (currency === "USD") return cents;
  const r = fx?.[currency];
  return r && r > 0 ? Math.round(cents * r) : null;
}

// ─── Files (scripts and server only) ──────────────────────────────────────────

async function fetchFx(prev: Record<string, number>): Promise<Record<string, number>> {
  try {
    const res = await fetch("https://api.frankfurter.dev/v1/latest?base=USD&symbols=AUD,CAD,EUR,GBP,NZD,SGD,JPY", { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = (await res.json()) as { rates?: Record<string, number> };
    if (!j.rates || !Object.keys(j.rates).length) throw new Error("no rates");
    return { USD: 1, ...j.rates };
  } catch (e) {
    console.warn(`  tcg-market: exchange rates not read (${(e as Error).message}); keeping the last ones`);
    return prev;
  }
}

/** Write today's TCGplayer market prices (the importer, after its TCGplayer read). Never throws: a failure only loses the day. */
export async function writeTcgMarket(products: readonly { productId: number; marketPrice?: number | null }[], dir = publicDataDir()): Promise<void> {
  try {
    const prices: Record<string, number> = {};
    for (const p of products) if (p.productId && p.marketPrice && p.marketPrice > 0) prices[String(p.productId)] = Math.round(p.marketPrice * 100);
    if (!Object.keys(prices).length) return;
    const prev = readTcgMarket(dir);
    const file: TcgMarketFile = { day: Math.floor(Date.now() / 86_400_000), fx: await fetchFx(prev?.fx ?? { USD: 1 }), prices };
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, TCG_MARKET_FILE), `${JSON.stringify(file)}\n`);
    console.log(`  tcg-market: ${Object.keys(prices).length} market prices written`);
  } catch (e) {
    console.warn(`  tcg-market: not written (${(e as Error).message})`);
  }
}

export function readTcgMarket(dir = publicDataDir()): TcgMarketFile | null {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(dir, TCG_MARKET_FILE), "utf8")) as TcgMarketFile;
    return Number.isInteger(j?.day) && j.prices && typeof j.prices === "object" ? j : null;
  } catch {
    return null;
  }
}

let cached: { mtimeMs: number; h: PriceHistory | null } | null = null;

/** data/public/tcg-history.json, parsed once per deployment; null when absent or unreadable. */
export function readTcgHistory(dir = publicDataDir()): PriceHistory | null {
  const file = path.join(dir, TCG_HISTORY_FILE);
  try {
    const { mtimeMs } = fs.statSync(file);
    if (cached && cached.mtimeMs === mtimeMs) return cached.h;
    const json = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    cached = { mtimeMs, h: isPriceHistory(json) ? json : null };
    return cached.h;
  } catch {
    return null;
  }
}
