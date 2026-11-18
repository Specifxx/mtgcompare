import { ogCard, OG_SIZE } from "@/lib/og-card";
import { regionOrNotFound } from "@/lib/regions";
import { dealPct, dealsBySection, dealsCopy } from "@/lib/deals";

// The deals page's share image (owner, 2026-11-18: "we need more shareable artefacts"): today's deal count and the
// biggest gap under the store median in this region, the page's own numbers (lib/deals.ts). One image per region,
// drawn on its first request after a release and kept until the next one (no params listed: nothing reads
// data at build), text and the logo only like the site card (lib/og-card.tsx), no product photo.

export const alt = "Today's sealed deals: products priced under the median of 3 or more stores";
export const size = OG_SIZE;
export const contentType = "image/png";

export function generateStaticParams() {
  return [];
}

export default async function OG({ params }: { params: { region: string } }) {
  const r = regionOrNotFound(params.region);
  let count = 0;
  let best: number | null = null;
  try {
    const deals = (await dealsBySection(r.market)).flatMap((s) => s.deals);
    count = deals.length;
    best = deals.length ? Math.max(...deals.map(dealPct)) : null;
  } catch {
    /* the plain card below */
  }
  return ogCard({
    lines: [
      ["Today's deals", false],
      [`in ${r.inName}`, false],
      [best ? `up to ${best}% under` : "cheapest per pack", true],
    ],
    sub: count ? dealsCopy.summary(count, best) : "Checked twice a day across every store we track",
    chips: [r.short, r.currency],
    tag: "Deals",
    size: 60,
  });
}
