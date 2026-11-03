// Compact on-disk form of an Offer. ~330,000 store offers a day as plain
// objects were 95 MB; as tuples, with the market and currency taken from the
// store's config and a store URL kept as its /products/ path, they are a
// fraction of that.
//
//   [source, cents, flags, ref, printing?, shippingCents?, market?]
//   flags: 1 = in stock, 2 = pre-order
//   ref:   store offers → "handle?variant=id" (after <base>/products/);
//          eBay / TCGplayer → the full URL
//   market: only for eBay and TCGplayer (stores take theirs from config)
import { SITE } from "@/site.config";
import { CURRENCY, type Market, type Offer } from "./site-types";

export type OfferTuple = [string, number, number, string, string?, (number | null)?, Market?];

const STORE = new Map(SITE.stores.map((s) => [s.key, s]));

export function encodeOffer(o: Offer): OfferTuple | null {
  const flags = (o.inStock ? 1 : 0) | (o.preorder ? 2 : 0);
  const store = STORE.get(o.source);
  if (store) {
    const prefix = `${store.base}/products/`;
    const ref = o.url.startsWith(prefix) ? o.url.slice(prefix.length) : o.url;
    const t: OfferTuple = [o.source, o.cents, flags, ref];
    if (o.printing && o.printing !== "Normal") t[4] = o.printing;
    return t;
  }
  return [o.source, o.cents, flags, o.url, o.printing && o.printing !== "Normal" ? o.printing : "", o.shippingCents ?? null, o.market];
}

export function decodeOffer(t: OfferTuple): Offer | null {
  const [source, cents, flags, ref, printing, ship, mk] = t;
  const store = STORE.get(source);
  let market: Market;
  let url: string;
  if (store) {
    market = store.market;
    url = /^https?:\/\//.test(ref) ? ref : `${store.base}/products/${ref}`;
  } else if (source === "ebay" && ship == null) {
    // An eBay row without a stated postage (one stored before 2026-10-31, when the search took any seller anywhere): never
    // shown, as its postage may be an overseas seller's (visitor feedback, 2026-10-31).
    return null;
  } else if (source === "ebay" || source === "tcgplayer") {
    market = mk ?? "US";
    url = ref;
  } else return null; // a store since removed from the config
  return {
    source,
    market,
    currency: CURRENCY[market],
    cents,
    inStock: (flags & 1) === 1,
    preorder: (flags & 2) === 2 || undefined,
    url,
    title: "",
    printing: printing || undefined,
    shippingCents: ship ?? null,
  };
}
