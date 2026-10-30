import Link from "@/components/Link";
import type { ReactNode } from "react";
import type { OfferView } from "@/lib/data";
import { offerLink, offerRetailer, REL_SPONSORED, TCGPLAYER_KEY, TCGPLAYER_RETAILER, tcgplayerSearchUrl, type Placement } from "@/lib/affiliate";
import { ebayRowNote, moreClosedLabel, moreOpenLabel, splitRows, tableFooter, type PriceFloor } from "@/lib/ebay-offer-row";
import { money, timeAgo } from "@/lib/format";
import { AMAZON_DISCLOSURE, amazonFor, amazonLabel, amazonUrl, REL_AMAZON } from "@/lib/amazon";
import { DUTIES_NOTE, REGIONS, type Region } from "@/lib/regions";
import { addressCount, shippingCell } from "@/lib/shipping";
import { SHIP_UNKNOWN } from "@/lib/shipping-quote";
import { offerStock } from "@/lib/sealed-offers";
import { OfferRowsWithEbay } from "./EbayStrip";
import { usd, type TcgplayerMatch } from "./Marketplaces";
import { Chevron, ShippingToggle, StoreRows, type StoreRowData } from "./OfferRows";

// The region's offers, ranked (in the US that includes TCGplayer's, badged as a marketplace), and, with `ebay`, ONE eBay row among
// them: the product's lowest-priced own eBay listing, ranked by its price among the stores you can buy from now, tinted, labelled "Ad",
// with eBay's blue button (EbayStrip.tsx OfferRowsWithEbay, lib/ebay-offer-row.ts). The owner's call: MTG Compare compares websites, and
// eBay is one. When the eBay listing is cheaper than every store you can buy from it is the best price ("Best price" on it, "Best store
// price" on the cheapest store, and the product page's best-price card shows it: BestPriceCard.tsx); nothing counts it (the title's store
// count, the median).
// The store rows are decided here, on the server (StoreRowData); the browser's list renders them and places the eBay row among them.
//
// The growth release: the first eight rows of the ranked list show (lib/ebay-offer-row.ts VISIBLE_ROWS), the rest sit in two server-rendered
// <details> (more open rows; then the sold-out and not-checked ones), so every link stays in the HTML. One red button only, on the cheapest
// open row; the other open rows get the quieter .btn-soft, sold-out rows .btn-ghost. On a phone a row is three short lines (88 px): the
// store and its stock pill, the price, the host and when it was read, the button beside the last two. The long explanations sit in one
// "How these prices work" <details> under the table; the labels that belong next to a link ("affiliate link", "Ad") stay beside it.

export function OfferTable({
  offers,
  region,
  preorder,
  packs = null,
  ebay = null,
  notes = [],
  placement = "product-table",
  top = null,
  numbered = false,
  bestLabel,
  ranked,
  pinned = null,
}: {
  offers: OfferView[];
  region: Region;
  preorder: boolean;
  /** Booster packs per unit (src/lib/packs.ts), for a per-pack price under each row's price. Null = not shown. */
  packs?: number | null;
  /** The product's eBay row: its slug (its own listings), the eBay search used when it has none, the store-price floor and the pack count
   *  listings are checked against (lib/ebay-offer-row.ts rowPacks). Null = no eBay row. */
  ebay?: { slug: string; query: string; floor: PriceFloor | null; packs: number | null } | null;
  /** The page's own explanations (shipping, TCGplayer, per pack, MSRP), first in "How these prices work". */
  notes?: string[];
  /** Whose buttons these are, for the affiliate sub-id and buy_click: the product page's table unless a page says otherwise (the pre-order page: "preorders"). */
  placement?: Placement;
  /** Rows pinned at the top of the card, above the ranked rows (the pre-order page's marketplace rows and its "Stores" label). */
  top?: ReactNode;
  /** Number the open rows 1, 2, 3… in price order (the pre-order page). The product page's table is not numbered. */
  numbered?: boolean;
  /** The cheapest open row's badge, when "Best price" would say more than the table knows (the pre-order page: "Cheapest" on a phone,
   *  "Cheapest store" from sm, so a long store name keeps its room). */
  bestLabel?: { short: string; full: string };
  /** The footer's ranking sentence, when the page ranks differently from "In stock first, then cheapest." */
  ranked?: string;
  /**
   * The product page (with `ebay`): eBay and TCGplayer pinned at the top, eBay first, TCGplayer second, then the stores (owner,
   * 2026-10-26). TCGplayer's row is its offer among `offers` in the US; elsewhere `tcgplayer`, the US$ offer (usMarketplace), shown in US$
   * and never the best price; with neither, a TCGplayer search. Null: TCGplayer, if among `offers`, ranks with the stores.
   */
  pinned?: { productName: string; tcgplayer: TcgplayerMatch | null } | null;
}) {
  const r = REGIONS[region];
  const { rows, tcg, amazon, storeOffers } = offerRowsData({ offers, region, packs, placement, numbered, bestLabel, pinned: ebay ? pinned : null });
  const footer = tableFooter(!!ebay);
  return (
    <>
      {/* The tax line and the ranking switch: server-rendered at "Price"; the switch re-ranks the rows in the browser (OfferRows.tsx). */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="text-xs text-muted">{r.taxNote}</p>
        <ShippingToggle />
      </div>
      <div className="card overflow-hidden">
        {top}
        {ebay ? (
          <OfferRowsWithEbay rows={rows} tcg={tcg} amazon={amazon} region={region} slug={ebay.slug} query={ebay.query} floor={ebay.floor} packs={ebay.packs} allowBest={!preorder} preorder={preorder} />
        ) : (
          <StoreRows rows={rows} preorder={preorder} />
        )}
        <p className="border-t border-line px-4 py-2.5 text-xs text-muted sm:px-5">
          {ranked ?? footer.ranked}{" "}
          <Link href="/about" prefetch={false} className="underline underline-offset-2 hover:text-ink">
            {footer.noPay}
          </Link>
          {footer.ad && ` ${footer.ad}`}
        </p>
      </div>
      <HowPricesWork>
        {notes.length > 0 && <p>{notes.join(" ")}</p>}
        <p>
          Shipping beside a price is what that store&rsquo;s own checkout quoted, measured weekly, for one item around that price to{" "}
          {addressCount(r.market)} {addressCount(r.market) === 1 ? "address" : "addresses"} in {r.inName}; a range means it depends on where you
          are (or the order value). &ldquo;{SHIP_UNKNOWN}&rdquo; means we have no measurement for that store. &ldquo;Price + shipping&rdquo; ranks
          by the price plus the cheapest measured shipping, stores without a measurement after the rest. The store&rsquo;s checkout is final.{" "}
          {r.taxNote} {DUTIES_NOTE}
        </p>
        <p>
          Prices are each store&rsquo;s own, in {r.currency}, read from their public product listings about twice a day; each row says when.
          &ldquo;Not checked recently&rdquo; means we couldn&rsquo;t read that store for over three days, so its stock is unknown. No store pays
          to be listed or to rank higher: <Link href="/about" prefetch={false} className="underline underline-offset-2 hover:text-ink">how MTG Compare works</Link>.
          {tcg && " TCGplayer is a US marketplace of many sellers, pinned under eBay; its link is an affiliate link, and outside the US its price is in US$ and never compared with the stores'."}
          {amazon && ` ${amazon.name} is pinned under TCGplayer as a search: we don't read Amazon's prices, so it is never ranked or the best price, and its link is an affiliate link. ${AMAZON_DISCLOSURE}`}
          {storeOffers.some((o) => o.marketplace) && " TCGplayer is a marketplace of many sellers; it ranks by price and stock like any store, and its link is an affiliate link."}
        </p>
        {ebay && <p>{ebayRowNote(region).trim()}</p>}
      </HowPricesWork>
    </>
  );
}

/**
 * The table's rows as data, decided on the server (StoreRowData): the stores, and with `pinned` the TCGplayer and Amazon rows. Shared by
 * OfferTable and the tile quick view (/api/quick/<region>/<slug>, components/QuickView.tsx), so both draw the same rows in the same order.
 */
export function offerRowsData({
  offers,
  region,
  packs = null,
  placement = "product-table",
  numbered = false,
  bestLabel,
  pinned = null,
}: {
  offers: OfferView[];
  region: Region;
  packs?: number | null;
  placement?: Placement;
  numbered?: boolean;
  bestLabel?: { short: string; full: string };
  /** OfferTable passes it only with an eBay row (the product page). */
  pinned?: { productName: string; tcgplayer: TcgplayerMatch | null } | null;
}) {
  const r = REGIONS[region];
  const now = Date.now();
  const pin = pinned;
  const tcgOffer = pin ? offers.find((o) => o.marketplace) ?? null : null;
  const storeOffers = tcgOffer ? offers.filter((o) => o !== tcgOffer) : offers;
  const cheapestOpen = storeOffers.find((o) => offerStock(o, now) === "open");
  // Each row as data (prices formatted, stock state and links decided here, on the server): the browser's list (OfferRowsWithEbay)
  // renders the rows from it. Passing data, not rendered rows, keeps the page's RSC payload small: a row is ~350 bytes of data where
  // its element tree was ~1.5 KB, on top of the same row in the HTML.
  let rank = 0;
  const rows: StoreRowData[] = storeOffers.map((o) => {
    const state = offerStock(o, now);
    const link = offerLink(o.store, o.url, region, placement);
    const open = state === "open";
    return {
      ...(numbered && open ? { rank: ++rank } : {}),
      ...(bestLabel && o === cheapestOpen ? { badge: bestLabel } : {}),
      key: o.store,
      cents: o.priceCents,
      open,
      state,
      best: o === cheapestOpen,
      name: o.storeName,
      host: o.storeHost,
      title: o.title,
      marketplace: o.marketplace,
      href: link.href,
      rel: link.rel,
      sponsored: link.sponsored,
      retailer: offerRetailer(o.store, o.storeName, r.market),
      placement,
      price: money(o.priceCents, r.market),
      // packs.ts perPackCents, inlined: this module is also in the browser's bundle (StoreRow), and packs.ts brings sets.ts and the
      // title classifier with it
      perPack: packs && open && o.priceCents > 0 ? money(Math.round(o.priceCents / packs), r.market) : null,
      lastSeen: o.lastSeen,
      ago: timeAgo(o.lastSeen, now),
      ship: o.marketplace ? null : shippingCell(o.store, r.market, o.priceCents, (c) => money(c, r.market)),
    };
  });
  const tcg = pin ? tcgRow(tcgOffer, pin, region, placement, now) : null;
  const amazon = pin ? amazonRow(pin.productName, region, now) : null;
  return { rows, tcg, amazon, storeOffers };
}

/**
 * The pinned TCGplayer row (OfferTable `pinned`), as store-row data: in the US its offer, ranked by nothing but shown second, and the best
 * price when cheapest; elsewhere its US$ offer, labelled and never compared; with no match, a search. TCGplayer's ink button either way.
 */
function tcgRow(offer: OfferView | null, pin: { productName: string; tcgplayer: TcgplayerMatch | null }, region: Region, placement: Placement, now: number): StoreRowData {
  const r = REGIONS[region];
  const us = r.market === "US";
  const base = { key: TCGPLAYER_KEY, name: "TCGplayer", marketplace: true, retailer: TCGPLAYER_RETAILER, placement, kind: "tcgplayer" as const, perPack: null, ship: null };
  const m: TcgplayerMatch | null = offer ?? (us ? null : pin.tcgplayer);
  if (!m) {
    return {
      ...base,
      cents: 0,
      open: true,
      state: "open",
      best: false,
      host: "tcgplayer.com",
      title: `Search TCGplayer for ${pin.productName}`,
      href: tcgplayerSearchUrl(pin.productName, region, placement),
      rel: REL_SPONSORED,
      sponsored: true,
      price: "",
      lastSeen: new Date(now).toISOString(),
      ago: "",
      search: true,
      ...(us ? {} : { note: "US marketplace, prices in US$" }),
    };
  }
  const state = offerStock(m, now);
  const link = offerLink(TCGPLAYER_KEY, m.url, region, placement);
  return {
    ...base,
    cents: m.priceCents,
    open: state === "open",
    state,
    best: false,
    host: offer?.storeHost ?? "tcgplayer.com",
    title: m.title,
    href: link.href,
    rel: link.rel,
    sponsored: link.sponsored,
    price: us ? money(m.priceCents, "US") : usd(m.priceCents),
    lastSeen: m.lastSeen,
    ago: timeAgo(m.lastSeen, now),
    ...(us ? {} : { comparable: false, note: "US$, ships from the US" }),
  };
}

/**
 * The pinned Amazon row (owner, 2026-10-29: Amazon on every site, like the eBay and TCGplayer rows), where the region has an Amazon tag
 * (lib/amazon.ts): a search for the product on the region's Amazon, no price, never ranked or the best price.
 */
function amazonRow(productName: string, region: Region, now: number): StoreRowData | null {
  const a = amazonFor(region);
  if (!a) return null;
  const l = amazonLabel(region);
  return {
    key: "amazon",
    kind: "amazon",
    name: l.name,
    marketplace: true,
    retailer: a.retailer,
    placement: "amazon-table",
    amazon: { product: productName, region, page: "product" },
    perPack: null,
    ship: null,
    cents: 0,
    open: true,
    state: "open",
    best: false,
    host: a.host.replace(/^www\./, ""),
    title: `Search ${a.retailer} for ${productName}`,
    href: amazonUrl(productName, { region, placement: "amazon-table" }),
    rel: REL_AMAZON,
    sponsored: true,
    price: "",
    lastSeen: new Date(now).toISOString(),
    ago: "",
    search: true,
    searchText: "Amazon’s own price",
    ...(region === "nz" || region === "sg" ? { note: "check delivery" } : {}),
  };
}

/** The long explanations, collapsed under the table: one tap away, all in the HTML. */
function HowPricesWork({ children }: { children: ReactNode }) {
  return (
    <details className="group/how mt-3 text-xs text-muted">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-lg font-semibold text-ink hover:text-brand-strong [&::-webkit-details-marker]:hidden">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" />
        </svg>
        How these prices work
        <Chevron className="group-open/how:rotate-180" />
      </summary>
      <div className="max-w-3xl space-y-2 pb-1 leading-5">{children}</div>
    </details>
  );
}

