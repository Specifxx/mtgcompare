// STRAIGHT TO CHECKOUT (owner, 2026-11-06: "when a user clicks a link it brings them
// straight to checkout"). DECISIONS.md, "Buy links open the store's checkout".
//
// A store row's buy link opens the store's checkout with that copy already in it,
// instead of its product page, wherever that can be done without losing anything:
//
//   * Shopify stores: a cart permalink, /cart/<variant id>:1, Shopify's own
//     documented link that creates a cart with the item and opens checkout. The
//     importer records the exact variant it priced (the best in-stock condition)
//     as `?variant=<id>` on the product URL (`withShopifyVariant`), only for an
//     in-stock row of a Shopify store; that URL is still the product page with the
//     variant picked, so everything that reads it (an email, the snapshot, the
//     eBay reference) keeps working, and affiliateUrl() turns it into the cart
//     link at render time (`shopifyCartUrl`). Ported from RiftCompare (#340) and OP Compare (#99).
//
// Amazon keeps its item page for now: its Associates "Add to Cart" form link
// (/gp/aws/cart/add.html with AssociateTag) could not be tried here, because Amazon
// refuses automated browsers, and the row is the one Amazon earns on.
//
// Never where tracking would be lost, so these keep the product page:
//   * a store on Awin (lib/awin.ts): its
//     tracking is set by a script on the store's own pages, which a checkout
//     page skips;
//   * Amazon (above), eBay (EPN credits item and search pages; there is no partner checkout link)
//     and TCGplayer (Impact deep links to a product page; its cart needs a seller
//     and a SKU per listing);
//   * emails (a `loc` under /email…), where the link can be days old;
//   * a sold-out row, or a store or listing whose variant we do not know.
//
// `isCheckoutLink` lets OutboundLink tag each click "checkout" or "product"
// (buy_click.link_type in Vercel Analytics).
//
// Pure and dependency-free: a client component imports it.

/** Shopify variant ids are long integers; anything else is not one of ours. */
const VARIANT_ID = /^\d{6,20}$/;

/** The product URL with the priced variant picked (`?variant=<id>`), or the URL unchanged. */
export function withShopifyVariant(url: string, variantId: number | string | null | undefined): string {
  if (variantId == null) return url;
  const id = String(variantId);
  if (!VARIANT_ID.test(id)) return url;
  try {
    const u = new URL(url);
    if (!/\/products\/[^/]+\/?$/.test(u.pathname)) return url;
    u.searchParams.set("variant", id);
    return u.toString();
  } catch {
    return url;
  }
}

/** The product URL without the variant pick: what Shopify's `<url>.json` endpoint needs. */
export function withoutShopifyVariant(url: string): string {
  try {
    const u = new URL(url);
    if (!u.searchParams.has("variant")) return url;
    u.searchParams.delete("variant");
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * The Shopify cart permalink for a product URL that carries `?variant=<id>`:
 * `https://store/cart/<id>:1`, under the same market subfolder when the product
 * URL has one (`/en-au/products/x` → `/en-au/cart/<id>:1`). Other query
 * parameters (utm_*, ref) are kept. Null for anything else.
 */
export function shopifyCartUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    const m = u.pathname.match(/^((?:\/[a-z]{2}(?:-[a-z]{2})?)?)\/products\/[^/]+\/?$/i);
    const id = u.searchParams.get("variant");
    if (!m || !id || !VARIANT_ID.test(id)) return null;
    const out = new URL(`${u.origin}${m[1]}/cart/${id}:1`);
    u.searchParams.forEach((v, k) => {
      if (k !== "variant") out.searchParams.set(k, v);
    });
    return out.toString();
  } catch {
    return null;
  }
}

/** Does this outbound link open a checkout (a cart) rather than a product page? */
export function isCheckoutLink(href: string | null | undefined): boolean {
  if (!href) return false;
  try {
    const u = new URL(href);
    return /\/cart\/\d{6,20}:\d+\/?$/.test(u.pathname);
  } catch {
    return false;
  }
}

/** A listing's URL without the variant pick, for identity across runs (offerRef). */
export function listingKeyUrl(url: string): string {
  return url.replace(/\?variant=\d+$/, "");
}

/** A store read through Shopify's products.json (a store with no `platform` is Shopify). */
export function isShopify(store: { platform?: string }): boolean {
  return (store.platform ?? "shopify") === "shopify";
}
