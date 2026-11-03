// Word of mouth (owner, 2026-11-02: "word of mouth to be a big driver"): the
// share button, the shared-list page and the share image all use these. Pure,
// so the client button, the server image and the tests agree.
//
// Every shared link carries utm_source=share and utm_medium=<what was shared>,
// so a visit it brings is counted: ShareArrival sends one Vercel "share_visit"
// event, the button one "share" event, and RiftCompare's growth report reads
// both per site from the Web Analytics API. No reward, no pop-up, no account.
import { SITE } from "@/site.config";
import type { Market, Offer } from "./site-types";

export type ShareMedium = "card" | "sealed" | "list" | "page" | "daily";

/** `path` on the canonical host with the share tags (an existing query string is kept). */
export function shareUrl(base: string, path: string, medium: ShareMedium): string {
  const u = new URL(path, base);
  u.searchParams.set("utm_source", "share");
  u.searchParams.set("utm_medium", medium);
  return u.toString();
}

const NAMES: Record<string, string> = { tcgplayer: "TCGplayer", amazon: "Amazon", ...Object.fromEntries(SITE.stores.map((s) => [s.key, s.name])) };
export const storeName = (o: Pick<Offer, "source" | "market">) => (o.source === "ebay" ? (o.market === "US" ? "eBay" : `eBay ${o.market}`) : NAMES[o.source] ?? o.source);

export interface PriceGap {
  low: Offer;
  high: Offer;
  /** How much less the cheapest is than the dearest, whole percent. */
  pct: number;
  sellers: number;
}

/**
 * The real spread one market shows today: its cheapest and dearest in-stock
 * item price in its own currency, from two different sellers. Null when there
 * is no spread to show (fewer than two sellers, or the same price everywhere).
 * Never converted, never a reference row from another market.
 */
export function priceGap(offers: readonly Offer[], market: Market): PriceGap | null {
  const local = offers.filter((o) => o.market === market && o.inStock && o.cents > 0);
  if (!local.length) return null;
  const currency = local.slice().sort((a, b) => a.cents - b.cents)[0].currency;
  const same = local.filter((o) => o.currency === currency).sort((a, b) => a.cents - b.cents);
  const low = same[0];
  const high = same[same.length - 1];
  const sellers = new Set(same.map((o) => o.source)).size;
  if (sellers < 2 || high.cents <= low.cents) return null;
  return { low, high, pct: Math.round(((high.cents - low.cents) / high.cents) * 100), sellers };
}

/** The message the phone's share sheet sends with the link. */
export function shareText(name: string, gap: PriceGap | null, money: (cents: number, currency: string) => string): string {
  if (!gap) return `${name}: every store's price on ${SITE.name}`;
  return `${name}: ${money(gap.low.cents, gap.low.currency)} at ${storeName(gap.low)}, up to ${money(gap.high.cents, gap.high.currency)} elsewhere (${gap.pct}% less). Compared on ${SITE.name}`;
}

// A shared list (/list?i=…): product ids and quantities in the URL, no account
// and nothing stored. "123*4.456" = four of 123 and one of 456.
export const LIST_MAX = 100;

export function encodeList(items: readonly { id: number; qty: number }[]): string {
  return items
    .filter((i) => Number.isInteger(i.id) && i.id > 0)
    .slice(0, LIST_MAX)
    .map((i) => (i.qty > 1 ? `${i.id}*${Math.min(99, Math.floor(i.qty))}` : String(i.id)))
    .join(".");
}

export function decodeList(s: string | null | undefined): { id: number; qty: number }[] {
  const out = new Map<number, number>();
  for (const part of String(s ?? "").split(/[.,]/).slice(0, LIST_MAX)) {
    const m = /^(\d{1,12})(?:\*(\d{1,2}))?$/.exec(part.trim());
    if (!m) continue;
    const id = Number(m[1]);
    const qty = Math.max(1, Math.min(99, Number(m[2] ?? 1)));
    if (id > 0) out.set(id, (out.get(id) ?? 0) + qty);
  }
  return [...out].map(([id, qty]) => ({ id, qty: Math.min(99, qty) }));
}
