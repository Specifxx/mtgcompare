import type { Metadata } from "next";
import { regionOrNotFound } from "@/lib/regions";
import { pageNumber, StorePage, storeInRegion, storeMeta } from "../../StoreListing";

// Rendered per request and kept by Vercel's CDN for a day (next.config.js, CDN_PAGES), never ISR: an ISR write
// costs about twenty renders, and the data only changes with a release, which empties the CDN anyway.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { region: string; store: string; n: string } }): Promise<Metadata> {
  const r = regionOrNotFound(params.region);
  return storeMeta(r, storeInRegion(params.store, r), pageNumber(params.n));
}

export default function StorePageN({ params }: { params: { region: string; store: string; n: string } }) {
  const r = regionOrNotFound(params.region);
  return <StorePage r={r} s={storeInRegion(params.store, r)} page={pageNumber(params.n)} />;
}
