import type { Metadata } from "next";
import { regionOrNotFound } from "@/lib/regions";
import { BrowsePage, browseMeta, pageNumber } from "../../Browse";

// Rendered per request and kept by Vercel's CDN for a day (next.config.js, CDN_PAGES), never ISR: an ISR write
// costs about twenty renders, and the data only changes with a release, which empties the CDN anyway.
export const dynamic = "force-dynamic";

export function generateMetadata({ params }: { params: { region: string; n: string } }): Metadata {
  return browseMeta(regionOrNotFound(params.region), pageNumber(params.n));
}

export default function SealedPageN({ params }: { params: { region: string; n: string } }) {
  return <BrowsePage r={regionOrNotFound(params.region)} page={pageNumber(params.n)} />;
}
