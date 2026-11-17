"use client";

import type { TcgplayerTile } from "@/lib/data";
import type { Region } from "@/lib/regions";
import { InlineAds } from "../InlineAds";
import { useSuggestedRegion } from "../RegionSuggest";

// The landing page's eBay + TCGplayer banner pair (owner, 2026-11-17: "where are the ads on the home page"): the same two big banners the
// region homes and every other page carry (components/InlineAds.tsx: the YGO-style pair, labelled "Ad", sponsored links, browser-only,
// heights reserved), directly under the hero. The region follows the visitor (RegionSuggest.tsx: the US until known, then the region they
// browse), so the eBay banner is their own eBay site; the banners keep their heights when it changes. Replaces the smaller one-box block
// of 2026-11-03, which sat under the products and drew almost no clicks (7-day buy clicks: all ad blocks under 3%, the price rows 90%).
export function LandingAds({ tcg, className = "" }: { tcg: TcgplayerTile[]; className?: string }) {
  const suggested = useSuggestedRegion();
  const region: Region = suggested.region ?? "us";
  return <InlineAds key={region} region={region} tiles={tcg} className={className} />;
}
