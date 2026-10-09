import { TCGPLAYER_MAGIC_SEARCH, affiliateUrl, outboundRel } from "@/lib/affiliate";
import type { Country } from "@/lib/country";

// The TCGplayer house banner (RiftCompare's TcgplayerAd), second under the price
// comparison after the card's eBay banner: "Shop Magic singles & sealed" on
// TCGplayer's Magic search (TCGPLAYER_MAGIC_SEARCH) through the Impact link,
// the same affiliateUrl a card's own TCGplayer link uses. Labelled "Ad" and marked
// data-ad-placement, so Plus and Premium members (ad-free) never see it. Fixed
// heights, so it never shifts the page. The TcgMarketPrice block above already
// links the product itself; this one is the store-wide click.

function tagline(country: Country): string {
  if (country === "US") return "Fast US shipping";
  if (country === "UK") return "Ships to the UK";
  if (country === "AU") return "Ships to Australia";
  if (country === "CA") return "Ships to Canada";
  return "Ships worldwide";
}

export function TcgplayerBanner({ country, page, card, className = "" }: { country: Country; page: string; card?: string; className?: string }) {
  const href = affiliateUrl(TCGPLAYER_MAGIC_SEARCH, "tcgplayer_banner", `/${page}`);
  return (
    <div data-ad-placement="tcgplayer-banner" className={`flex flex-col items-center ${className}`}>
      <a
        href={href}
        target="_blank"
        rel={outboundRel()}
        data-retailer="tcgplayer_banner"
        data-page={page}
        data-card={card}
        data-surface="tcgplayer_banner"
        className="relative flex h-[100px] w-full max-w-[728px] items-center justify-center gap-3 overflow-hidden rounded-lg border border-sky-500/30 bg-ink-900 bg-gradient-to-r from-transparent via-sky-500/[0.06] to-transparent px-4 transition-colors hover:border-sky-500/60 md:h-[90px]"
      >
        <span className="absolute left-1.5 top-1 rounded bg-ink-950/70 px-1 text-[9px] font-semibold uppercase tracking-wide text-slate-400">Ad</span>
        <span className="shrink-0 text-base font-extrabold tracking-tight text-white">
          TCG<span className="text-sky-400">player</span>
        </span>
        <span className="min-w-0 text-left">
          <span className="block truncate text-[13px] font-semibold text-slate-100">Shop Magic singles &amp; sealed</span>
          <span className="block truncate text-[11px] text-slate-400">{tagline(country)}</span>
        </span>
        <span className="shrink-0 rounded-md bg-sky-500/15 px-2.5 py-1 text-[11px] font-bold text-sky-300">Shop now →</span>
      </a>
    </div>
  );
}
