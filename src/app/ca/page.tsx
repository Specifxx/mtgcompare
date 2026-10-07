import type { Metadata } from "next";
import { regionMetadata } from "@/lib/home-metadata";
import { RegionHome } from "@/components/home/RegionHome";

// The CA region home (RiftCompare's /ca): the homepage body locked to one
// market, with reciprocal hreflang. Static like "/" (ISR, hourly).
export const revalidate = 3600;

export function generateMetadata(): Promise<Metadata> {
  return regionMetadata("CA");
}

export default function CAHomePage() {
  return <RegionHome region="CA" />;
}
