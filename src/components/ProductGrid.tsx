import type { ReactNode } from "react";
import type { ProductCardData } from "@/lib/data";
import { FEED_PLACEMENTS, withFeed, type FeedSurface } from "@/lib/ebay-ads";
import type { Region } from "@/lib/regions";
import { EbayFeedTile } from "./EbayStrip";
import { ProductCard } from "./ProductCard";
import { GridControls } from "./GridControls";
import { PRICE_BANDS } from "@/lib/grid-sort";
import { money } from "@/lib/format";
import { REGIONS } from "@/lib/regions";
import { SET_BY_CODE } from "@/lib/sets";

/** Listings this long or longer get the sort and filter bar (owner, 2026-11-23 UX review, P0 3). */
export const CONTROLS_MIN = 8;

/**
 * A product grid. With `tiles` (the surface the grid is on: browse, set, type or deals), real eBay listings sit among the products as
 * labelled sponsored tiles the size of a product card (components/EbayStrip.tsx EbayFeedTile): one after every 16 products, at most two
 * per grid, never within the last eight, each a different listing that no other unit on the page shows, under the surface's own
 * placement (lib/ebay-ads.ts feedSlots, tileSource, FEED_PLACEMENTS). From md up, where a tile is a whole row tall beside two or three
 * cards, it also needs 24 products after it (`wide`), else it is md:hidden: a short grid page stays within the 25% ad-density ceiling.
 * A pure function of the list, so the server and the browser render the same markup; a tile is an invisible cell of the row's height
 * until its listing is known, so nothing shifts.
 *
 * With `strip` (a listing strip, set / type / browse / deals pages, or the query box of a search), the strip sits on a row of its own
 * after the first `stripAfter` products (4: one row on a desktop, two on a phone) instead of above the list, so the products the visitor
 * came for are the first thing on the page. `grid-flow-dense` lets the products after it fill the gaps a 3-column row would leave
 * before it. The first tile (after product 16) is then 12 products below the strip: keep `stripAfter` at 4 or less, or the two units
 * come closer than a screen apart.
 */
export function ProductGrid({
  products,
  region,
  eager = 0,
  tiles,
  strip,
  stripAfter = 4,
}: {
  products: ProductCardData[];
  region: Region;
  eager?: number;
  tiles?: FeedSurface;
  strip?: ReactNode;
  stripAfter?: number;
}) {
  const controls = !!tiles && products.length >= CONTROLS_MIN;
  if (controls) {
    const market = REGIONS[region].market;
    const id = `grid-${tiles}-${products[0]?.slug ?? "x"}-${products.length}`;
    const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];
    const sets = uniq(products.map((p) => p.setCode ? SET_BY_CODE.get(p.setCode)?.name : null)).sort();
    const eras = uniq(products.map((p) => p.setCode ? SET_BY_CODE.get(p.setCode)?.series : null));
    const langs: string[] = []; // English only: MTG Compare lists no other language
    const bandLabels = PRICE_BANDS.map(([lo, hi]) => (lo === 0 ? `Under ${money(hi!, market)}` : hi == null ? `${money(lo, market)} and up` : `${money(lo, market)} to ${money(hi, market)}`));
    return (
      <>
        <GridControls gridId={id} sets={sets} eras={eras} langs={langs} bandLabels={bandLabels} />
        <div id={id} className="grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-5 sm:gap-y-10 md:grid-cols-3 lg:grid-cols-4">
          {products.map((p, i) => (
            <ProductCard key={p.slug} p={p} region={region} priority={i < eager} />
          ))}
        </div>
        {strip && <div className="mt-8">{strip}</div>}
      </>
    );
  }
  const entries = withFeed(products, tiles);
  const at = strip ? Math.min(stripAfter, entries.length) : -1;
  return (
    <div className={`grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-5 sm:gap-y-10 md:grid-cols-3 lg:grid-cols-4 ${strip ? "grid-flow-dense" : ""}`}>
      {entries.flatMap((e, i) => {
        const cell =
          e.kind === "feed" ? (
            <EbayFeedTile key={`ebay-feed-${e.nth}`} region={region} nth={e.nth} placement={FEED_PLACEMENTS[tiles ?? "browse"]} className={e.wide ? "" : "md:hidden"} />
          ) : (
            <ProductCard key={e.item.slug} p={e.item} region={region} priority={e.index < eager} />
          );
        return i + 1 === at
          ? [
              cell,
              <div key="ebay-strip" className="col-span-full">
                {strip}
              </div>,
            ]
          : [cell];
      })}
    </div>
  );
}
