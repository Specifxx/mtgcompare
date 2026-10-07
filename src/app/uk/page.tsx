import type { Metadata } from "next";
import { regionMetadata } from "@/lib/home-metadata";
import { RegionHome } from "@/components/home/RegionHome";

// The UK region home (RiftCompare's /uk): the homepage body locked to one
// market, with reciprocal hreflang. Static like "/" (ISR, hourly).
export const revalidate = 3600;

export function generateMetadata(): Promise<Metadata> {
  return regionMetadata("UK");
}

export default function UKHomePage() {
  return <RegionHome region="UK" />;
}
