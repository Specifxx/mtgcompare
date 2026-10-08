import { Suspense } from "react";
import Link from "next/link";
import { ParallaxRoot } from "./ParallaxRoot";
import { CountryHeroToggle } from "@/components/CountryHeroToggle";
import { CardSearch } from "@/components/CardSearch";
import { HeroStats } from "./HeroStats";
import { TrendingChips, type TrendingCard } from "./TrendingChips";
import { BrandLogo } from "@/components/BrandLogo";
import { COUNTRY_LIST, type Country } from "@/lib/country";
import type { MarketStat } from "@/lib/home";

// RiftCompare's CinematicHero, markup and classes verbatim: a full-bleed band
// (the breakout below starts it at x=0 under the fixed rail, and the rail is
// reserved again inside), the logo row (sm+), the H1, the "best price" line,
// the hero search (sm+; the header carries one below that), six Popular
// chips, the stats line, "All N cards in the database →" and the market
// toggle — each fading in on a short stagger (80–360ms).
//
// A region home passes `region`: the H1 adds "in <place>" and the stats lock
// to that market.
export interface HeroRegion {
  code: Country;
  adjective: string;
}

const SHORT_PLACE: Record<Country, string> = {
  AU: "Australia",
  US: "the US",
  UK: "the UK",
  SG: "Singapore",
  CA: "Canada",
  EU: "Europe",
};

function otherMarketsList(exclude: Country): string {
  const names = COUNTRY_LIST.filter((c) => c.code !== exclude).map((c) => SHORT_PLACE[c.code]);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function CinematicHero({
  totalCards,
  statsByCountry,
  trendingCards,
  updatedAt,
  renderedAt,
  region,
}: {
  totalCards: number;
  statsByCountry: Record<Country, MarketStat>;
  trendingCards: TrendingCard[];
  updatedAt: string | null;
  renderedAt: string;
  region?: HeroRegion;
}) {
  const heroAdjective = region?.adjective ?? "US";
  const otherMarkets = otherMarketsList(region?.code ?? "US");
  return (
    <ParallaxShell>
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
        <div className="absolute inset-0 border-b border-ink-800 bg-ink-950" />
      </div>
      {/* Foreground content: its own rail reservation (the band is full-bleed,
          so container-app would otherwise centre under the fixed rail), and
          w-full because it is the flex row's only in-flow item. */}
      <div className="w-full pl-[var(--sidenav-w)]">
        <div className="container-app relative z-10 w-full py-5 text-center sm:py-10">
          <div className="animate-fade-in [animation-delay:80ms] hidden items-center justify-center gap-2 sm:flex">
            <BrandLogo className="h-8 w-8" />
            <span className="text-lg font-extrabold tracking-tight text-white">
              MTG<span className="text-brand-400">Compare</span>
            </span>
          </div>
          <h1 className="animate-fade-in [animation-delay:160ms] mx-auto max-w-4xl text-2xl font-extrabold leading-[1.15] tracking-tight text-white sm:mt-4 sm:text-4xl lg:text-5xl">
            <span className="text-brand-400">MTG</span> Card Prices{region ? ` in ${SHORT_PLACE[region.code]}` : ""}
          </h1>
          <p className="animate-fade-in [animation-delay:240ms] mx-auto mt-2 max-w-2xl text-base text-slate-300 sm:mt-4">
            <strong className="block text-base font-semibold text-white sm:text-xl">Buy Magic: The Gathering cards at the best price</strong>
            <span className="hidden sm:inline">
              Price check any card and find the cheapest place to buy: live Magic card prices from every {heroAdjective} store we track, plus
              five more markets in their own currency: {otherMarkets}, updated daily.
            </span>
          </p>
          <div className="relative z-20 animate-fade-in [animation-delay:300ms] mx-auto mt-6 hidden max-w-2xl sm:block">
            <Suspense fallback={<div className="input mx-auto h-12 max-w-2xl" />}>
              <CardSearch size="lg" placeholder="Search any Magic card…" />
            </Suspense>
          </div>
          <TrendingChips cards={trendingCards} />
          <HeroStats totalCards={totalCards} statsByCountry={statsByCountry} updatedAt={updatedAt} renderedAt={renderedAt} lockCountry={region?.code} />
          <div className="animate-fade-in [animation-delay:360ms] mt-6 flex flex-col items-center gap-2">
            <Link
              href="/browse"
              className="tap-link rounded text-sm font-semibold text-slate-300 underline-offset-4 outline-none transition-colors hover:text-brand-400 hover:underline focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              All {totalCards.toLocaleString("en-US")} cards in the database →
            </Link>
            <CountryHeroToggle />
          </div>
        </div>
      </div>
    </ParallaxShell>
  );
}

function ParallaxShell({ children }: { children: React.ReactNode }) {
  return (
    <ParallaxRoot
      id="mc-hero"
      className="relative z-10 left-1/2 -mt-6 flex min-h-[30vh] w-screen translate-x-[calc(-50%-var(--sidenav-w)/2)] items-center"
    >
      {children}
    </ParallaxRoot>
  );
}
