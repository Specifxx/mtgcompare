import type { ProductCardData } from "@/lib/data";
import type { Region } from "@/lib/regions";
import { ProductCard } from "./ProductCard";

/**
 * A short row of product cards (4 to 8: "In stock instead", "Cheaper than most stores today", "Recently viewed"). On a phone it is ONE
 * row that scrolls sideways (globals.css .scroller: snap, no scrollbar, a fade at the right edge that says there is more), so a rail
 * costs one card's height instead of a grid's four rows; from sm it is a grid of four columns (one row for four cards, about
 * ProductGrid's card width). Never an ad unit and never a tile: units go in ProductGrid or a strip of their own. Plain markup with
 * no hooks, so a server page and a client component (the recently-viewed rail) render it alike.
 *
 * `bleed` (default): on a phone the row runs to the screen's edges (-mx-4 cancels .page's px-4), so the cut-off card at the right
 * reads as "scroll"; pass bleed={false} inside a padded box, where -mx-4 would overflow it.
 */
export function ProductRail({ products, region, eager = 0, label, bleed = true, className = "" }: { products: ProductCardData[]; region: Region; eager?: number; label?: string; bleed?: boolean; className?: string }) {
  if (!products.length) return null;
  return (
    <ul
      role="list"
      aria-label={label}
      className={`scroller gap-3 sm:grid sm:grid-cols-4 sm:gap-4 sm:overflow-visible sm:[-webkit-mask-image:none] sm:[mask-image:none] ${bleed ? "-mx-4 px-4 scroll-px-4 sm:mx-0 sm:px-0" : ""} ${className}`}
    >
      {products.map((p, i) => (
        // flex-col + the card's root at flex-1: every card in the row is as tall as the tallest (as in a grid)
        <li key={p.slug} className="flex w-[42%] min-w-[9.5rem] max-w-[13rem] flex-col sm:w-auto sm:min-w-0 sm:max-w-none [&>div]:flex-1">
          <ProductCard p={p} region={region} priority={i < eager} />
        </li>
      ))}
    </ul>
  );
}
