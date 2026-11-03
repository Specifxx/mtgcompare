"use client";
// The cheapest live eBay listing for this card in the visitor's market (eBay
// US where there is no local eBay result), above the price table. eBay is the
// widest source for singles, so it gets its own call-out and button.
import { goHref, ebaySearchUrl } from "@/lib/affiliate";
import { money } from "@/lib/format";
import type { Offer } from "@/lib/site-types";
import { useMarket } from "./ClientPrefs";

export function EbayWord({ className = "" }: { className?: string }) {
  return (
    <span className={`font-black tracking-tight ${className}`} aria-label="eBay">
      <span style={{ color: "#e53238" }}>e</span><span style={{ color: "#0064d2" }}>b</span><span style={{ color: "#f5af02" }}>a</span><span style={{ color: "#86b817" }}>y</span>
    </span>
  );
}

export function EbayCallout({ offers, productId, query }: { offers: Offer[]; productId: number; query: string }) {
  const { market } = useMarket();
  const ebay = offers.filter((o) => o.source === "ebay" && o.inStock);
  const pick = ebay.filter((o) => o.market === market).sort((a, b) => a.cents - b.cents)[0] ?? ebay.filter((o) => o.market === "US").sort((a, b) => a.cents - b.cents)[0];
  const searchMarket = market === "UK" || market === "AU" || market === "CA" ? market : "US";
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-[#0064d2]/40 bg-[#0064d2]/10 px-4 py-3">
      <EbayWord className="text-2xl" />
      {pick ? (
        <p className="flex-1 text-sm">
          Cheapest Buy It Now{pick.market !== market ? " (eBay US)" : ""}: <b className="text-base">{money(pick.cents, pick.currency)}</b>
          {pick.shippingCents ? <span className="text-muted"> + {money(pick.shippingCents, pick.currency)} shipping</span> : pick.shippingCents === 0 ? <span className="text-muted"> · free shipping</span> : null}
        </p>
      ) : (
        <p className="flex-1 text-sm text-muted">No matching Buy It Now listing on our last check.</p>
      )}
      {pick && (
        <a href={goHref(pick, productId, "card-ebay")} rel="sponsored nofollow noopener" target="_blank" className="btn bg-[#0064d2] px-4 py-2 text-white hover:bg-[#0053ad]">
          Buy on eBay
        </a>
      )}
      <a href={goHref({ url: ebaySearchUrl(query, searchMarket), source: "ebay", market: searchMarket }, productId, "card-ebay-search")} rel="sponsored nofollow noopener" target="_blank" className="text-sm text-[#4f9bff] hover:underline">
        All eBay listings →
      </a>
    </div>
  );
}
