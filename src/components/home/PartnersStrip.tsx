"use client";

import { AffiliateDisclosure } from "@/components/AffiliateDisclosure";
import { affiliateUrl, ebaySearchUrl, outboundRel } from "@/lib/affiliate";
import { useCountry } from "@/components/CountryProvider";

// RiftCompare's PartnersStrip: "Approved partners" with the eBay and TCGplayer
// wordmarks (affiliate search links in the visitor's market) and the
// disclosure line.
export function PartnersStrip() {
  const { country } = useCountry();
  const ebayHref = ebaySearchUrl(country, "Magic The Gathering cards", "partners_strip");
  const tcgHref = affiliateUrl("https://www.tcgplayer.com/search/magic/product?productLineName=magic", "partners_strip", "/");
  return (
    <section className="flex flex-col items-center gap-1 text-center">
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-slate-500">
        <span className="uppercase tracking-wide">Approved partners</span>
        <a
          href={ebayHref}
          target="_blank"
          rel={outboundRel()}
          data-retailer="ebay_search"
          data-page="home"
          className="tap-link text-lg font-extrabold lowercase leading-none transition-opacity hover:opacity-80"
          aria-label="eBay Partner Network"
        >
          <span style={{ color: "#e53238" }}>e</span>
          <span style={{ color: "#0064d2" }}>b</span>
          <span style={{ color: "#f5af02" }}>a</span>
          <span style={{ color: "#86b817" }}>y</span>
        </a>
        <a
          href={tcgHref}
          target="_blank"
          rel={outboundRel()}
          data-retailer="tcgplayer"
          data-page="home"
          className="tap-link text-base font-extrabold leading-none text-white transition-opacity hover:opacity-80"
          aria-label="TCGplayer"
        >
          TCG<span className="text-sky-400">player</span>
        </a>
      </div>
      <AffiliateDisclosure partner="both" tight className="mx-auto max-w-2xl text-center" />
    </section>
  );
}
