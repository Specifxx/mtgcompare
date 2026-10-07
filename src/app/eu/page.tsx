import type { Metadata } from "next";
import { regionMetadata } from "@/lib/home-metadata";
import { RegionHome } from "@/components/home/RegionHome";

// The EU region home (RiftCompare's /eu): the homepage body locked to one
// market, with reciprocal hreflang. Static like "/" (ISR, hourly).
export const revalidate = 3600;

export function generateMetadata(): Promise<Metadata> {
  return regionMetadata("EU");
}

export default function EUHomePage() {
  return <RegionHome region="EU" />;
}
