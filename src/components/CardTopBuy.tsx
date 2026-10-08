import type { Country } from "@/lib/country";
import { money } from "@/lib/format";
import { outboundRel } from "@/lib/affiliate";
import type { BuyRow } from "@/lib/quick-view";

/** Marks the top buy block for CardStickyBuyBar's observer. */
export const TOP_BUY_ATTR = "data-top-buy";

// The card page's phone buy path, top half : below lg
// the comparison starts well below the first screen, so the cheapest open
// listing in the visitor's market and its Buy button sit right under the card's
// name. The row comes from cheapestBuyRow (lib/quick-view.ts), the board's own
// ranking, so it is always the comparison's #1 row.
export function CardTopBuy({ best, country, page, slug }: { best: BuyRow | null; country: Country; page: string; slug: string }) {
  if (!best) return null;
  return (
    <div {...{ [TOP_BUY_ATTR]: "" }} className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-brand-500/30 bg-brand-500/[0.06] p-3 lg:hidden">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Cheapest</p>
        <p className="num text-lg font-bold text-accent">{money(best.priceCents, country)}</p>
        <p className="truncate text-xs text-slate-400">
          at {best.label} · {best.postage}
        </p>
      </div>
      <a
        href={best.href}
        target="_blank"
        rel={outboundRel()}
        data-retailer={best.retailer}
        data-page={page}
        data-card={slug}
        data-surface="card_top_buy"
        className={`${best.ebay ? "btn-ebay" : "btn-primary"} shrink-0`}
      >
        Buy →
      </a>
    </div>
  );
}

/**
 * The two buy paths of a card, together, at every width: the TCGplayer product
 * page (Impact-tagged) and the highlighted eBay button (an EPN-tagged search on
 * the visitor's own eBay). Server-rendered; both links are built by the page.
 * A search says "Search" before release and "Buy" after: eBay is the live-listing
 * door, never a claim that a listing exists.
 */
export function CardBuyPair({
  tcgHref,
  ebayHref,
  ebayName,
  preRelease = false,
  page,
  slug,
}: {
  tcgHref: string;
  ebayHref: string;
  ebayName: string;
  preRelease?: boolean;
  page: string;
  slug: string;
}) {
  return (
    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2" data-buy-pair="">
      <a href={tcgHref} target="_blank" rel={outboundRel()} data-retailer="tcgplayer" data-page={page} data-card={slug} data-surface="card_buy_pair" className="btn-primary min-h-11">
        Buy on TCGplayer →
      </a>
      <a href={ebayHref} target="_blank" rel={outboundRel()} data-retailer="ebay_search" data-page={page} data-card={slug} data-surface="card_buy_pair_ebay" className="btn-ebay min-h-11">
        {preRelease ? `Search ${ebayName} →` : `Buy on ${ebayName} →`}
      </a>
    </div>
  );
}
