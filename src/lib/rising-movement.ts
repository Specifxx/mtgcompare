import { movementFromRanks, type Movement } from "./demand-movement";
import type { WeekAgoRanking } from "./rise-predictor";

// ─────────────────────────────────────────────────────────────────────────────
// Chart movement for Rising Cards and the Hot 40 (2026-09-28): each pick's
// place against the SAME RANKING A WEEK AGO.
// ─────────────────────────────────────────────────────────────────────────────
// The week-ago ranking is rebuilt from the data as it stood then
// (lib/rise-predictor.ts getRisingWeekAgo — demand snapshots, price history,
// today's stock), so it exists for every market from the first day and
// depends on nothing the owner mints or deletes.
//
// It FIRST compared with the latest Hot 40 snapshot at least six days old. The
// ranking only became version 2 on 2026-09-25, so no chart qualified before
// 1 October and the owner saw no arrows; then, "literally just use the data
// from a week ago, it doesn't need to be dependant on the snapshot". Snapshots
// minted in the hours between keep the `previousChart` they froze.
//
// The whole universe is ranked a week ago, not just the top 40, so a card
// climbing from #73 to #12 reads ▲61; NEW means it had no searches by then.

export type { WeekAgoRanking };

/** Movement for a ranking (card ids in rank order) against the week-ago ranking; null without one. */
export function movementAgainst(order: readonly string[], weekAgo: WeekAgoRanking | null): Map<string, Movement> | null {
  return weekAgo ? movementFromRanks(order, new Map(weekAgo.ranks)) : null;
}

/** "21 September" — the day the week-ago ranking is rebuilt as of. */
export function weekAgoLabel(weekAgo: Pick<WeekAgoRanking, "asOf">): string {
  return new Date(`${weekAgo.asOf}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
}
