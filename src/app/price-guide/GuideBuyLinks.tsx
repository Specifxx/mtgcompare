"use client";

import { affiliateUrl, cardEbayQuery, ebaySearchUrl, outboundRel } from "@/lib/affiliate";
import { useCountry } from "@/components/CountryProvider";

// A price-guide row's two buy buttons (RiftCompare's price guide: TCGplayer and
// eBay on every row): the card's TCGplayer product page through the Impact
// link, and an EPN-tagged eBay search for the card on the visitor's own eBay.
// A client island fed a few raw fields, so the long affiliate URLs are built
// here instead of being serialised twice per row (HTML + RSC payload) for 100
// rows a page. Card ids are TCGplayer product ids (lib/catalog.ts).
export function GuideBuyLinks({
  id,
  slug,
  name,
  number,
  variant,
  tcg,
}: {
  id: number;
  slug: string;
  name: string;
  number: string | null;
  variant: string | null;
  /** TCGplayer's market price, formatted (US$), or null. */
  tcg: string | null;
}) {
  const { country } = useCountry();
  const tcgHref = affiliateUrl(`https://www.tcgplayer.com/product/${id}`, "tcgplayer", "/price-guide");
  const ebayHref = ebaySearchUrl(country, cardEbayQuery({ name, number, variant }), "price-guide");
  return (
    <span className="flex flex-col gap-1 xl:flex-row xl:justify-end">
      <a
        href={tcgHref}
        target="_blank"
        rel={outboundRel()}
        data-retailer="tcgplayer"
        data-page="price-guide"
        data-card={slug}
        data-surface="price_guide_tcgplayer"
        className="btn-ghost min-h-8 w-full gap-1 whitespace-nowrap px-2 py-1 text-[11px] xl:w-auto"
        aria-label={`${name}${variant ? ` (${variant})` : ""} on TCGplayer`}
      >
        <span className="font-extrabold">TCGplayer</span>
        {tcg ? <span className="num hidden font-semibold text-slate-300 sm:inline">{tcg}</span> : null}
      </a>
      <a
        href={ebayHref}
        target="_blank"
        rel={outboundRel()}
        data-retailer="ebay_search"
        data-page="price-guide"
        data-card={slug}
        data-surface="price_guide_ebay"
        className="btn-ebay-ghost min-h-8 w-full gap-1 whitespace-nowrap px-2 py-1 text-[11px] xl:w-auto"
        aria-label={`Search eBay for ${name}${variant ? ` (${variant})` : ""}`}
      >
        <span className="font-extrabold">eBay</span>
        <span className="font-semibold">Search</span>
      </a>
    </span>
  );
}
