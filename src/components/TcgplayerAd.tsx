import { TCGPLAYER_MAGIC_SEARCH, outboundRel, tcgplayerCreativeUrl } from "@/lib/affiliate";
import { parseCreatives, type TcgCreative } from "@/lib/tcgplayer-creatives";

// An Impact creative banner for TCGplayer through MTG Compare's OWN Impact
// account (lib/affiliate.ts). Owner-supplied creative ids go
// in NEXT_PUBLIC_TCGPLAYER_CREATIVES ("<id>:<w>x<h>,…"); WITHOUT them the banner
// renders nothing (the house banner TcgplayerBanner is the always-on one), so no
// creative id is ever invented. Labelled "Ad", data-ad-placement (ad-free members
// never see it), fixed dimensions so it never shifts the page. The click lands on
// TCGplayer's Magic search (TCGPLAYER_MAGIC_SEARCH, deep-linked by
// tcgplayerCreativeUrl), whatever landing page the creative was set up with.
const CREATIVES: TcgCreative[] = parseCreatives(process.env.NEXT_PUBLIC_TCGPLAYER_CREATIVES);

export function TcgplayerAd({ variant = "leaderboard", page, className = "" }: { variant?: "leaderboard" | "rect" | "mobile"; page: string; className?: string }) {
  const want = { leaderboard: [728, 90], rect: [300, 250], mobile: [320, 100] }[variant];
  const c = CREATIVES.find((x) => x.w === want[0] && x.h === want[1]);
  const href = c ? tcgplayerCreativeUrl(c.id, TCGPLAYER_MAGIC_SEARCH, "tcg-ad", `/${page}`) : null;
  if (!c || !href) return null;
  return (
    <div data-ad-placement="tcgplayer-ad" className={`flex flex-col items-center ${className}`}>
      <a href={href} target="_blank" rel={outboundRel()} data-retailer="tcgplayer_ad" data-page={page} data-surface="tcgplayer_ad" className="relative block overflow-hidden rounded-lg border border-sky-500/30 bg-ink-900" style={{ width: c.w, maxWidth: "100%", height: Math.min(c.h, 100) }}>
        <span className="absolute left-1.5 top-1 rounded bg-ink-950/70 px-1 text-[9px] font-semibold uppercase tracking-wide text-slate-400">Ad</span>
        {/* Our own evergreen creative, not Impact's hosted image (seasonal campaign art expires); the owner's creative id only carries the click and its commission. */}
        <span className="flex h-full items-center justify-center gap-3 px-4">
          <span className="shrink-0 text-base font-extrabold tracking-tight text-white">
            TCG<span className="text-sky-400">player</span>
          </span>
          <span className="min-w-0 text-left">
            <span className="block truncate text-[13px] font-semibold text-slate-100">Shop Magic singles &amp; sealed</span>
            <span className="block truncate text-[11px] text-slate-400">The biggest US marketplace for Magic: The Gathering</span>
          </span>
        </span>
      </a>
      <p className="mt-1.5 max-w-2xl text-center text-[11px] text-slate-500">MTG Compare earns a commission from qualifying TCGplayer purchases, at no extra cost to you.</p>
    </div>
  );
}
