import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { DailyGame } from "@/components/DailyGame";
import { dayKey, upcomingPuzzles } from "@/lib/daily";
import { dailyPool } from "@/lib/daily-data";
import { regionOrNotFound } from "@/lib/regions";
import { pageMeta, regionAlternates } from "@/lib/seo";
import { SITE_NAME } from "@/lib/site";

// /<region>/daily: the Price Duel (lib/daily.ts), a daily "which costs more?" game on the region's own in-stock prices. The share
// loop the card sites run (growth plan 2026-11-03), on sealed. Rendered per request and kept by Vercel's CDN for a day
// (next.config.js CDN_PAGES) with a week of puzzles inside; the client picks today's. Reads no cookie.
export const dynamic = "force-dynamic";

export function generateMetadata({ params }: { params: { region: string } }): Metadata {
  const r = regionOrNotFound(params.region);
  return pageMeta({
    title: `${SITE_NAME} Price Duel: the daily Magic sealed price game`,
    description: `Ten pairs of Magic sealed products a day: pick the one that costs more at stores in ${r.inName} right now. Same puzzle for everyone, keep your streak, share your score. Free, no account.`,
    path: `/${r.region}/daily`,
    alternates: regionAlternates(r.region, "/daily"),
  });
}

export default async function DailyPage({ params }: { params: { region: string } }) {
  const r = regionOrNotFound(params.region);
  const puzzles = upcomingPuzzles(await dailyPool(r.market), dayKey(new Date()));
  return (
    <div className="page py-8">
      <Breadcrumbs items={[{ href: `/${r.region}`, label: r.name }, { label: "Price Duel" }]} />
      <header className="max-w-3xl">
        <div className="eyebrow">Daily game</div>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">{SITE_NAME} Price Duel</h1>
        <p className="mt-3 text-lg leading-8 text-muted">
          Ten pairs of sealed products. Tap the one that costs more at stores in {r.inName} today. A new puzzle every day at midnight UTC, the same for everyone here, so you can compare scores with friends.
        </p>
      </header>
      <div className="max-w-2xl">
        {puzzles.length ? <DailyGame puzzles={puzzles} region={r.region} market={r.market} /> : <p className="mt-6 text-muted">Today&apos;s puzzle isn&apos;t ready yet in {r.inName}. Check back soon.</p>}
      </div>
    </div>
  );
}
