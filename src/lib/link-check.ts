// "Is this a good price?": a visitor pastes a store's product link and we say how that store's price compares with every other
// store we read. Pure functions, shared by the checker (src/components/tools/LinkChecker.tsx) and its route (/api/check/<host>), so
// tests/link-check.test.ts pins how a pasted link is read and what the verdict says. Nothing here fetches: the route reads our own
// listings, and only a link to a store we already read is looked up (never the store's page itself).

/** A pasted link, read: the store's host, the product's path as we key it, and the words of its slug for a search fallback. */
export interface PastedLink {
  /** Lower case, without "www." or "m.". */
  host: string;
  /** linkPath() of the link. */
  path: string;
  /** Shopify's ?variant=, when the link names one. */
  variant: string | null;
  /** The product slug's words ("from-the-vault-lore" → "from the vault lore"), for a search when the link is not one we know. */
  words: string;
}

/** Hosts whose links are marketplaces or Amazon: never a store we read, so the checker asks for the price instead. */
const MARKETPLACES: [RegExp, string][] = [
  [/(^|\.)ebay\.[a-z.]+$/, "eBay"],
  [/(^|\.)amazon\.[a-z.]+$|(^|\.)amzn\.(to|eu|asia)$|^a\.co$/, "Amazon"],
  [/(^|\.)tcgplayer\.com$/, "TCGplayer"],
  [/(^|\.)facebook\.com$|^fb\.me$/, "Facebook"],
  [/(^|\.)gumtree\.[a-z.]+$/, "Gumtree"],
  [/(^|\.)kijiji\.ca$/, "Kijiji"],
  [/(^|\.)trademe\.co\.nz$/, "Trade Me"],
  [/(^|\.)carousell\.[a-z.]+$/, "Carousell"],
  [/(^|\.)vinted\.[a-z.]+$/, "Vinted"],
  [/(^|\.)mercari\.com$/, "Mercari"],
  [/(^|\.)walmart\.(com|ca)$/, "Walmart"],
  [/(^|\.)target\.com(\.au)?$/, "Target"],
];

export function marketplaceName(host: string): string | null {
  for (const [re, name] of MARKETPLACES) if (re.test(host)) return name;
  return null;
}

export function normaliseHost(host: string): string {
  return host.toLowerCase().replace(/\.$/, "").replace(/^(www\d?|m)\./, "");
}

function decode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * The path we key a product link by, the same for our stored listing and for whatever the visitor pastes: lower case, decoded, no
 * trailing slash, and a Shopify product reduced to /products/<handle> (a link from a collection, a market prefix such as /en-au or a
 * locale all name the same product). A WooCommerce /product/<slug> keeps its slug. Query and fragment never count.
 */
export function linkPath(pathname: string): string {
  let p = decode(pathname).toLowerCase().replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  const shopify = /\/products\/([^/]+)/.exec(p);
  if (shopify) return `/products/${shopify[1]}`;
  const woo = /\/product\/([^/]+)/.exec(p);
  if (woo) return `/product/${woo[1]}`;
  if (!p.startsWith("/")) p = `/${p}`;
  return p || "/";
}

/** The first link in what the visitor pasted (a bare "store.com/products/x" counts), read; null when there is none. */
export function parseLink(input: string): PastedLink | null {
  const text = input.trim();
  if (!text) return null;
  const m = /(https?:\/\/[^\s<>"']+)|((?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?\/[^\s<>"']*)/i.exec(text);
  if (!m) return null;
  let url: URL;
  try {
    url = new URL(m[1] ?? `https://${m[2]}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = normaliseHost(url.hostname);
  if (!host.includes(".")) return null;
  const path = linkPath(url.pathname);
  const variant = url.searchParams.get("variant");
  return { host, path, variant: variant && /^\d+$/.test(variant) ? variant : null, words: slugWords(path) };
}

/** Path parts that are never a product's name. */
const NOT_A_NAME = new Set(["products", "product", "collections", "collection", "itm", "dp", "gp", "p", "en", "shop", "store", "item", "items", "listing"]);

/**
 * The words of a product path, ids and file endings dropped: what a search box would be given. The last part that reads as a name
 * (an eBay /itm/<title>/<id> or Amazon /<title>/dp/<asin> link keeps its title, not its id).
 */
export function slugWords(path: string): string {
  const parts = path
    .split("/")
    .filter(Boolean)
    .map((seg) =>
      seg
        .replace(/\.(html?|php|aspx?)$/, "")
        .split(/[-_+.\s]+/)
        .filter((w) => w && !/^\d{5,}$/.test(w) && !/^[a-z]{0,2}\d{6,}$/.test(w) && !/^b0[a-z0-9]{8}$/.test(w)),
    )
    .filter((ws) => ws.length && !(ws.length === 1 && NOT_A_NAME.has(ws[0])) && ws.some((w) => /[a-z]{3,}/.test(w)));
  return (parts.pop() ?? []).join(" ").trim();
}

/** "a" or "an" before a name: "an eBay link", "a TCGplayer link". */
export function article(name: string): string {
  return /^[aeiou]/i.test(name) ? "an" : "a";
}

/** A store's listing as the route sends it: [path, product slug, price in cents, 1 in stock / 0 not, Shopify variant or ""]. */
export type CheckOffer = [path: string, slug: string, priceCents: number, inStock: 0 | 1, variant: string];

/** The body of /api/check/<host>. */
export interface StoreCheck {
  v: 1;
  /** The store's own key and name. */
  store: string;
  name: string;
  /** The region whose stores it is compared with. */
  region: string;
  /** When we last read the store, ISO; null when unknown. */
  checkedAt: string | null;
  offers: CheckOffer[];
}

/** The variant id in one of our stored listing URLs, or "". */
export function variantOf(url: string): string {
  return /[?&]variant=(\d+)/.exec(url)?.[1] ?? "";
}

/**
 * The listing the pasted link names: the one with the same path, and when the store lists several products under that path (a
 * Shopify page whose variants are a box and a case), the one with the same variant. Two different products and no variant to tell them
 * apart is no answer: a wrong product is worse than none.
 */
export function findOffer(offers: readonly CheckOffer[], link: Pick<PastedLink, "path" | "variant">): CheckOffer | null {
  const same = offers.filter((o) => o[0] === link.path);
  if (!same.length) return null;
  if (link.variant) {
    const v = same.find((o) => o[4] === link.variant);
    if (v) return v;
  }
  return new Set(same.map((o) => o[1])).size === 1 ? same.sort((a, b) => b[3] - a[3] || a[2] - b[2])[0] : null;
}

export type Verdict = "best" | "good" | "typical" | "high" | "unknown";

export interface PriceVerdict {
  verdict: Verdict;
  /** One line: "Good price", "You can pay less". */
  headline: string;
  /** What it means, with the figures. */
  detail: string;
  /** How much less the cheapest in-stock store asks, in cents (0 when this is the cheapest). */
  saveCents: number;
}

/**
 * The verdict on a price against today's in-stock store prices: the cheapest (within 1%) is the best price; under the median a good
 * one; within 3% of the median typical; above it high. Without a median (fewer than two stores in stock) a price above the cheapest is
 * high. `money` formats cents in the region's currency.
 */
export function priceVerdict(opts: { priceCents: number; cheapestCents: number | null; medianCents: number | null; inStockStores: number; money: (c: number) => string }): PriceVerdict {
  const { priceCents: p, cheapestCents: c, medianCents: med, inStockStores, money } = opts;
  if (c == null || inStockStores < 1) {
    return { verdict: "unknown", headline: "No store has it in stock to compare", detail: "None of the stores we read has this product in stock right now, so there is no price to compare yours with.", saveCents: 0 };
  }
  const save = Math.max(0, p - c);
  const near = (a: number, b: number, pct: number) => Math.abs(a - b) <= (b * pct) / 100;
  if (p <= c || near(p, c, 1)) {
    const under = p < c && !near(p, c, 1);
    return {
      verdict: "best",
      headline: "Good price: the cheapest we found",
      detail: under
        ? `Less than any store we read has it in stock for (the cheapest is ${money(c)}). Check the seller and the seal before you pay.`
        : inStockStores > 1
          ? `No store we read has it in stock for less (${inStockStores} stores have it in stock).`
          : "No store we read has it in stock for less.",
      saveCents: 0,
    };
  }
  const usable = med != null && inStockStores >= 2 && med > c;
  if (usable && near(p, med!, 3)) {
    return { verdict: "typical", headline: "A typical price", detail: `About what most stores ask (median ${money(med!)}). The cheapest in stock is ${money(c)}, ${money(save)} less.`, saveCents: save };
  }
  if (usable && p < med!) {
    return { verdict: "good", headline: "A fair price", detail: `Under what most stores ask (median ${money(med!)}), but the cheapest in stock is ${money(c)}, ${money(save)} less.`, saveCents: save };
  }
  return {
    verdict: "high",
    headline: "You can pay less",
    detail: `${money(save)} more than the cheapest in-stock store (${money(c)})${usable ? `, and above what most stores ask (median ${money(med!)})` : ""}.`,
    saveCents: save,
  };
}
