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
 * Open every store in its own tab from the click that asked for it. Chrome, Safari and Firefox
 * let ONE click open ONE tab unless the visitor allows pop-ups for the site (tested in Chrome 157,
 * 2026-11-17: five window.open calls, window.open followed by anchor clicks, noopener and
 * open-blank-then-navigate all gave one tab). So this tries every item (each refused try is what
 * makes the browser show its "pop-up blocked" control, where "always allow" lives) and returns what
 * the browser refused as `pending`, for the drawer's allow-pop-ups help and its retry. With
 * pop-ups allowed, every item opens from the one click. `open` is injectable for tests.
 */
export function openAll(items: CheckoutItem[], open: (url: string) => { opener: unknown } | null = (u) => window.open(u, "_blank")): { opened: CheckoutItem[]; pending: CheckoutItem[] } {
  const opened: CheckoutItem[] = [];
  const pending: CheckoutItem[] = [];
  for (const it of items) {
    let w: { opener: unknown } | null = null;
    try {
      w = open(it.url);
    } catch {
      w = null;
    }
    if (!w) {
      pending.push(it);
      continue;
    }
    try {
      w.opener = null; // the store never gets a handle on our page
    } catch {
      /* cross-origin: fine */
    }
    opened.push(it);
  }
  return { opened, pending };
}

export type BrowserKind = "chrome" | "firefox" | "safari" | "ios" | "android";

/** Which pop-up instructions to show. Chrome covers Edge, Brave and Opera, which share its blocked-pop-up icon. */
export function browserKind(ua: string): BrowserKind {
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  if (/firefox|fxios/i.test(ua)) return "firefox";
  if (/safari/i.test(ua) && !/chrome|chromium|crios|edg|opr\//i.test(ua)) return "safari";
  return "chrome";
}

/** The exact steps for allowing pop-ups for this site, plain words, in the browser's own labels. */
export function popupSteps(kind: BrowserKind, host: string): string[] {
  switch (kind) {
    case "firefox":
      return ["Click Options on the yellow bar under the toolbar (or the blocked icon at the right of the address bar).", `Choose “Allow pop-ups for ${host}”.`];
    case "safari":
      return ["In the menu bar choose Safari, then Settings for This Website.", "Set Pop-up Windows to Allow."];
    case "ios":
      return ["Open the Settings app, then Safari (on newer iPhones: Apps, then Safari).", "Turn off Block Pop-ups."];
    case "android":
      return ["Tap “Pop-up blocked” at the bottom of the page (or the icon in the address bar).", "Choose Always show pop-ups from this site."];
    default:
      return ["Click the pop-up blocked icon at the right end of the address bar (a small window with a red cross).", `Choose “Always allow pop-ups and redirects from ${host}”, then Done.`];
  }
}

const POPUP_KEY = "ce_popups_v1";
/** Remembered when one click opened several tabs, so a later block reads as "blocked again", not a first-time ask. */
export function readPopupMemory(): boolean {
  try {
    return window.localStorage.getItem(POPUP_KEY) === "all";
  } catch {
    return false;
  }
}
export function writePopupMemory() {
  try {
    window.localStorage.setItem(POPUP_KEY, "all");
  } catch {
    /* private mode: fine */
  }
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
