// THE CART LIST (owner, 2026-11-06: "I really like the cart feature … all of our websites").
// The same file in every Compare Empire site; port fixes by hand to the others.
//
// A visitor adds store rows to one list, kept in THIS BROWSER ONLY (localStorage,
// `ce_cart_v1`): no account, no server, no database, nothing stored about anyone.
// /cart groups the list by store, re-checks each Shopify line's live price and stock
// straight from the store (`/products/<handle>.js`, which Shopify serves with CORS
// open, so no function of ours runs), and gives each store ONE button that opens
// the store's own checkout with every line in it: Shopify's cart permalink,
// `/cart/<variant>:<qty>,<variant>:<qty>`. A cart cannot span stores, so it is one
// button per store.
//
// WHICH LINES CAN BE CARTED is decided by the row's own buy link, never here: a line
// is cartable only when the row's link already is a cart permalink (the single-click
// checkout links, `/cart/<id>:1`), which each site builds only for a Shopify store
// with no programme of its own. A store on Awin, a store partner deal, eBay, Amazon,
// or a row whose variant is unknown keeps its product link: it is a "manual" line,
// listed with its own (tagged) link, so the commission still tracks.
//
// eBay and Amazon rows are full price rows (owner, 2026-11-06: "eBay prices and Amazon
// prices should function exactly like a normal store price row. So you can also add to
// cart"): they add manual lines, grouped as one "store" per eBay / Amazon domain.
// Amazon's licence lets a price be kept 24 hours, so an Amazon line's price is dropped
// after AMAZON_PRICE_TTL_MS (priceCents 0 = "see the price on Amazon"). TCGplayer and
// Cardmarket stay references, never lines.
//
// Pure apart from the guarded localStorage/window helpers at the bottom.

export const CART_KEY = "ce_cart_v1";
export const CART_EVENT = "ce-cart-change";
export const CART_ADDED_EVENT = "ce-cart-added";
export const CART_MAX_LINES = 100;
export const CART_MAX_QTY = 20;

export interface CartLine {
  /** `<store host>:v:<variant>` for a cartable line, `<store host>:u:<link>` otherwise. */
  id: string;
  /** The store's host, without www: the group key. */
  store: string;
  storeName: string;
  title: string;
  /** Condition, printing, size… shown under the title. */
  detail?: string | null;
  /** The row's own buy link (affiliate-tagged): what a manual line opens. */
  href: string;
  /** The store's product page (may carry ?variant=), for the live check. */
  productUrl?: string | null;
  /** Shopify cart base (`https://store` or `https://store/en-au`) and variant: null = manual. */
  base?: string | null;
  variantId?: string | null;
  /** Price when added, in the smallest unit of `currency`. */
  priceCents: number;
  currency: string;
  image?: string | null;
  /** The page on our site it was added from. */
  page?: string | null;
  qty: number;
  addedAt: string;
}

export interface CartAddInput {
  href: string;
  productUrl?: string | null;
  storeName: string;
  title: string;
  detail?: string | null;
  priceCents: number;
  currency: string;
  image?: string | null;
  page?: string | null;
}

const VARIANT = /^\d{6,20}$/;

function hostOf(url: string): string | null {
  try {
    // rover.ebay.com, m.ebay.co.uk, smile.amazon.com… are one eBay / Amazon per domain.
    return new URL(url).hostname
      .replace(/^www\./i, "")
      .toLowerCase()
      .replace(/^(?:[a-z0-9-]+\.)+((?:ebay|amazon)\.[a-z.]+)$/, "$1");
  } catch {
    return null;
  }
}

export const AMAZON_PRICE_TTL_MS = 24 * 60 * 60 * 1000;
const AMAZON = /^amazon\.[a-z.]+$/;

/** An Amazon line (its price may be shown for 24 hours only). */
export function isAmazonLine(l: { store: string }): boolean {
  return AMAZON.test(l.store);
}

/** The Shopify cart base and variant of a cart permalink (`…/cart/<id>:<qty>`), else null. */
export function cartTarget(href: string | null | undefined): { base: string; variantId: string } | null {
  if (!href) return null;
  try {
    const u = new URL(href);
    if (u.protocol !== "https:") return null;
    const m = u.pathname.match(/^((?:\/[a-z]{2}(?:-[a-z]{2})?)?)\/cart\/(\d{6,20}):\d+\/?$/i);
    if (!m || !VARIANT.test(m[2])) return null;
    return { base: `${u.origin}${m[1]}`, variantId: m[2] };
  } catch {
    return null;
  }
}

/** The store host of a row: its product page's, else its buy link's (never an affiliate network's). */
export function storeHost(input: { href: string; productUrl?: string | null }): string | null {
  const cart = cartTarget(input.href);
  if (cart) return hostOf(cart.base);
  if (input.productUrl) return hostOf(input.productUrl);
  return hostOf(input.href);
}

/**
 * TCGplayer and Cardmarket are references, never a cart line. eBay and Amazon rows are
 * (manual lines on their tagged links, owner 2026-11-06), still never counted as a store.
 */
const MARKETPLACE = /(?:^|\.)(?:tcgplayer|cardmarket)(?:\.|$)/i;

export function isMarketplace(host: string | null | undefined): boolean {
  return !!host && MARKETPLACE.test(host);
}

/** Build the line a row adds, or null when the row has no usable link or price. */
export function makeLine(input: CartAddInput, now = new Date()): CartLine | null {
  const store = storeHost(input);
  if (!store || isMarketplace(store) || isMarketplace(hostOf(input.href)) || !input.title || !Number.isFinite(input.priceCents) || input.priceCents <= 0) return null;
  // eBay and Amazon are never a Shopify checkout, whatever the link looks like.
  const cart = /^(?:ebay|amazon)\./.test(store) ? null : cartTarget(input.href);
  const id = cart ? `${store}:v:${cart.variantId}` : `${store}:u:${input.productUrl || input.href}`;
  return {
    id,
    store,
    storeName: input.storeName || store,
    title: input.title.slice(0, 200),
    detail: input.detail ? input.detail.slice(0, 120) : null,
    href: input.href,
    productUrl: input.productUrl ?? null,
    base: cart?.base ?? null,
    variantId: cart?.variantId ?? null,
    priceCents: Math.round(input.priceCents),
    currency: (input.currency || "USD").toUpperCase(),
    image: input.image ?? null,
    page: input.page ?? null,
    qty: 1,
    addedAt: now.toISOString(),
  };
}

/** Keep only well-formed lines (localStorage is the visitor's to edit). */
export function parseCart(raw: string | null | undefined, now = new Date()): CartLine[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v
      .filter(
        (l): l is CartLine =>
          l &&
          typeof l.id === "string" &&
          typeof l.store === "string" &&
          typeof l.title === "string" &&
          typeof l.href === "string" &&
          /^https:\/\//.test(l.href) &&
          Number.isFinite(l.priceCents) &&
          typeof l.currency === "string",
      )
      .map((l) => ({
        ...l,
        priceCents: isAmazonLine(l) && !(now.getTime() - Date.parse(l.addedAt) < AMAZON_PRICE_TTL_MS) ? 0 : l.priceCents,
        qty: Math.min(CART_MAX_QTY, Math.max(1, Math.round(Number(l.qty) || 1))),
        base: l.base && /^https:\/\//.test(l.base) ? l.base : null,
        variantId: l.variantId && VARIANT.test(String(l.variantId)) ? String(l.variantId) : null,
      }))
      .slice(0, CART_MAX_LINES);
  } catch {
    return [];
  }
}

export function addLine(lines: CartLine[], line: CartLine): CartLine[] {
  const i = lines.findIndex((l) => l.id === line.id);
  if (i >= 0) {
    const next = lines.slice();
    next[i] = { ...next[i], qty: Math.min(CART_MAX_QTY, next[i].qty + 1) };
    return next;
  }
  return [...lines, line].slice(-CART_MAX_LINES);
}

export function setQty(lines: CartLine[], id: string, qty: number): CartLine[] {
  if (qty <= 0) return lines.filter((l) => l.id !== id);
  return lines.map((l) => (l.id === id ? { ...l, qty: Math.min(CART_MAX_QTY, Math.round(qty)) } : l));
}

export interface CartGroup {
  key: string;
  store: string;
  storeName: string;
  currency: string;
  lines: CartLine[];
}

/** One group per store and currency, in the order the stores were first added. */
export function groupByStore(lines: CartLine[]): CartGroup[] {
  const groups = new Map<string, CartGroup>();
  for (const l of lines) {
    const key = `${l.store}|${l.currency}`;
    const g = groups.get(key) ?? { key, store: l.store, storeName: l.storeName, currency: l.currency, lines: [] };
    g.lines.push(l);
    groups.set(key, g);
  }
  return [...groups.values()];
}

/**
 * The store's checkout with these lines in it: Shopify's cart permalink. Every line
 * must share one base; lines without a variant are skipped. Null when none is left.
 * `ref` becomes a cart attribute, so the store's order carries where it came from.
 */
export function checkoutUrl(lines: { base?: string | null; variantId?: string | null; qty: number }[], site: string, ref?: string): string | null {
  const ok = lines.filter((l) => l.base && l.variantId && VARIANT.test(l.variantId));
  if (!ok.length) return null;
  const base = ok[0].base!;
  const items = ok
    .filter((l) => l.base === base)
    .map((l) => `${l.variantId}:${Math.min(CART_MAX_QTY, Math.max(1, Math.round(l.qty)))}`);
  try {
    const u = new URL(`${base}/cart/${items.join(",")}`);
    u.searchParams.set("utm_source", site);
    u.searchParams.set("utm_medium", "cart");
    u.searchParams.set("utm_campaign", "cart-list");
    if (ref) u.searchParams.set("attributes[compare_ref]", ref);
    return u.toString();
  } catch {
    return null;
  }
}

/** The `.js` address Shopify serves a product's live variants at, or null. */
export function productJsUrl(productUrl: string | null | undefined): string | null {
  if (!productUrl) return null;
  try {
    const u = new URL(productUrl);
    if (u.protocol !== "https:" || !/\/products\/[^/]+\/?$/.test(u.pathname)) return null;
    return `${u.origin}${u.pathname.replace(/\/$/, "")}.js`;
  } catch {
    return null;
  }
}

export interface LiveCheck {
  status: "ok" | "soldout" | "missing" | "unknown";
  priceCents: number | null;
}

/** Read a Shopify `/products/<handle>.js` body for one variant. */
export function readVariant(body: unknown, variantId: string): LiveCheck {
  const variants = (body as { variants?: { id?: number | string; price?: number | string; available?: boolean }[] } | null)?.variants;
  if (!Array.isArray(variants)) return { status: "unknown", priceCents: null };
  const v = variants.find((x) => String(x?.id) === variantId);
  if (!v) return { status: "missing", priceCents: null };
  const raw = typeof v.price === "string" ? (v.price.includes(".") ? Math.round(parseFloat(v.price) * 100) : parseInt(v.price, 10)) : v.price;
  const priceCents = Number.isFinite(raw) && (raw as number) > 0 ? (raw as number) : null;
  return { status: v.available === false ? "soldout" : "ok", priceCents };
}

// ── Browser helpers (guarded: storage can be missing, full or throw) ─────────

export function readCart(): CartLine[] {
  try {
    return typeof window === "undefined" ? [] : parseCart(window.localStorage.getItem(CART_KEY));
  } catch {
    return [];
  }
}

export function writeCart(lines: CartLine[]): void {
  try {
    window.localStorage.setItem(CART_KEY, JSON.stringify(lines.slice(0, CART_MAX_LINES)));
  } catch {
    /* full or blocked: the list just doesn't persist */
  }
  try {
    window.dispatchEvent(new CustomEvent(CART_EVENT));
  } catch {
    /* no window */
  }
}

/** Run `fn` whenever the list changes, here or in another tab. Returns the unsubscribe. */
export function onCartChange(fn: () => void): () => void {
  const storage = (e: StorageEvent) => {
    if (e.key === null || e.key === CART_KEY) fn();
  };
  window.addEventListener(CART_EVENT, fn);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(CART_EVENT, fn);
    window.removeEventListener("storage", storage);
  };
}

/** Lines in the list (not units): the header badge. */
export function cartCount(lines: CartLine[]): number {
  return lines.length;
}

export function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/** A short random id for the cart attribute: which list a store's order came from. */
export function cartRef(site: string): string {
  let r = "";
  try {
    r = crypto.randomUUID().slice(0, 8);
  } catch {
    r = Math.random().toString(36).slice(2, 10);
  }
  return `${site}-${r}`;
}
