// Chart movement for the /admin/demand leaderboard, Billboard Hot 100 style:
// each card's rank this period against its rank in the period just before it,
// both ranked by the SAME rule.
//
// Pure — no database. lib/demand-snapshot.ts supplies both periods' rows
// (demandWindowOrThrow(days, deps, { previous: true })); this module only ranks them.

export type DemandMetric = "searches" | "views";

export interface DemandCounts {
  cardId: number;
  searches: number;
  views: number;
}

export type Movement =
  // Ranked in the previous period too: `by` places up or down (0 = held), `prev` its rank then.
  | { kind: "up" | "down" | "same"; by: number; prev: number }
  // No activity on this metric in the previous period, so it had no rank to move from.
  | { kind: "new" };

/**
 * The leaderboard's ordering: the metric, then the other metric, then card id,
 * so ties rank the same way every load and in both periods (without the id a
 * tie could swap between loads and show movement that never happened).
 */
export function compareDemand(metric: DemandMetric) {
  const other: DemandMetric = metric === "searches" ? "views" : "searches";
  return (a: DemandCounts, b: DemandCounts): number =>
    b[metric] - a[metric] || b[other] - a[other] || (a.cardId - b.cardId);
}

/**
 * Rank (1-based) of every card with activity on `metric` in a period. The WHOLE
 * field is ranked, not just the displayed top N, so a card climbing from #73 to
 * #40 shows ▲33 rather than a vague "new to the chart".
 */
export function rankBy(rows: readonly DemandCounts[], metric: DemandMetric): Map<number, number> {
  const ranked = rows.filter((r) => r[metric] > 0).sort(compareDemand(metric));
  return new Map(ranked.map((r, i) => [r.cardId, i + 1]));
}

/** This period's rank against last period's. */
export function movementFor(rank: number, prevRank: number | undefined): Movement {
  if (prevRank == null) return { kind: "new" };
  if (prevRank === rank) return { kind: "same", by: 0, prev: prevRank };
  return prevRank > rank ? { kind: "up", by: prevRank - rank, prev: prevRank } : { kind: "down", by: rank - prevRank, prev: prevRank };
}

/**
 * Movement against a previous CHART rather than a previous period's raw counts:
 * `prevRanks` is last chart's card → position. Used by Rising Cards and the
 * Hot 40, whose previous chart is a frozen snapshot that only holds its own
 * picks, so "new" there means "not on that chart" (it may have ranked lower).
 */
export function movementFromRanks(order: readonly number[], prevRanks: ReadonlyMap<number, number>): Map<number, Movement> {
  return new Map(order.map((id, i) => [id, movementFor(i + 1, prevRanks.get(id))]));
}

/** Movement for each card in this period's displayed list (already in rank order). */
export function chartMovement(
  currentOrder: readonly number[],
  previousRows: readonly DemandCounts[],
  metric: DemandMetric,
): Map<number, Movement> {
  const prev = rankBy(previousRows, metric);
  return new Map(currentOrder.map((id, i) => [id, movementFor(i + 1, prev.get(id))]));
}
