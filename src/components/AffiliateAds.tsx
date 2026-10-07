"use client";

import { usePathname } from "next/navigation";
import { affiliateUrl, ebayLabel, ebaySearchUrl, outboundRel } from "@/lib/affiliate";
import { useCountry } from "./CountryProvider";

// RiftCompare's footer ad zone: an eBay box and a TCGplayer box above the
// footer, labelled "Ad", with one disclosure line. Both are affiliate SEARCH /
// category links — no eBay API call is involved (API prices come only from the
// script-side eBay pass, scripts/ebay.ts). Not shown on the policy pages,
// nor to Plus and Premium members (data-ad-placement, lib/ad-free.ts).
const BANNER_FREE = ["/about", "/authors", "/contact", "/editorial-policy", "/methodology", "/privacy", "/terms"];

const TCGPLAYER_ONE_PIECE = "https://www.tcgplayer.com/search/one-piece-card-game/product?productLineName=one-piece-card-game&view=grid";

export function EbayWordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-sans text-xl font-bold tracking-tight ${className}`} aria-label="eBay">
      <span className="text-[#e53238]">e</span>
      <span className="text-[#0064d2]">b</span>
      <span className="text-[#f5af02]">a</span>
      <span className="text-[#86b817]">y</span>
    </span>
  );
}

export function AdBox({ href, retailer, children, tone }: { href: string; retailer: string; children: React.ReactNode; tone: string }) {
  return (
    <a href={href} target="_blank" rel={outboundRel()} data-retailer={retailer} data-page="footer" className={`relative block w-full max-w-3xl rounded-lg border px-4 pb-4 pt-6 transition-colors sm:px-6 ${tone}`}>
      <span className="absolute left-2 top-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Ad</span>
      <span className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-center">{children}</span>
    </a>
  );
}

export function FooterAds() {
  const pathname = usePathname() ?? "/";
  const { country } = useCountry();
  if (BANNER_FREE.some((r) => pathname === r || pathname.startsWith(`${r}/`))) return null;
  return (
    <div className="container-app flex flex-col items-center gap-3 pb-6 pt-10" data-ad-placement="footer">
      <AdBox href={ebaySearchUrl(country, "One Piece Card Game", "footer-ad")} retailer="ebay_search" tone="border-[#e53238]/30 bg-[#e53238]/[0.04] hover:border-[#e53238]/60">
        <EbayWordmark />
        <span className="text-left">
          <span className="block text-sm font-bold text-white">Shop One Piece cards on {ebayLabel(country)}</span>
          <span className="block text-xs text-slate-400">Singles, graded slabs and sealed from sellers worldwide</span>
        </span>
        <span className="rounded bg-[#0064d2] px-2.5 py-1 text-xs font-bold text-[#ffffff]">Search eBay →</span>
      </AdBox>
      <AdBox href={affiliateUrl(TCGPLAYER_ONE_PIECE, "tcgplayer_footer", "/footer")} retailer="tcgplayer_footer" tone="border-sky-400/30 bg-sky-400/[0.04] hover:border-sky-400/60">
        <span className="text-xl font-extrabold tracking-tight text-white">
          TCG<span className="text-sky-400">player</span>
        </span>
        <span className="text-left">
          <span className="block text-sm font-bold text-white">Shop One Piece singles &amp; sealed</span>
          <span className="block text-xs text-slate-400">The biggest US marketplace for the One Piece Card Game</span>
        </span>
        <span className="rounded bg-sky-500 px-2.5 py-1 text-xs font-bold text-[#04121c]">Shop now →</span>
      </AdBox>
      <p className="max-w-2xl text-center text-[11px] leading-snug text-slate-500">
        Affiliate links: as an eBay Partner Network affiliate and a TCGplayer affiliate, OP Compare earns from qualifying purchases — at no extra cost to you.
      </p>
    </div>
  );
}
