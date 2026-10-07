"use client";

import { TodaysTopDeals } from "@/components/TodaysTopDeals";
import { useCountry } from "@/components/CountryProvider";
import type { Country } from "@/lib/country";
import type { TopDeals } from "@/lib/top-deals";

// The cached homepage carries Today's Top Deals for all six markets
// (RiftCompare's dealsByCountry) and shows the visitor's — switching market in
// the header swaps the columns without a reload. A region home locks its own.
export function HomeTopDeals({ dealsByCountry, lockCountry }: { dealsByCountry: Record<Country, TopDeals>; lockCountry?: Country }) {
  const { country: ctx } = useCountry();
  const country = lockCountry ?? ctx;
  const deals = dealsByCountry[country];
  if (!deals || (!deals.savings.length && !deals.drops.length && !deals.rising.length)) return null;
  return <TodaysTopDeals key={country} deals={deals} />;
}
