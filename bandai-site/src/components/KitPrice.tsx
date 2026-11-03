"use client";
// A kit tile's price for the visitor's market (pages are cached for everyone,
// so the market is picked here): the cheapest in-stock offer there, else the
// cheapest elsewhere in its own currency, marked as another market's.
import type { Offer } from "@/lib/site-types";
import { money } from "@/lib/format";
import { useMarket } from "./ClientPrefs";

export function KitPrice({ best }: { best: Offer[] }) {
  const { market } = useMarket();
  const own = best.find((o) => o.market === market);
  if (own) return <span>{money(own.cents, own.currency)}</span>;
  const other = best[0];
  if (!other) return <span className="text-sm font-normal text-muted">Out of stock</span>;
  return (
    <span className="text-sm">
      {money(other.cents, other.currency)} <span className="text-[11px] font-normal text-muted">in {other.market}</span>
    </span>
  );
}
