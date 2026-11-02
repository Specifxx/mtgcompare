// Word of mouth (owner, 2026-11-02): shared links and the share message. Pure, so the button, the quick view, the
// share image and the tests agree. Every shared link carries utm_source=share&utm_medium=<what>; the button sends a
// Vercel "share" event, ShareArrival one "share_visit" when a shared link brings someone, and RiftCompare's weekly
// growth report counts both for every site. DECISIONS.md, "Share buttons".
import { SITE_NAME } from "./site";

export type ShareMedium = "product" | "set" | "list" | "page";

/** `path` (its own query string kept) on `origin`, with the share tags. */
export function shareUrl(origin: string, path: string, medium: ShareMedium): string {
  const u = new URL(path, origin);
  u.searchParams.set("utm_source", "share");
  u.searchParams.set("utm_medium", medium);
  return u.toString();
}

export interface GapRow {
  priceCents: number;
  storeName: string;
}

export interface PriceGap {
  low: GapRow;
  high: GapRow;
  pct: number;
  sellers: number;
}

/** One region's real spread: cheapest and dearest in-stock price from two different stores, in its own currency. */
export function priceGap(rows: readonly GapRow[]): PriceGap | null {
  const live = rows.filter((r) => r.priceCents > 0).slice().sort((a, b) => a.priceCents - b.priceCents);
  if (live.length < 2) return null;
  const low = live[0];
  const high = live[live.length - 1];
  const sellers = new Set(live.map((r) => r.storeName)).size;
  if (sellers < 2 || high.priceCents <= low.priceCents) return null;
  return { low, high, pct: Math.round(((high.priceCents - low.priceCents) / high.priceCents) * 100), sellers };
}

export function shareText(name: string, gap: PriceGap | null, fmt: (cents: number) => string): string {
  if (!gap) return `${name}: every store's price on ${SITE_NAME}`;
  return `${name}: ${fmt(gap.low.priceCents)} at ${gap.low.storeName}, up to ${fmt(gap.high.priceCents)} elsewhere (${gap.pct}% less). Compared on ${SITE_NAME}`;
}
