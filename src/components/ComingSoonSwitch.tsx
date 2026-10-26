"use client";

// The landing page's "Coming soon" block: every region's data worked out on the server (seven small lists), the default region's in
// the server HTML, then the visitor's suggested region (RegionSuggest.tsx useSuggestedRegion) in the browser, with no fetch. The list
// keeps the height of the longest region's, so the swap moves nothing below it.
import type { Featured } from "@/lib/coming-soon";
import { REGIONS, X_DEFAULT_REGION, type Region } from "@/lib/regions";
import { ComingSoon } from "./ComingSoon";
import { useSuggestedRegion } from "./RegionSuggest";

export function ComingSoonSwitch({ byRegion, today }: { byRegion: Partial<Record<Region, Featured>>; today: string }) {
  const suggested = useSuggestedRegion();
  const want: Region = suggested.known ? suggested.region ?? X_DEFAULT_REGION : X_DEFAULT_REGION;
  const region: Region = byRegion[want] ? want : X_DEFAULT_REGION;
  const featured = byRegion[region] ?? null;
  const slots = Math.max(1, ...Object.values(byRegion).map((f) => f?.items.length ?? 0));
  return <ComingSoon featured={featured} r={REGIONS[region]} today={today} slots={slots} />;
}
