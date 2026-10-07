// The sealed QuickView's data (components/SealedQuickView.tsx, GET /api/sealed/[slug]):
// one product's facts and every market's offers, market-independent so one cached
// response serves every visitor and a market switch needs no second request.
// Links are affiliate-tagged HERE, on the server. Pure; tests/sealed-offers.test.ts.
import { affiliateUrl, ebaySearchUrl, onePieceEbayQuery } from "./affiliate";
import { retailerSubId } from "./board";
import { COUNTRIES, MARKETS, type Country } from "./country";
import type { SealedDetail } from "./data";
import { isPreRelease } from "./quick-view";
import { isEbaySource, sourceLabel } from "./stores";

export interface SealedQvOffer {
  productId: number;
  source: string;
  label: string;
  retailer: string;
  priceCents: number;
  shippingCents: number | null;
  inStock: boolean;
  /** ISO of the importer's last successful read (offerStock's staleness rule). */
  lastSeen: string;
  href: string;
  ebay: boolean;
}

export interface SealedQvMarket {
  /** Offers in this market's own currency, in-stock and sold out alike (the modal ranks them). */
  offers: SealedQvOffer[];
  ebaySearch: string;
}

export interface SealedQvPayload {
  id: number;
  slug: string;
  name: string;
  kind: string;
  imageUrl: string | null;
  packCount: number | null;
  presale: boolean;
  preRelease: boolean;
  set: { code: string; name: string; slug: string } | null;
  marketUsd: number | null;
  tcgHref: string;
  markets: Record<Country, SealedQvMarket>;
}

export function sealedQuickViewPayload(
  s: Omit<SealedDetail, "low" | "stores">,
  set: { code: string; name: string; slug: string } | null,
  today: string = new Date().toISOString().slice(0, 10),
): SealedQvPayload {
  const loc = `/sealed/${s.slug}`;
  const markets = {} as Record<Country, SealedQvMarket>;
  for (const m of MARKETS) {
    const cur = COUNTRIES[m].currency;
    markets[m] = {
      offers: s.offers
        .filter((o) => o.market === m && o.currency === cur)
        .map((o) => ({
          productId: s.id,
          source: o.source,
          label: sourceLabel(o.source, m),
          retailer: retailerSubId(o.source),
          priceCents: o.priceCents,
          shippingCents: o.shippingCents,
          inStock: o.inStock,
          lastSeen: o.updatedAt,
          href: affiliateUrl(o.url, retailerSubId(o.source), loc),
          ebay: isEbaySource(o.source),
        })),
      ebaySearch: ebaySearchUrl(m, onePieceEbayQuery(s.name), "sealed-quickview"),
    };
  }
  return {
    id: s.id,
    slug: s.slug,
    name: s.name,
    kind: s.kind,
    imageUrl: s.imageUrl,
    packCount: s.packCount,
    presale: s.presale,
    preRelease: s.presale || isPreRelease(s.releasedOn, today),
    set,
    marketUsd: s.marketUsd,
    tcgHref: affiliateUrl(s.tcgplayerUrl, "tcgplayer", loc),
    markets,
  };
}
