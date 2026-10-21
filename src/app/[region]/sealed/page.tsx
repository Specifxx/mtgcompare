import type { Metadata } from "next";
import { regionOrNotFound } from "@/lib/regions";
import { BrowsePage, browseMeta } from "./Browse";

// Rendered per request and kept by Vercel's CDN for a day (next.config.js, CDN_PAGES), never ISR: an ISR write
// costs about twenty renders, and the data only changes with a release, which empties the CDN anyway.
export const dynamic = "force-dynamic";

export function generateMetadata({ params }: { params: { region: string } }): Metadata {
  return browseMeta(regionOrNotFound(params.region), 1);
}

export default function SealedPage({ params }: { params: { region: string } }) {
  return <BrowsePage r={regionOrNotFound(params.region)} page={1} />;
}
