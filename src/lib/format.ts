import { regionOfMarket } from "./regions";

/** "A$54.95", "£39.99", "€44.90" — always the market's own currency. */
export function money(cents: number | null | undefined, market: string): string {
  if (cents == null) return "—";
  const r = regionOfMarket(market);
  const currency = r?.currency ?? "USD";
  const locale = r?.locale ?? "en-US";
  const whole = cents % 100 === 0 && cents >= 10000;
  const s = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
  // Disambiguate dollars: "$" alone reads as USD everywhere.
  const prefix: Record<string, string> = { AUD: "A", NZD: "NZ", CAD: "C", SGD: "S" };
  return prefix[currency] && s.startsWith("$") ? `${prefix[currency]}${s}` : s;
}

export function timeAgo(date: Date | string | null | undefined, now: number = Date.now()): string {
  if (!date) return "never";
  const ms = now - (date instanceof Date ? date.getTime() : Date.parse(date));
  const m = Math.round(ms / 60000);
  if (m < 2) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en")} ${n === 1 ? one : many}`;
}

/**
 * How far a price sits from a reference, in whole percent: negative below it.
 * pctOf(4100, 5000) = -18. Null when there is no reference.
 */
export function pctOf(cents: number, reference: number | null | undefined): number | null {
  if (!reference || reference <= 0) return null;
  return Math.round(((cents - reference) / reference) * 100);
}

/** "in 12 days", "tomorrow", "today", "3 days ago" — for a YYYY-MM-DD date. */
export function relativeDay(iso: string, today = new Date().toISOString().slice(0, 10)): string {
  const d = Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400_000);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  return d > 0 ? `in ${plural(d, "day")}` : `${plural(-d, "day")} ago`;
}

/**
 * "18% below the median of 6 stores" — only when it is a real signal: at least
 * three independent stores in stock and the best price at least 10% under
 * their median. Never "above": a high best price is not a badge. Null otherwise.
 * ProductStat.lowestPriceCents may be TCGplayer's (US) while the median is the
 * stores' — a fact about now either way, never history.
 */
export function medianSaving(lowestCents: number | null | undefined, medianCents: number | null | undefined, inStockStores: number): string | null {
  if (!lowestCents || !medianCents || inStockStores < 3) return null;
  // The 10% bar is on the exact ratio; only the printed figure is rounded, so
  // 9.6% under never reads as "10% below".
  if (lowestCents > medianCents * 0.9) return null;
  const pct = pctOf(lowestCents, medianCents);
  if (pct == null) return null;
  return `${-pct}% below the median of ${plural(inStockStores, "store")}`;
}
