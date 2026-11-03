import type { Metadata } from "next";
import { SITE } from "@/site.config";
import { canon } from "@/lib/site";
import { dailyCards } from "@/lib/daily-data";
import { dayKey, upcomingPuzzles } from "@/lib/daily";
import { DailyGame } from "./DailyGame";

export const revalidate = 86400; // carries a week of puzzles; the client picks today's (lib/daily.ts)
export const metadata: Metadata = {
  title: `${SITE.gameShort} Price Duel — the daily card price game`,
  description: `Ten pairs of ${SITE.game} cards a day: pick the one worth more at TCGplayer market price. Same puzzle for everyone, keep your streak, share your score. Free, no account.`,
  ...canon("/daily"),
};

export default function Page() {
  const puzzles = upcomingPuzzles(dailyCards(), dayKey(new Date()));
  return (
    <div>
      <h1 className="font-display text-3xl font-black">{SITE.gameShort} Price Duel</h1>
      <p className="mt-2 max-w-3xl text-muted">
        Ten pairs of cards. Tap the one worth more at TCGplayer&apos;s US market price. A new puzzle every day at midnight UTC, the same for everyone, so you can compare scores with friends.
      </p>
      {puzzles.length ? <DailyGame puzzles={puzzles} game={SITE.gameShort} /> : <p className="mt-6 text-muted">Today&apos;s puzzle isn&apos;t ready yet. Check back soon.</p>}
    </div>
  );
}
