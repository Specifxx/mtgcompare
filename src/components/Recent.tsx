"use client";

import { useEffect, useId, useState } from "react";
import type { ProductCardData } from "@/lib/data";
import { timeAgo } from "@/lib/format";
import { loadIndex } from "@/lib/index-client";
import type { Region } from "@/lib/regions";

type Rail = (typeof import("./ProductRail"))["ProductRail"];

// "Recently viewed": the last products a visitor opened, per region, kept ONLY in their browser (localStorage
// `dex-recent-<region>`, slugs only). Nothing is sent to DexCompare and there is no account: the privacy page says so, and clearing
// the site's data (or the rail's own "Clear") removes it. Every storage access is wrapped: a private window, blocked storage or a
// full quota means no rail, never an error.
//
//   • <RecentTracker region slug/> on a product page records the visit (renders nothing).
//   • <RecentlyViewed region exclude?/> renders the rail, with each product's CURRENT price and stock from the region's browse index
//     (lib/index-client.ts, the CDN-cached JSON the search box uses: no request of its own when the index is already loaded). It
//     renders nothing until it knows there is something to show, so it only ever goes at the END of a page's content, where
//     appearing late moves nothing the visitor is looking at.
//
// This module stays small (the product page loads it for the tracker): the rail's cards (ProductRail, ProductCard and what they
// import) and the index's expander load only when there is a list to show.

export const RECENT_MAX = 12;
/** How many cards the rail shows (the most recent first). */
export const RECENT_SHOWN = 8;

export const recentKey = (region: Region) => `dex-recent-${region}`;

/** The slice of the Web Storage API the list needs; tests pass a stub (one that throws, for blocked storage). */
export type RecentStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserStorage(): RecentStorage | null {
  try {
    return window.localStorage; // the getter itself throws where storage is blocked
  } catch {
    return null;
  }
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,199}$/;

/** The list after a visit to `slug`: it goes first, any earlier copy of it goes, and the list keeps `max`. */
export function pushRecent(list: readonly string[], slug: string, max = RECENT_MAX): string[] {
  return [slug, ...list.filter((s) => s !== slug)].slice(0, max);
}

/** The region's list, most recent first (deduped, slugs only); [] when there is none or storage can't be read. */
export function readRecent(region: Region, storage: RecentStorage | null = browserStorage()): string[] {
  try {
    const raw = storage?.getItem(recentKey(region));
    if (!raw) return [];
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return [...new Set(v.filter((s): s is string => typeof s === "string" && SLUG.test(s)))].slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

/** Record a visit; returns the new list ([] when storage can't be written). Never throws. */
export function rememberRecent(region: Region, slug: string, storage: RecentStorage | null = browserStorage()): string[] {
  if (!SLUG.test(slug)) return readRecent(region, storage);
  try {
    const next = pushRecent(readRecent(region, storage), slug);
    storage?.setItem(recentKey(region), JSON.stringify(next));
    return storage ? next : [];
  } catch {
    return [];
  }
}

export function clearRecent(region: Region, storage: RecentStorage | null = browserStorage()): void {
  try {
    storage?.removeItem(recentKey(region));
  } catch {
    /* nothing to clear */
  }
}

/** Product page: remember this visit. Renders nothing. */
export function RecentTracker({ region, slug }: { region: Region; slug: string }) {
  useEffect(() => {
    rememberRecent(region, slug);
  }, [region, slug]);
  return null;
}

/** The cards for the remembered slugs that the index still lists (a product can leave it), in visit order. */
export function recentCards(slugs: readonly string[], bySlug: ReadonlyMap<string, ProductCardData>, max = RECENT_SHOWN): ProductCardData[] {
  const out: ProductCardData[] = [];
  for (const s of slugs) {
    const p = bySlug.get(s);
    if (p) out.push(p);
    if (out.length >= max) break;
  }
  return out;
}

/** The rail of recently viewed products, at the end of a page. Nothing at all when the list is empty or unreadable. */
export function RecentlyViewed({ region, exclude }: { region: Region; exclude?: string }) {
  const [cards, setCards] = useState<ProductCardData[]>([]);
  const [Rail, setRail] = useState<Rail | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const titleId = useId();

  useEffect(() => {
    let live = true;
    const slugs = readRecent(region).filter((s) => s !== exclude);
    if (!slugs.length) return;
    Promise.all([loadIndex(region), import("./ProductRail")]).then(
      ([ix, m]) => {
        if (!live) return;
        setRail(() => m.ProductRail);
        setCards(recentCards(slugs, ix.bySlug));
        setCheckedAt(ix.checkedAt);
      },
      () => {
        /* no index, no rail */
      },
    );
    return () => {
      live = false;
    };
  }, [region, exclude]);

  if (!cards.length || !Rail) return null;
  return (
    <section aria-labelledby={titleId} className="mt-14">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div>
          <div className="eyebrow mb-1">Kept on this device</div>
          <h2 id={titleId} className="font-display text-2xl font-bold tracking-tight sm:text-[28px]">
            Recently viewed
          </h2>
        </div>
        <button
          type="button"
          onClick={() => {
            clearRecent(region);
            setCards([]);
          }}
          className="inline-flex min-h-10 shrink-0 items-center rounded-full px-3 text-sm font-semibold text-brand-strong hover:bg-raised"
        >
          Clear<span className="sr-only"> recently viewed</span>
        </button>
      </div>
      <Rail products={cards} region={region} label="Recently viewed" />
      <p className="mt-3 text-xs leading-5 text-muted">
        Current prices and stock{checkedAt ? ` (checked ${timeAgo(checkedAt)})` : ""}. This list stays in your browser; DexCompare never receives it.
      </p>
    </section>
  );
}
