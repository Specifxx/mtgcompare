// CHECKOUT FOR THE CART DRAWER (owner, 2026-11-17: "when you click checkout, it pretty much
// just opens all the links of everything that you have in your cart in separate tabs, with all
// the affiliate links and tracking links … the same Shopify store aggregated into one checkout").
// The same file in every Compare Empire site; port fixes by hand.
//
// A line's `href` is already the row's OWN buy link, tagged by that site's affiliate code (eBay
// EPN customid, TCGplayer, Amazon, Awin/Impact, store utm), so a link opened from here earns
// exactly what the row's button does. Lines the row made a Shopify cart permalink of (a verified
// Shopify store with a known variant, no programme of its own, see cart-list.ts `cartTarget`) are
// merged per store into ONE permalink (`checkoutUrl`, which keeps utm_* and the cart attribute).
// Everything else is its own link. Pure apart from `openAll` and `checkLines`, which touch the
// browser.
import { checkoutUrl, groupByStore, productJsUrl, readVariant, type CartLine, type LiveCheck } from "./cart-list";

export type Checks = Record<string, LiveCheck>;

export interface CheckoutItem {
  key: string;
  storeName: string;
  /** What the tab opens, for the fallback list. */
  label: string;
  url: string;
  /** "store": one permalink holding every cartable line; "line": one line's own tagged link. */
  kind: "store" | "line";
  units: number;
  cents: number;
  currency: string;
  /** rel for the link: sponsored for a line's own affiliate link. */
  rel: string;
}

export const isGone = (c: LiveCheck | undefined) => c?.status === "soldout" || c?.status === "missing";

/** One checkout item per store's cartable lines, plus one per manual line. Sold-out lines are left out. */
export function buildCheckout(lines: CartLine[], checks: Checks, site: string, ref?: string): CheckoutItem[] {
  const out: CheckoutItem[] = [];
  for (const g of groupByStore(lines)) {
    const price = (l: CartLine) => checks[l.id]?.priceCents ?? l.priceCents;
    const live = g.lines.filter((l) => !isGone(checks[l.id]));
    const cartable = live.filter((l) => l.variantId && l.base);
    const url = checkoutUrl(cartable, site, ref);
    if (url && cartable.length) {
      const units = cartable.reduce((s, l) => s + l.qty, 0);
      out.push({
        key: `${g.key}#store`,
        storeName: g.storeName,
        label: `${g.storeName}: ${units} item${units === 1 ? "" : "s"}`,
        url,
        kind: "store",
        units,
        cents: cartable.reduce((s, l) => s + price(l) * l.qty, 0),
        currency: g.currency,
        rel: "nofollow noopener noreferrer",
      });
    }
    for (const l of live.filter((x) => !x.variantId || !x.base)) {
      out.push({
        key: l.id,
        storeName: g.storeName,
        label: `${g.storeName}: ${l.title.length > 48 ? `${l.title.slice(0, 46)}…` : l.title}`,
        url: l.href,
        kind: "line",
        units: l.qty,
        cents: price(l) * l.qty,
        currency: g.currency,
        rel: "sponsored nofollow noopener noreferrer",
      });
    }
  }
  return out;
}

/**
 * Open stores in their own tabs from the click that asked for it. A browser lets ONE click open
 * ONE tab (Chrome and Safari spend the click on the first; Firefox allows a few), so this opens
 * the first, then goes on only while the browser still counts the click as live
 * (`navigator.userActivation.isActive`) and the last open worked. It never fires a second open
 * the browser is going to block, so nobody sees a "blocked" warning. Whatever is left comes back
 * as `pending`, for the drawer's one-tap-per-store steps. `open` and `live` are injectable for tests.
 */
export function openAll(
  items: CheckoutItem[],
  open: (url: string) => { opener: unknown } | null = (u) => window.open(u, "_blank"),
  live: () => boolean = () => (typeof navigator !== "undefined" ? (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation?.isActive ?? true : true),
): { opened: CheckoutItem[]; pending: CheckoutItem[] } {
  const opened: CheckoutItem[] = [];
  let i = 0;
  for (; i < items.length; i++) {
    if (i > 0 && !live()) break;
    let w: { opener: unknown } | null = null;
    try {
      w = open(items[i].url);
    } catch {
      w = null;
    }
    if (!w) break;
    try {
      w.opener = null; // the store never gets a handle on our page
    } catch {
      /* cross-origin: fine */
    }
    opened.push(items[i]);
  }
  return { opened, pending: items.slice(i) };
}

/** Re-check each Shopify line's live price and stock from the store itself (CORS-open, no function of ours). */
export async function checkLines(lines: CartLine[]): Promise<Checks> {
  const out: Checks = {};
  const byProduct = new Map<string, CartLine[]>();
  for (const l of lines) {
    const js = l.variantId ? productJsUrl(l.productUrl) : null;
    if (!js) continue;
    byProduct.set(js, [...(byProduct.get(js) ?? []), l]);
  }
  const jobs = [...byProduct.entries()];
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const [js, ls] = jobs[next++];
      let body: unknown = null;
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8000);
        const r = await fetch(js, { signal: ctrl.signal, credentials: "omit" });
        clearTimeout(t);
        body = r.ok ? await r.json() : r.status === 404 ? { variants: [] } : null;
      } catch {
        body = null;
      }
      for (const l of ls) out[l.id] = readVariant(body, l.variantId!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, worker));
  return out;
}
