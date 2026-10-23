"use client";

// The landing page's region grid (ported from DexCompare, 2026-10-23): eight products in stock in one region (lib/picks.ts: the
// newest Play Booster Boxes and Collector Booster Boxes), with a switcher for the seven regions right above it. The server HTML is
// the same for everyone, crawlers included, and already filled with the default region's (the US) picks, read at build; in the
// browser it moves to the visitor's region (RegionSuggest.tsx useSuggestedRegion: saved, language, time zone, then /api/geo) through
// the CDN-cached /api/picks/<region>. The slots are fixed-size, so the swap moves nothing.
import Link from "@/components/Link";
import { useEffect, useState } from "react";
import { gaEvent } from "@/lib/gtag";
import { money, plural } from "@/lib/format";
import { thumb } from "@/lib/images";
import { REGION_LIST, REGIONS, X_DEFAULT_REGION, type Region } from "@/lib/regions";
import type { Pick } from "@/lib/picks";
import { useSuggestedRegion, type RegionSource } from "./RegionSuggest";


const cache = new Map<Region, Promise<Pick[]>>();
function picksFor(region: Region): Promise<Pick[]> {
  let p = cache.get(region);
  if (!p) {
    p = fetch(`/api/picks/${region}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ picks: Pick[] }>) : { picks: [] }))
      .then((j) => (Array.isArray(j.picks) ? j.picks.slice(0, 8) : []))
      .catch(() => []);
    cache.set(region, p);
  }
  return p;
}

const SLOTS = 8;

export function HomeRegionGrid({ initial }: { initial: Pick[] }) {
  const suggested = useSuggestedRegion();
  const [picked, setPicked] = useState<Region | null>(null);
  // The default region until the suggestion is known (the server HTML's), so the first paint is a full grid, never skeletons.
  const region: Region = picked ?? (suggested.known ? suggested.region ?? X_DEFAULT_REGION : X_DEFAULT_REGION);
  const source: RegionSource | null = picked ? "picked" : suggested.source;
  const [picks, setPicks] = useState<{ region: Region; list: Pick[] }>({ region: X_DEFAULT_REGION, list: initial });

  useEffect(() => {
    if (region === X_DEFAULT_REGION && picks.region === X_DEFAULT_REGION) return;
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
    <section aria-labelledby="home-grid-h" className="page" data-home-grid="">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <h2 id="home-grid-h" className="font-display text-2xl font-bold tracking-tight">
          In stock in {r.inName} today
        </h2>
        <Link
          href={`/${r.region}`}
          prefetch={false}
          className="inline-flex min-h-11 items-center text-sm font-semibold text-brand hover:underline"
        >
          Continue to {r.name} →
        </Link>
      </div>
      {/* The region switcher: real links (they work without script, and crawl to every region home); with script, a click
          swaps the grid in place and remembers the choice, as the header's switcher does. */}
      <ul className="mt-3 flex flex-wrap gap-2" aria-label="Choose your region">
        {REGION_LIST.map((x) => (
          <li key={x.region}>
            <a
              href={`/${x.region}`}
              aria-current={x.region === region ? "true" : undefined}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                setPicked(x.region);
                gaEvent("region_select", { region: x.region, from: region, placement: "landing-grid" });
                try {
                  localStorage.setItem("mtg-region", x.region);
                } catch {
                  /* storage blocked */
                }
              }}
              className={`chip min-h-11 ${x.region === region ? "chip-on" : ""}`}
            >
              <span aria-hidden="true">{x.flag}</span> {x.short}
            </a>
          </li>
        ))}
      </ul>
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-busy={list ? undefined : true}>
        {Array.from({ length: SLOTS }, (_, i) => {
          const p = list?.[i];
          return (
            <li key={i} className="card h-[17.5rem] overflow-hidden sm:h-[18.5rem]">
              {p ? (
                <Link href={`/${r.region}/p/${p.slug}`} prefetch={false} className="group flex h-full flex-col">
                  <div className="plate m-2 flex h-32 items-center justify-center p-3 sm:h-36">
                    {p.img ? (
                      <img src={thumb(p.img, 240)!} alt={p.name} width={140} height={140} loading={i < 4 ? "eager" : "lazy"} decoding="async" className="h-full w-full object-contain mix-blend-multiply" />
                    ) : (
                      <span className="text-xs font-semibold text-faint">{p.type}</span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-3">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{p.type}</span>
                    <span className="mt-0.5 line-clamp-2 text-sm font-semibold leading-5 group-hover:text-brand">{p.name}</span>
                    <span className="mt-auto pt-1.5">
                      <span className="tabular block font-display text-lg font-extrabold">{p.cents != null ? money(p.cents, r.market) : "—"}</span>
                      <span className="block text-xs text-muted">
                        {p.stores > 0 ? `in stock at ${plural(p.stores, "store")}` : "in stock"}
                        {p.tcg && r.market === "US" ? " + TCGplayer" : ""}
                      </span>
                    </span>
                  </div>
                </Link>
              ) : list ? (
                i === 0 ? (
                  <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted">Nothing in stock to show here right now.</div>
                ) : null
              ) : (
                <div className="h-full animate-pulse bg-raised/60" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ul>
      {(
        <p className="mt-3 text-xs text-muted">
          Cheapest in-stock price at the {r.adjective} stores we compare, in {r.currency}, excluding shipping.{" "}
          {source === "geo" || source === "language" ? "Region suggested from your location; pick another above." : "Pick another region above."}
        </p>
      )}
    </section>
  );
}
