import type { Country } from "@/lib/country";
import { COUNTRIES } from "@/lib/country";
import { money } from "@/lib/format";
import { usdCentsToCountry } from "@/lib/fx";
import { outboundRel } from "@/lib/affiliate";

// TCGPLAYER MARKET PRICE · REFERENCE (RiftCompare's TcgMarketPrice): TCGplayer's
// US market price (what the printing has recently sold for there), in the
// visitor's currency with the US dollar figure beside it, and an affiliate
// "Check on TCGplayer →" button. A reference, never a row in the comparison: a
// converted USD figure must never sit among real local stores where it could
// undercut them. Rendered under the board on the card and sealed pages, and
// compact in the QuickView. No hooks, so it renders on the server (the card page
// already knows the market) and inside the client popup alike.
export function TcgMarketPrice({
  marketUsd,
  country,
  href,
  page,
  card,
  compact = false,
  disclosure = true,
}: {
  marketUsd: number | null;
  country: Country;
  /** Affiliate-tagged TCGplayer product URL (affiliateUrl). */
  href: string | null;
  /** data-page for the click beacon ("card", "sealed", "quickview"). */
  page: string;
  /** data-card: the product's slug. */
  card?: string;
  compact?: boolean;
  /** Off only where an adjacent disclosure already covers this link. */
  disclosure?: boolean;
}) {
  if (marketUsd == null) return null;
  const us = country === "US";
  const cur = COUNTRIES[country].currency;
  return (
    <div className={`card-surface flex flex-wrap items-center justify-between gap-x-4 gap-y-3 ${compact ? "p-3" : "p-4"}`}>
      <div className="min-w-0 flex-1 basis-56">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-white">TCGplayer market price</span>
          <span className="chip bg-ink-800 text-[11px] text-slate-400">reference</span>
        </div>
        <p className={`num mt-1 font-extrabold text-accent ${compact ? "text-xl" : "text-2xl"}`}>
          {us ? money(marketUsd, "US") : `≈ ${money(usdCentsToCountry(marketUsd, country), country)}`}
          {us ? null : <span className="ml-1.5 align-middle text-xs font-medium text-slate-500">≈ {money(marketUsd, "US")}</span>}
        </p>
        <p className="mt-1.5 text-[11px] leading-snug text-slate-500">
          {us
            ? "What this has recently sold for on TCGplayer — a reference value, not a listing."
            : `TCGplayer's US market price, converted to ${cur} at an approximate rate. A reference value, not a listing — TCGplayer may not ship to your country.`}
        </p>
        {href && disclosure ? (
          <p className="mt-1 text-[11px] text-slate-500">Affiliate link: as a TCGplayer affiliate, MTG Compare earns from qualifying purchases.</p>
        ) : null}
      </div>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel={outboundRel()}
          data-retailer="tcgplayer"
          data-page={page}
          data-card={card}
          data-surface="tcg_reference"
          className={`btn-primary shrink-0 ${compact ? "min-h-10 px-3 text-xs" : ""}`}
        >
          Check on TCGplayer →
        </a>
      ) : null}
    </div>
  );
}
