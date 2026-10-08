import type { Metadata } from "next";
import { regionMetadata } from "@/lib/home-metadata";
import { RegionHome } from "@/components/home/RegionHome";

// The CA region home (RiftCompare's /ca): the homepage body locked to one
// market, with reciprocal hreflang. Rendered per request over the published files like "/" (contract 12.7), held by the CDN header of headers.json.
export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return regionMetadata("CA");
}

export default function CAHomePage() {
  return <RegionHome region="CA" />;
}
