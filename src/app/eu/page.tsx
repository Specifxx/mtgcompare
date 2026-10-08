import type { Metadata } from "next";
import { regionMetadata } from "@/lib/home-metadata";
import { RegionHome } from "@/components/home/RegionHome";

// The EU region home (RiftCompare's /eu): the homepage body locked to one
// market, with reciprocal hreflang. Rendered per request over the published files like "/" (contract 12.7), held by the CDN header of headers.json.
export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return regionMetadata("EU");
}

export default function EUHomePage() {
  return <RegionHome region="EU" />;
}
