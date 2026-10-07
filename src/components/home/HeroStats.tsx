"use client";

import { useEffect, useState } from "react";
import { useCountry } from "@/components/CountryProvider";
import type { Country } from "@/lib/country";
import { ago } from "@/lib/format";
import type { MarketStat } from "@/lib/home";

// RiftCompare's HeroStats: one quiet line under the hero — "N cards · N US
// stores · ● prices updated Xh ago". The page is cached (ISR, one HTML for
// every market), so the store count follows the visitor's market from
// CountryProvider here, and a region home locks it to its own market.
// No count-up animation (RiftCompare dropped it: a moving number in the hero
// competed with the H1).
export function HeroStats({
  totalCards,
  statsByCountry,
  updatedAt,
  renderedAt,
  lockCountry,
}: {
  totalCards: number;
  statsByCountry: Record<Country, MarketStat>;
  updatedAt: string | null;
  renderedAt: string;
  lockCountry?: Country;
}) {
  const { country: switcherCountry } = useCountry();
  const country = lockCountry ?? switcherCountry;
  const s = statsByCountry[country] ?? statsByCountry.US;
  const storeWord = s.stores === 1 ? "store" : "stores";
  return (
    <div className="mt-3 text-center">
      <p className="num text-xs text-slate-500 sm:text-sm">
        {totalCards.toLocaleString("en-US")} cards · {s.stores.toLocaleString("en-US")} {country} {storeWord}
        {updatedAt && (
          <>
            {" "}
            · <span aria-hidden="true" className="text-up">●</span> prices updated <HomeUpdatedAgo updatedAt={updatedAt} renderedAt={renderedAt} />
          </>
        )}
      </p>
    </div>
  );
}

/**
 * "7h ago" measured from the visitor's clock. The cached HTML says it as of
 * `renderedAt` (so the server render and the first client render agree), then
 * the client re-measures after mount — a page cached for an hour never claims
 * fresher prices than it has.
 */
export function HomeUpdatedAgo({ updatedAt, renderedAt }: { updatedAt: string; renderedAt: string }) {
  const [now, setNow] = useState(() => Date.parse(renderedAt));
  useEffect(() => setNow(Date.now()), []);
  return <>{ago(updatedAt, now)}</>;
}
