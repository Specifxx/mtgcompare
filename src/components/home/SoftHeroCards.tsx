"use client";

// The landing page's hero cards (it has no region of its own): the server HTML holds the default region's (US) two, so the first paint
// is full and crawlers see real products; in the browser they move to the visitor's region (RegionSuggest.tsx useSuggestedRegion)
// through the CDN-cached /api/picks/<region> that the region grid below already asks for. Two fixed-size slots: the swap moves nothing.
import { useEffect, useState } from "react";
import type { Pick } from "@/lib/picks";
import { REGIONS, X_DEFAULT_REGION, type Region } from "@/lib/regions";
import { useSoftRegion } from "../RegionSuggest";
import { Flag } from "../Flag";
import { HeroCards, heroFromPicks, type HeroCard } from "./HeroCards";

const cache = new Map<Region, Promise<Pick[]>>();
function picksFor(region: Region): Promise<Pick[]> {
  let p = cache.get(region);
  if (!p) {
    p = fetch(`/api/picks/${region}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ picks: Pick[] }>) : { picks: [] }))
      .then((j) => (Array.isArray(j.picks) ? j.picks : []))
      .catch(() => []);
    cache.set(region, p);
  }
  return p;
}

export function SoftHeroCards({ initial }: { initial: Pick[] }) {
  const region = useSoftRegion();
  const [state, setState] = useState<{ region: Region; cards: HeroCard[] }>({ region: X_DEFAULT_REGION, cards: heroFromPicks(initial) });
  useEffect(() => {
    if (state.region === region) return;
    let live = true;
    picksFor(region).then((list) => {
      const cards = heroFromPicks(list);
      // a region with nothing to show keeps the cards it has rather than an empty hero
      if (live && cards.length) setState({ region, cards });
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region]);
  if (!state.cards.length) return null;
  const r = REGIONS[state.region];
  return (
    <div>
      <p className="eyebrow mb-3">
        <Flag code={r.short} /> Popular in {r.inName} · most stocked
      </p>
      <HeroCards cards={state.cards} region={state.region} />
    </div>
  );
}
