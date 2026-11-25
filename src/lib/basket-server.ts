// BEST BASKET ON MTG COMPARE (owner, 2026-11-25: "have it on all the sites as premium"). The visitor's shortlist products, priced at
// every store that has them, split across stores for the lowest delivered total: RiftCompare's solver (lib/basket-optimize.ts, a
// straight port) over MTG Compare's own rows (ported from DexCompare) and its MEASURED shipping (src/data/shipping-rates.json). DECISIONS.md, 2026-11-25.
//
// The rows a basket may use are Rift's rules after Rob's Sprite Fountain report (TCGEmpire #653):
//   • in stock, and read by the import in the last BASKET_ROW_MAX_AGE_H hours (a store whose read failed keeps old rows: never those);
//   • never a pre-order (an unreleased set's product, or a listing whose title or link says pre-order);
//   • never a marketplace (TCGplayer, eBay, Amazon): a basket is stores, each with its own checkout;
//   • only stores whose shipping we measured in this market: an unmeasured store's postage would be a guess, so it is left out and
//     named with its reason, never priced at zero.
// Postage is the store's measured figure for an order of that subtotal, the DEAREST address (a total we can stand behind), "from"
// when the order holds more than one item (we measure single-item carts). Pure apart from `loadBasket`, which reads the public data.
import { planBasket, type BasketCard, type BasketListing, type BasketResult, type BasketStores } from "./basket-optimize";
import type { PostageCart, PostageQuote } from "./postage";
import { SHIPPING, shippingQuote } from "./shipping";
import type { StoreShipping } from "./shipping-probe";
import { isPreorderSet } from "./release";
import { offerLink } from "./affiliate";
import { REGIONS, type Region } from "./regions";
import { productPage, type ProductPageData } from "./data";
import { checkoutUrl } from "./cart-list";
import { CART_SITE } from "@/components/cart/cart-config";

export const BASKET_ROW_MAX_AGE_H = 48;
export const BASKET_MAX_LINES = 30;
export const BASKET_MAX_QTY = 20;

const PREORDER = /\bpre[-\s]?orders?\b/i;

export interface BasketRequestLine {
  slug: string;
  qty: number;
}

/** The request's lines, cleaned: known slug shape, 1..BASKET_MAX_QTY each, one line per product, at most BASKET_MAX_LINES. */
export function cleanLines(raw: unknown): BasketRequestLine[] {
  if (!Array.isArray(raw)) return [];
  const out = new Map<string, number>();
  for (const l of raw) {
    const slug = typeof l?.slug === "string" ? l.slug.trim().toLowerCase() : "";
    if (!/^[a-z0-9][a-z0-9-]{0,159}$/.test(slug)) continue;
    const qty = Math.min(BASKET_MAX_QTY, Math.max(1, Math.floor(Number(l?.qty) || 1)));
    out.set(slug, Math.max(out.get(slug) ?? 0, qty));
    if (out.size >= BASKET_MAX_LINES) break;
  }
  return [...out].map(([slug, qty]) => ({ slug, qty }));
}

/** A store's measured postage for a basket order, or null when we have no measurement for it in this market. */
export function measuredPostage(
  storeKey: string,
  market: string,
  quote: (key: string, market: string, cents: number) => ReturnType<typeof shippingQuote> = shippingQuote,
  shipping: { stores: Record<string, StoreShipping> } = SHIPPING,
): ((cart: PostageCart) => PostageQuote) | null {
  const s = shipping.stores[storeKey];
  if (!s || s.market !== market) return null;
  const lowest = s.points.reduce((m, p) => Math.min(m, p.subtotalCents), Infinity);
  if (!Number.isFinite(lowest) || !quote(storeKey, market, Math.max(lowest, 1))) return null;
  return (cart) => {
    // Under the store's cheapest measured item there is nothing to read from: its cheapest measured cart's figure stands in, as an
    // estimate (a smaller order rarely posts dearer).
    const exact = quote(storeKey, market, cart.subtotalCents);
    const q = exact ?? quote(storeKey, market, lowest);
    if (!q) return { cents: 0, label: "Shipping at checkout", tracked: null, basis: "estimate", free: false, upTo: false, unavailable: "No shipping measured" };
    return {
      cents: q.maxCents,
      label: q.maxCents === 0 ? "Free shipping" : "Measured shipping",
      tracked: null,
      basis: exact ? "measured" : "estimate",
      free: q.maxCents === 0,
      upTo: q.minCents !== q.maxCents,
      ...(q.freeAtCents != null && q.freeAtCents > cart.subtotalCents ? { freeFromCents: q.freeAtCents } : {}),
      ...(cart.items > 1 && q.maxCents > 0 ? { beyondMeasured: true } : {}),
      measuredAt: q.measuredAt,
    };
  };
}

/** The product's listings a basket may use (rules at the top), cheapest per store. */
export function basketListings(p: Pick<ProductPageData, "offers" | "setCode">, now = Date.now()): BasketListing[] {
  if (isPreorderSet(p.setCode, new Date(now))) return [];
  const best = new Map<string, BasketListing>();
  for (const o of p.offers) {
    if (o.marketplace || !o.inStock || !(o.priceCents > 0)) continue;
    const seen = Date.parse(o.lastSeen);
    if (!Number.isFinite(seen) || now - seen > BASKET_ROW_MAX_AGE_H * 3_600_000) continue;
    if (PREORDER.test(o.title) || PREORDER.test(o.url)) continue;
    const cur = best.get(o.store);
    if (!cur || o.priceCents < cur.priceCents) best.set(o.store, { retailer: o.store, retailerName: o.storeName, priceCents: o.priceCents, url: o.url, condition: null });
  }
  return [...best.values()];
}

/** Store entries for every store the cards list: measured postage, or left out with the reason. */
export function basketStores(cards: BasketCard[], names: Map<string, string>, market: string, postageFor = measuredPostage): BasketStores {
  const stores: BasketStores = {};
  for (const c of cards) {
    for (const l of c.listings) {
      if (stores[l.retailer]) continue;
      const name = names.get(l.retailer) ?? l.retailer;
      const postage = postageFor(l.retailer, market);
      stores[l.retailer] = postage
        ? { name, postage }
        : { name, postage: () => ({ cents: 0, label: "", tracked: null, basis: "estimate", free: false, upTo: false }), unavailable: "We haven't measured its shipping yet" };
    }
  }
  return stores;
}

// A line's link is the row's own: for a Shopify store with a known variant that is a one-item cart permalink (lib/checkout-link.ts),
// `https://store/cart/<variant>:1?utm…`. The plan buys `qty`, so the permalink says so, and a store's lines that are all permalinks
// get ONE checkout link holding every one (cart-list.ts checkoutUrl, the shortlist's own).
const PERMALINK = /^(https:\/\/[^/?#]+(?:\/[a-z]{2}(?:-[a-z]{2})?)?)\/cart\/(\d{6,20}):\d+(?=[?#]|$)/i;

export function withQty(url: string, qty: number): string {
  return url.replace(PERMALINK, (_m, base: string, v: string) => `${base}/cart/${v}:${Math.max(1, Math.round(qty))}`);
}

/** One checkout link for a store's lines, when every line is a cart permalink on the same store; else null. */
export function storeCheckout(lines: { url: string; qty: number }[], site = CART_SITE): string | null {
  if (lines.length < 2) return null;
  const parts = lines.map((l) => PERMALINK.exec(l.url));
  if (parts.some((m) => !m) || new Set(parts.map((m) => m![1])).size !== 1) return null;
  return checkoutUrl(parts.map((m, i) => ({ base: m![1], variantId: m![2], qty: lines[i].qty })), site);
}

export interface LoadedBasket {
  result: BasketResult;
  /** Per store in the plan: one checkout link with every line, where the store allows it. */
  checkouts?: Record<string, string>;
  /** Slugs we could not find at all (renamed or removed products). */
  missing: string[];
  products: { slug: string; name: string; imageUrl: string | null; qty: number }[];
}

export async function loadBasket(lines: BasketRequestLine[], region: Region, now = Date.now()): Promise<LoadedBasket> {
  const r = REGIONS[region];
  const pages = await Promise.all(lines.map((l) => productPage(l.slug, r.market).catch(() => null)));
  const cards: BasketCard[] = [];
  const names = new Map<string, string>();
  const missing: string[] = [];
  const products: LoadedBasket["products"] = [];
  pages.forEach((p, i) => {
    if (!p) {
      missing.push(lines[i].slug);
      return;
    }
    for (const o of p.offers) names.set(o.store, o.storeName);
    products.push({ slug: p.slug, name: p.name, imageUrl: p.imageUrl, qty: lines[i].qty });
    cards.push({ cardId: p.id, name: p.name, slug: p.slug, qty: lines[i].qty, listings: basketListings(p, now) });
  });
  const stores = basketStores(cards, names, r.market);
  const result = planBasket(cards, stores, { link: (url, key) => offerLink(key, url, region, "best-basket").href });
  const checkouts: Record<string, string> = {};
  for (const g of result.plan.stores) {
    for (const l of g.lines) l.url = withQty(l.url, l.qty);
    const c = storeCheckout(g.lines);
    if (c) checkouts[g.key] = c;
  }
  return { result, missing, products, checkouts };
}

/** What a visitor without Premium sees: the delivered total and what splitting saves, never the store-by-store plan. */
export function basketSummary(b: LoadedBasket) {
  const p = b.result.plan;
  return {
    totalCents: p.totalCents,
    itemsCents: p.itemsCents,
    shippingCents: p.shippingCents,
    storeCount: p.storeCount,
    naiveTotalCents: p.naiveTotalCents,
    savedCents: p.savedCents,
    matchedCards: p.matchedCards,
    coveredCopies: p.coveredCopies,
    unbuyable: p.unbuyable,
    estimated: p.stores.some((s) => s.postage.basis === "estimate" || s.postage.beyondMeasured || s.postage.upTo),
  };
}
