import { AFFILIATE_NOTE, REL_SPONSORED, TCGPLAYER_RETAILER, tcgplayerAffiliateUrl, tcgplayerSearchUrl, type Placement } from "@/lib/affiliate";
import type { TcgplayerTile } from "@/lib/data";
import { money } from "@/lib/format";
import { thumb } from "@/lib/images";
import type { Region } from "@/lib/regions";
import { OutboundLink } from "./OutboundLink";

// The TCGplayer product strip (owner, 2026-10-28: "more TCGplayer ads … with the actual products"): real sealed products with their
// photo and TCGplayer's own in-stock price, each linking to the product on TCGplayer through the Impact deep link. The TCGplayer half
// of the eBay listing strips (EbayStrip.tsx), drawn on the server from the day's data (lib/data.ts tcgplayerTiles): no request, no
// hosted creative that can expire. Labelled "Ad" with the disclosure under it; always below a page's comparison, never a pop-up.
// TCGplayer is the US marketplace: outside the US the price stays US$ and the strip says so (prices are never converted). TCGplayer
// Direct reached Australia on 2026-10-07 for singles only, so nothing here claims sealed ships there.
export function TcgplayerStrip({
  tiles,
  region,
  placement,
  title,
  searchName = "",
  className = "",
}: {
  tiles: TcgplayerTile[];
  region: Region;
  placement: Placement;
  title: string;
  /** The "Shop TCGplayer" search: a set's name, or "" for all Magic sealed. */
  searchName?: string;
  className?: string;
}) {
  if (tiles.length < 3) return null;
  const us = region === "us";
  return (
    <section data-ad className={`ad-box overflow-hidden ${className}`} aria-label={title}>
      <div className="flex items-center gap-3 px-4 pt-4">
        <span className="shrink-0 text-xl font-black tracking-tight" aria-label="TCGplayer">
          TCG<span className="text-[#1f6fe5]">player</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-base font-bold leading-tight">{title}</span>
          <span className="block truncate text-xs text-muted">{us ? "In stock on TCGplayer today" : "The US marketplace · prices in US$, shipping from the US"}</span>
        </span>
        <span className="rounded bg-raised px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">Ad</span>
        <OutboundLink
          href={tcgplayerSearchUrl(searchName, region, placement)}
          rel={REL_SPONSORED}
          retailer={TCGPLAYER_RETAILER}
          placement={placement}
          className="btn-ad hidden shrink-0 px-3 py-1.5 text-xs sm:inline-flex"
        >
          Shop TCGplayer →
        </OutboundLink>
      </div>
      <ul className="flex snap-x gap-3 overflow-x-auto px-4 pb-2 pt-3">
        {tiles.map((t) => (
          <li key={t.slug} className="w-[150px] shrink-0 snap-start">
            <OutboundLink
              href={tcgplayerAffiliateUrl(t.url, region, placement)}
              rel={REL_SPONSORED}
              retailer={TCGPLAYER_RETAILER}
              placement={placement}
              className="group flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface transition hover:-translate-y-0.5 hover:border-ink/40"
            >
              <span className="plate relative block aspect-square">
                <img src={thumb(t.imageUrl, 200) ?? t.imageUrl} alt={t.name} width={200} height={200} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-contain p-2 mix-blend-multiply" />
                <span className="absolute bottom-1.5 right-1.5 rounded-md bg-[#15171c] px-1.5 py-0.5 text-xs font-bold text-white shadow">
                  {us ? money(t.priceCents, "US") : `US${money(t.priceCents, "US")}`}
                </span>
              </span>
              <span className="line-clamp-2 px-2 pb-2 pt-1.5 text-xs font-semibold leading-tight">{t.name}</span>
            </OutboundLink>
          </li>
        ))}
        <li className="w-[150px] shrink-0 snap-start">
          <OutboundLink
            href={tcgplayerSearchUrl(searchName, region, placement)}
            rel={REL_SPONSORED}
            retailer={TCGPLAYER_RETAILER}
            placement={placement}
            className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-ad-line p-3 text-center"
          >
            <span className="btn-ad px-3 py-1 text-xs">Shop TCGplayer →</span>
            <span className="text-[11px] text-muted">Every listing, sorted by price</span>
          </OutboundLink>
        </li>
      </ul>
      <p className="px-4 pb-3 text-[11px] text-muted">Sponsored. {AFFILIATE_NOTE}</p>
    </section>
  );
}
