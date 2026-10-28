"use client";

// The landing page's region block (ported from DexCompare, 2026-10-23; cut to the owner's short shape 2026-10-25): a switcher for
// the seven regions, "Most stocked in <region> today" (five in-stock products, lib/picks.ts: the newest Play and Collector Booster
// Boxes ordered by how many of the region's stores have them in stock), then the hot buttons, the region's most-used pages. The
// server HTML is the same for everyone, crawlers included, and already filled with the default region's (the US) picks; in the
// browser it moves to the visitor's region (RegionSuggest.tsx useSuggestedRegion: saved, language, time zone, then /api/geo) through
// the CDN-cached /api/picks/<region>. The slots and the buttons are fixed-size, so the swap moves nothing.
import Link from "@/components/Link";
import { useEffect, useState } from "react";
import { gaEvent } from "@/lib/gtag";
import { money, plural } from "@/lib/format";
import { thumb } from "@/lib/images";
import { REGION_LIST, REGIONS, X_DEFAULT_REGION, type Region } from "@/lib/regions";
import { sectionHref, type SectionKey } from "@/lib/site";
import type { Pick } from "@/lib/picks";
import { Icon, type IconName } from "./Icon";
import { pickRegion, useSuggestedRegion, type RegionSource } from "./RegionSuggest";

const SLOTS = 5;

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

/** A set on pre-order (lib/preorder-guides.ts openPreorderGuides), worked out on the server; its hub is /<region>/preorders/<slug>. */
export interface HotPreorder {
  slug: string;
  name: string;
}

// The pages people come for, in this order. With a set on pre-order its hub takes the Commander decks' place, so there are always eight
// (two rows of four on a desktop).
const HOT: { key: SectionKey; label: string; icon?: IconName }[] = [
  { key: "deals", label: "Deals", icon: "tag" },
  { key: "boosterBoxes", label: "Play Booster Boxes" },
  { key: "collectorBoxes", label: "Collector Booster Boxes" },
  { key: "commanderDecks", label: "Commander decks" },
  { key: "backInStock", label: "Back in stock", icon: "check" },
  { key: "outOfPrint", label: "Older sets in stock", icon: "clock" },
  { key: "guides", label: "Buying guides", icon: "info" },
  { key: "stores", label: "Stores", icon: "store" },
];

export function HomeRegionGrid({ initial, preorder = null }: { initial: Pick[]; preorder?: HotPreorder | null }) {
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
  const hot = HOT.map((h) =>
    h.key === "commanderDecks" && preorder
      ? { href: `/${r.region}/preorders/${preorder.slug}`, label: `${preorder.name} pre-orders`, icon: "calendar" as IconName, pre: true }
      : { href: sectionHref(r.region, h.key), label: h.label, icon: h.icon, pre: false },
  );

  return (
    <section id="regions" aria-labelledby="home-grid-h" className="page scroll-mt-20" data-home-grid="">
      <h2 id="home-grid-h" className="font-display text-2xl font-bold tracking-tight">
        Most stocked in {r.inName} today
      </h2>
      {/* The region switcher: real links (they work without script, and crawl to every region home); with script, a click
          swaps the grid and the buttons in place and remembers the choice, as the header's switcher does. */}
      <ul className="mt-3 flex flex-wrap gap-2" aria-label="Choose your region">
        {REGION_LIST.map((x) => (
          <li key={x.region}>
            <a
              href={`/${x.region}`}
              aria-current={x.region === region ? "true" : undefined}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                gaEvent("region_select", { region: x.region, from: region, placement: "landing-grid" });
                pickRegion(x.region);
              }}
              className={`chip min-h-11 ${x.region === region ? "chip-on" : ""}`}
            >
              <span aria-hidden="true">{x.flag}</span> {x.short}
            </a>
          </li>
        ))}
      </ul>
      {/* Phones: five rows of fixed height; from sm, five cards in a row. */}
      <ol className="mt-4 grid gap-2 sm:grid-cols-5 sm:gap-3" aria-busy={list ? undefined : true}>
        {Array.from({ length: SLOTS }, (_, i) => {
          const p = list?.[i];
          return (
            <li key={i} className="card h-[5.5rem] overflow-hidden sm:h-[18.5rem]">
              {p ? (
                <Link href={`/${r.region}/p/${p.slug}`} prefetch={false} className="group flex h-full items-center sm:flex-col sm:items-stretch">
                  <div className="plate m-2 flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center p-1.5 sm:h-36 sm:w-auto sm:p-3">
                    {p.img ? (
                      <img src={thumb(p.img, 240)!} alt={p.name} width={140} height={140} loading="eager" decoding="async" className="h-full w-full object-contain mix-blend-multiply" />
                    ) : (
                      <span className="text-[10px] font-semibold text-faint">{p.type}</span>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col justify-center py-2 pr-3 sm:items-stretch sm:p-3">
                    <span className="min-w-0">
                      <span className="hidden text-[11px] sm:block font-semibold uppercase tracking-wide text-muted">{p.type}</span>
                      <span className="line-clamp-1 text-sm font-semibold leading-5 group-hover:text-brand sm:mt-0.5 sm:line-clamp-2">{p.name}</span>
                    </span>
                    {/* Stock first, then the price (owner, 2026-10-25). */}
                    <span className="mt-1 flex items-baseline gap-2 sm:mt-auto sm:block sm:pt-1.5">
                      <span className="block truncate text-xs font-semibold text-open">
                        {p.stores > 0 ? `In stock at ${p.stores} of ${plural(p.listed ?? p.stores, "store")}` : "In stock"}
                        {p.tcg && r.market === "US" ? <span className="font-medium text-muted"> + TCGplayer</span> : null}
                      </span>
                      <span className="tabular block font-display text-lg font-extrabold">{p.cents != null ? money(p.cents, r.market) : "—"}</span>
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
      </ol>
      <p className="mt-2 text-xs leading-5 text-muted">
        The newest Play and Collector Booster Boxes, by how many {r.adjective} stores have them in stock (of the stores that list them; TCGplayer is never counted as a store). Cheapest in-stock price in {r.currency}, before shipping.{" "}
        {source === "geo" || source === "language" ? "Region suggested from your location." : null}
      </p>

      <h2 className="mt-10 font-display text-xl font-bold tracking-tight">Jump to</h2>
      <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4" aria-label={`Popular pages in ${r.inName}`}>
        {hot.map((h) => (
          <li key={h.label} className="flex">
            <Link
              href={h.href}
              prefetch={false}
              data-hot-button=""
              className={`card flex min-h-14 flex-1 items-center gap-2 px-4 py-3 text-[15px] font-semibold leading-5 transition-shadow hover:shadow-lift ${h.pre ? "border-pre/40 bg-pre-soft/40 text-pre" : "hover:text-brand"}`}
            >
              {h.icon && <Icon name={h.icon} size={18} className="shrink-0" />}
              <span className="min-w-0">{h.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
