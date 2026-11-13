"use client";

// The landing page's product block (ported from DexCompare, 2026-10-23): "Most stocked in <region> today" (ten in-stock products,
// lib/picks.ts: the newest Play and Collector Booster Boxes ordered by how many of the region's stores have them in stock). Nothing else since 2026-11-13
// (owner: "cull the features that we show"): the region row and the shortcuts are the hero's (RegionChips, SoftWaysIn), so this
// block no longer repeats a second switcher and a "Jump to" list. The server HTML is the same for everyone, crawlers included,
// and already filled with the default region's (the US) picks; in the browser it moves to the visitor's region (RegionSuggest.tsx
// useSuggestedRegion: saved, language, time zone, then /api/geo; a pick in the hero or the header moves it too) through the
// CDN-cached /api/picks/<region>. The slots are fixed-size, so the swap moves nothing.
import Link from "@/components/Link";
import { useEffect, useState } from "react";
import { money, plural } from "@/lib/format";
import { thumb } from "@/lib/images";
import { REGIONS, X_DEFAULT_REGION, type Region } from "@/lib/regions";
import type { Pick } from "@/lib/picks";
import { useSuggestedRegion, type RegionSource } from "./RegionSuggest";

const SLOTS = 10;

const cache = new Map<Region, Promise<Pick[]>>();
function picksFor(region: Region): Promise<Pick[]> {
  let p = cache.get(region);
  if (!p) {
    p = fetch(`/api/picks/${region}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ picks: Pick[] }>) : { picks: [] }))
      .then((j) => (Array.isArray(j.picks) ? j.picks.slice(0, SLOTS) : []))
      .catch(() => []);
    cache.set(region, p);
  }
  return p;
}

export function HomeRegionGrid({ initial }: { initial: Pick[] }) {
  // The default region until the suggestion is known (the server HTML's), so the first paint is a full grid, never skeletons. A pick
  // here, in the header or in the phone menu is the same one (RegionSuggest.tsx pickRegion): the whole page moves together.
  const suggested = useSuggestedRegion();
  const region: Region = suggested.region ?? X_DEFAULT_REGION;
  const source: RegionSource | null = suggested.source;
  const [picks, setPicks] = useState<{ region: Region; list: Pick[] }>({ region: X_DEFAULT_REGION, list: initial.slice(0, SLOTS) });

  useEffect(() => {
    if (picks.region === region) return;
    let live = true;
    picksFor(region).then((list) => {
      if (!live) return;
      setPicks({ region, list });
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region]);

  const r = REGIONS[region];
  const list = picks.region === region ? picks.list : null;
  return (
    <section id="regions" aria-labelledby="home-grid-h" className="page scroll-mt-20" data-home-grid="">
      <h2 id="home-grid-h" className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
        Most stocked in {r.inName} today
      </h2>
      {/* Ten slots (owner, 2026-11-13: more products here), each the same size whatever it holds (globals.css .hg-*): a row on a
          phone, two columns of rows on a tablet, the product card's shape (a square plate, the name, stock and price) from md. */}
      <ol className="mt-6 grid divide-y divide-line sm:grid-cols-2 sm:gap-x-6 md:grid-cols-5 md:gap-x-5 md:gap-y-8 md:divide-y-0" aria-busy={list ? undefined : true}>
        {Array.from({ length: SLOTS }, (_, i) => {
          const p = list?.[i];
          return (
            <li key={i} className="hg-slot">
              {p ? (
                <Link href={`/${r.region}/p/${p.slug}`} prefetch={false} className="group hg-link">
                  <div className="plate hg-plate">
                    {p.img ? (
                      <img src={thumb(p.img, 240)!} alt={p.name} width={240} height={240} loading={i < 5 ? "eager" : "lazy"} decoding="async" className="absolute inset-0 h-full w-full object-contain p-1.5 mix-blend-multiply md:p-3" />
                    ) : (
                      <span className="flex h-full items-center justify-center p-1 text-center text-[10px] font-semibold text-[#5c606c]">{p.type}</span>
                    )}
                  </div>
                  <div className="hg-text">
                    <span className="line-clamp-1 text-sm font-semibold leading-5 transition-colors group-hover:text-brand md:line-clamp-2">{p.name}</span>
                    {/* Stock first, then the price (owner, 2026-10-25). */}
                    <span className="mt-1 flex items-baseline justify-between gap-2 md:mt-auto md:block">
                      <span className="sp sp-sm sp-open min-w-0" title={`In stock at ${p.stores} of ${plural(p.listed ?? p.stores, "store")}${p.tcg && r.market === "US" ? " and on TCGplayer" : ""}`}>
                        <span className="truncate">{p.stores > 0 ? `In stock · ${plural(p.stores, "store")}` : "In stock"}</span>
                      </span>
                      <span className="tabular block shrink-0 font-display text-lg font-bold md:mt-0.5">{p.cents != null ? money(p.cents, r.market) : "—"}</span>
                    </span>
                  </div>
                </Link>
              ) : list && i === 0 ? (
                <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted">Nothing in stock to show here right now.</div>
              ) : (
                // An empty or loading slot keeps a filled one's size: the plate and the words' box, with nothing in them.
                <div className={`hg-link ${list ? "invisible" : "animate-pulse"}`} aria-hidden="true">
                  <div className="hg-plate bg-raised" />
                  <div className="hg-text" />
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-6 max-w-3xl text-xs leading-5 text-muted">
        The newest Play and Collector Booster Boxes, by how many {r.adjective} stores have them in stock (of the stores that list them; TCGplayer is never counted as a store). Cheapest in-stock price in {r.currency}, before shipping.{" "}
        {source === "geo" || source === "language" ? "Region suggested from your location." : null}
      </p>
    </section>
  );
}
