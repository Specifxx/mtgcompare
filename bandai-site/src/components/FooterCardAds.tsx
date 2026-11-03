"use client";
// The site-wide pair of card ad strips above the footer, on every page that
// has no strips of its own: the homepage, set and card pages place theirs in
// the page, and the policy pages carry none (an ad under a privacy policy
// reads as a page built around the ads).
import { usePathname } from "next/navigation";
import type { CardAds } from "@/lib/card-ads";
import { CardAdPair } from "./CardAds";

// Model-kit pages (SITE.kits) carry eBay ads of the kits themselves
// (components/KitAds.tsx) since 2026-10-29: card ads were a poor fit there.
const OWN_STRIPS = [/^\/$/, /^\/card\//, /^\/sets\/[^/]+$/, /^\/kits?(\/|$)/];
const NO_ADS = ["/about", "/privacy", "/terms", "/contact", "/methodology"];

export function footerStripsAllowed(pathname: string | null): boolean {
  if (!pathname) return false;
  if (OWN_STRIPS.some((r) => r.test(pathname))) return false;
  return !NO_ADS.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

export function FooterCardAds({ ads, ebayQuery, tcgplayerUrl }: { ads: CardAds; ebayQuery: string; tcgplayerUrl: string }) {
  const pathname = usePathname();
  if (!footerStripsAllowed(pathname)) return null;
  return (
    <div className="mx-auto max-w-7xl px-4 pb-8">
      <CardAdPair ads={ads} page="footer" ebayQuery={ebayQuery} tcgplayerUrl={tcgplayerUrl} />
    </div>
  );
}
