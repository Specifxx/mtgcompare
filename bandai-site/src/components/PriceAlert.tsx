"use client";
// The card page's price alert (components/PriceAlertForm.tsx) in the
// visitor's market: the server passes every market's lowest in-stock store
// price (lib/alert-feed.ts lowestByMarket), the market is picked client-side
// like the rest of the page.
import { useMarket } from "./ClientPrefs";
import { PriceAlertForm } from "./PriceAlertForm";
import type { Market } from "@/lib/site-types";

export function PriceAlert({ site, productId, prices }: { site: string; productId: number; prices: Partial<Record<Market, number>> }) {
  const { market } = useMarket();
  return <PriceAlertForm key={market} site={site} productId={String(productId)} region={market} priceCents={prices[market] ?? null} className="mt-3 text-sm" />;
}
