import type { RiseAnalysis, RisePick, RiseScope, WeekAgoRanking } from "./rise-predictor";
import { COUNTRIES } from "./country";
import { movementFromRanks, type Movement } from "./demand-movement";

// ─────────────────────────────────────────────────────────────────────────────
// A shareable, frozen copy of one Rising Cards run — the payload and its title.
// ─────────────────────────────────────────────────────────────────────────────
// RiftCompare's lib/rising-snapshot.ts, for OP Compare (wave 2). OP Compare
// mints only version-2 payloads; the legacy reader stays so the shape rules
// read exactly as RiftCompare's do. The "Cheapest on eBay" freeze is not
// carried over: OP Compare's snapshot shows store prices only.
//
// Owner (RiftCompare), 2026-09-22: "add a new admin feature that generates an actual useful
// title for rising cards, and gives a special link for public users to view a
// snapshot of the rising cards at the time of generation so they don't need
// premium."
//
// THE TITLE IS DERIVED, NOT WRITTEN, and that is the whole design. "Rising
// cards" is what the page was called and it says nothing: every run has the
// same name, so two links are indistinguishable and neither gives a reader a
// reason to open it. A useful title has to name what THIS run actually found,
// which means reading it off the numbers rather than composing prose about
// them.
//
// EVERY CLAIM BELOW IS A MEASURED QUANTITY. The generator picks an angle from
// the data and states it; it never predicts, never says a card "will" rise, and
// never invents a superlative the numbers don't support — /editorial-policy's
// "nothing here describes a process we don't actually run" applies to a
// headline exactly as it does to an article, and the underlying tool's own
// disclaimer ("a research signal, not advice") would be worthless if the title
// above it overclaimed. The strongest word used is "leads", which is a fact
// about rank order.

// ── TWO PAYLOAD SHAPES (2026-09-25) ─────────────────────────────────────────
// The frozen `data` column outlives the code that wrote it, so every reader
// here must handle both:
//   • LEGACY (no `version`): minted before the 2026-09-25 Rising Cards rebuild.
//     Only cards with enough price history were ranked, so `qualifying` WAS the
//     ranked set; `trend7` / `trend30` were real 7- and 30-day moves and the
//     spark a 30-day line.
//   • VERSION 2: every searched, priced card is ranked (`universeSize` is the
//     ranked set); `qualifying` is only the cards with enough clean weekly
//     prices for the price-timing signals — 0 for weeks after a methodology
//     break while 40 picks are still ranked. The week-on-week move is
//     `vsLastWeekPct` and may be null (no comparable point: "—", never "0.0%");
//     there is no 30-day move, and the spark is 16 weeks of weekly prices.
//     `trend7` / `trend30` are still written, for any old reader, but nothing
//     here reads them on a v2 payload.
// weekMove / rankedFromCount / isLegacySnapshot below are the only places the
// difference is decided.

/** One card, flattened to what the public snapshot page draws. */
export interface RisingSnapshotPick {
  id: string;
  slug: string | null;
  displayName: string;
  setCode: string;
  collectorNumber: string;
  imageThumbUrl: string | null;
  score: number;
  priceCents: number | null;
  currency: string;
  /** Legacy payloads' 7-day move. On v2 payloads, vsLastWeekPct ?? 0 — read weekMove() instead. */
  trend7: number;
  /** Legacy payloads' 30-day move. Meaningless on v2 payloads (0 without price signals). */
  trend30: number;
  posPct: number;
  listings: number;
  spark: number[];
  confidence: RisePick["confidence"];
  /** v2: today's price vs the clean weekly point nearest a week ago; null when there is none. */
  vsLastWeekPct?: number | null;
  /** v2: whether posPct means anything (enough clean weekly prices). Legacy picks always had it. */
  priceSignals?: boolean;
  /** v2: the pick's one-line reason, as the live tool showed it. */
  reason?: string;
  /**
   * Place against the same ranking a week earlier, frozen at mint time
   * (lib/rising-movement.ts). Absent on snapshots minted before 2026-09-28;
   * null when it couldn't be rebuilt. "new" = not ranked a week earlier (or,
   * on a payload with `previousChart`, not on that chart).
   */
  move?: Movement | null;
}

/** Everything the public page renders. Frozen at mint time; never recomputed. */
export interface RisingSnapshotData {
  scope: RiseScope;
  /** ISO timestamp of the run this froze. */
  generatedAt: string;
  picks: RisingSnapshotPick[];
  /** Context the page shows so a reader can judge the sample, not just the list. */
  universeSize: number;
  /** Legacy: the ranked set. v2: cards with enough clean weekly prices for the price-timing signals. */
  qualifying: number;
  minPointsRequired: number;
  /** 2 for payloads minted from the 2026-09-25 ranking; absent on older ones. */
  version?: 2;
  /**
   * What the picks' `move` compares with: the ranking rebuilt as of `asOf`, a
   * week before (getRisingWeekAgo). Null when it couldn't be rebuilt, which
   * the page says; absent on older payloads.
   */
  weekAgo?: { asOf: string } | null;
  /**
   * Only on snapshots minted on 2026-09-28 before movement moved to the week-
   * ago ranking: `move` then compares with this earlier Hot 40. Never written now.
   */
  previousChart?: { createdAt: string; count: number } | null;
}

/** True for a payload minted before the 2026-09-25 rebuild (see TWO PAYLOAD SHAPES). */
export function isLegacySnapshot(data: Pick<RisingSnapshotData, "version">): boolean {
  return data.version !== 2;
}

/**
 * A pick's week-on-week move, or null when it has none. Legacy picks carry only
 * trend7 (a real 7-day move); v2 picks carry vsLastWeekPct, where null means
 * "nothing comparable a week ago" and must render as a dash, not 0.0%.
 */
export function weekMove(p: Pick<RisingSnapshotPick, "trend7" | "vsLastWeekPct">): number | null {
  return p.vsLastWeekPct !== undefined ? p.vsLastWeekPct : p.trend7;
}

/** How many cards the list was ranked from: the ranked set, whichever payload shape. */
export function rankedFromCount(data: RisingSnapshotData): number {
  return isLegacySnapshot(data) ? data.qualifying : data.universeSize;
}

// THE LIST HAS A NAME (owner, 2026-09-22: "we should call it the riftcompare
// hot 40"). A snapshot is a thing people forward, and "Rising cards snapshot"
// described the mechanism rather than naming the product — nobody shares a
// mechanism. The chart-countdown shape is the point: a reader who has never
// heard of this site still knows what a "Hot 40" is before reading a word of
// the subtitle.
//
// THE NUMBER IS THE REAL COUNT, NOT ALWAYS 40. rise-predictor caps the ranking
// at DISPLAY = 40, so a healthy run IS the Hot 40 — but a thin run (a market
// early in its price history) ranks fewer, and printing "Hot 40" above twelve
// rows would be the one kind of claim this file exists to avoid. So the name
// takes the count: forty cards make the Hot 40, twelve make the Hot 12. The
// brand reads the same and the number stays true.
export const HOT_LIST_BRAND = "OP Compare Hot";
export function hotListName(count: number): string {
  return `${HOT_LIST_BRAND} ${count}`;
}

const MARKET_LABEL = (scope: RiseScope): string =>
  scope === "GLOBAL" ? "every market we track" : COUNTRIES[scope]?.place ?? scope;

/** Short market word for a title: "the US", "Australia", "global". */
const MARKET_SHORT = (scope: RiseScope): string =>
  scope === "GLOBAL" ? "global" : COUNTRIES[scope]?.adjective ?? scope;

/** "22 September 2026" — spelled out, because a title is read, not parsed. */
export function snapshotDateLabel(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * The generated headline.
 *
 * Angles, in order of how much they actually tell a reader — the first one the
 * data supports wins:
 *
 *   1. A REAL MOVE ALREADY UNDERWAY. The top pick is up ≥5% on a week ago: that
 *      is the most concrete thing any run can say, so it leads.
 *   2. A SET-UP, NOT A MOVE. The top pick sits in the bottom third of its own
 *      range (posPct ≤ 0.33) — the screener's actual thesis ("hasn't re-rated
 *      yet"), and worth naming when nothing has moved yet.
 *   3. BREADTH. Several picks are up over 7 days: no single card carries the
 *      run, but the direction is still a finding.
 *   4. THE BARE FACT. n cards ranked, on a date. Dull, but never wrong — and
 *      this branch is what makes the whole function safe to call on a thin run.
 *
 * `count` is always stated, because "how many" is the first thing a reader
 * wants and the one number every branch can honestly supply.
 */
export function generateRisingTitle(data: RisingSnapshotData, now = new Date()): string {
  const date = snapshotDateLabel(now);
  const market = MARKET_SHORT(data.scope);
  const n = data.picks.length;
  const top = data.picks[0];

  if (!top || n === 0) {
    // No list, so no list name — naming a "Hot 0" would be absurd, and this
    // branch exists precisely to stay honest on a run with nothing in it.
    return `One Piece rising cards — no ranked cards on ${date}`;
  }

  const name = hotListName(n);

  // 0. THE CHART STORY, when the picks carry movement (the ranking a week earlier)
  // (owner, 2026-09-28: "xxx moves to the top 3, xxx remains at #1"). Places on
  // a chart are measured facts about rank order, so this is the most concrete
  // headline a run can have, and the one a chart's reader looks for first.
  const story = chartStory(data.picks);
  if (story) {
    const full = `${name}: ${story.lead}${story.second ? `, ${story.second}` : ""} (${market}, ${date})`;
    return full.length <= TITLE_MAX ? full : `${name}: ${story.lead} (${market}, ${date})`;
  }

  const plural = n === 1 ? "card" : "cards";

  // 1. The top pick is already moving. (weekMove: null is "no comparable
  // point", which is not a move of any size.)
  const topMove = weekMove(top);
  if (topMove != null && topMove >= 5) {
    return `${name}: ${top.displayName} is up ${topMove.toFixed(1)}% this week (${market}, ${date})`;
  }

  // 2. The top pick is cheap against its own range — the screener's own thesis.
  // Only when the pick HAS a range: a v2 pick without price signals carries a
  // neutral 0.5, which says nothing.
  if (top.priceSignals !== false && top.posPct <= 0.33) {
    return `${name}: ${top.displayName} leads ${n} One Piece ${plural} near their range low (${market}, ${date})`;
  }

  // 3. No single leader, but breadth.
  const upCount = data.picks.filter((p) => (weekMove(p) ?? 0) > 0).length;
  if (upCount >= Math.ceil(n / 2) && upCount >= 3) {
    return `${name}: ${upCount} of ${n} cards gained ground this week (${market}, ${date})`;
  }

  // 4. Always-true fallback.
  return `${name}: ${top.displayName} tops the ${market} ranking (${date})`;
}

// Long card names are why the second clause is optional: a title is read in a
// share preview and a browser tab, and past this it gets cut mid-name.
const TITLE_MAX = 150;

/**
 * The chart story: what happened at #1, then the one other movement most worth
 * a headline. null when the picks carry no movement (nothing a week earlier to compare with, or a
 * snapshot minted before 2026-09-28), and the older angles below take over.
 *
 * The second clause, first that applies (each skips #1):
 *   1. a card that moved INTO the top 3 — the biggest jump in, or a debut there;
 *   2. the biggest climb anywhere, of at least 3 places;
 *   3. the highest new entry;
 *   4. the biggest fall, of at least 3 places.
 * Nothing here says where a card is going, only where it moved on the chart.
 */
export function chartStory(picks: readonly RisingSnapshotPick[]): { lead: string; second: string | null } | null {
  if (!picks.length || !picks.some((p) => p.move)) return null;
  const ranked = picks.map((p, i) => ({ p, rank: i + 1, m: p.move ?? null }));
  const top = ranked[0];
  if (!top.m) return null;
  const lead =
    top.m?.kind === "same"
      ? `${top.p.displayName} remains at #1`
      : top.m?.kind === "up"
        ? `${top.p.displayName} climbs to #1 from #${top.m.prev}`
        : `${top.p.displayName} debuts at #1`;

  const rest = ranked.slice(1);
  const jump = (x: (typeof rest)[number]) => (x.m?.kind === "up" ? x.m.by : x.m?.kind === "new" ? Number.POSITIVE_INFINITY : 0);
  const intoTop3 = rest
    .filter((x) => x.rank <= 3 && (x.m?.kind === "new" || (x.m?.kind === "up" && x.m.prev > 3)))
    .sort((a, b) => jump(b) - jump(a) || a.rank - b.rank)[0];
  if (intoTop3) {
    return {
      lead,
      second: intoTop3.m?.kind === "new" ? `${intoTop3.p.displayName} debuts at #${intoTop3.rank}` : `${intoTop3.p.displayName} moves into the top 3`,
    };
  }
  const climber = rest.filter((x) => x.m?.kind === "up" && x.m.by >= 3).sort((a, b) => jump(b) - jump(a) || a.rank - b.rank)[0];
  if (climber && climber.m?.kind === "up") {
    return { lead, second: `${climber.p.displayName} climbs ${climber.m.by} places to #${climber.rank}` };
  }
  const debut = rest.find((x) => x.m?.kind === "new");
  if (debut) return { lead, second: `${debut.p.displayName} is the highest new entry, at #${debut.rank}` };
  const faller = rest
    .filter((x) => x.m?.kind === "down" && x.m.by >= 3)
    .sort((a, b) => (b.m?.kind === "down" ? b.m.by : 0) - (a.m?.kind === "down" ? a.m.by : 0) || a.rank - b.rank)[0];
  if (faller && faller.m?.kind === "down") {
    return { lead, second: `${faller.p.displayName} falls ${faller.m.by} places to #${faller.rank}` };
  }
  return { lead, second: null };
}

/** The one-line standfirst under the title. Same honesty rules. */
export function generateRisingSubtitle(data: RisingSnapshotData): string {
  // The RANKED set, not `qualifying`: on a v2 payload that is only the cards
  // with price signals, 0 for weeks after a break, and "Ranked from the 0
  // most-searched priced cards" above a 40-row table is the kind of false
  // number this file exists to prevent.
  return (
    `Ranked from the ${rankedFromCount(data).toLocaleString()} most-searched priced cards in ` +
    `${MARKET_LABEL(data.scope)}, by demand and price-timing signals. ` +
    `A snapshot taken at one moment — the live list re-ranks daily.`
  );
}

/**
 * RiseAnalysis → the frozen payload. Drops everything the public page doesn't
 * draw. `weekAgo` is the ranking a week before (lib/data.ts
 * getRisingWeekAgo), or null when it couldn't be rebuilt — the snapshot is
 * minted either way, just without movement.
 */
export function toSnapshotData(
  analysis: RiseAnalysis,
  scope: RiseScope,
  now = new Date(),
  weekAgo: WeekAgoRanking | null = null,
): RisingSnapshotData {
  const moves = weekAgo ? movementFromRanks(analysis.picks.map((p) => p.id), new Map(weekAgo.ranks)) : null;
  return {
    scope,
    generatedAt: now.toISOString(),
    // The admin sees every ranked card; so does the snapshot. Withholding rows
    // here would make the shared link a teaser rather than the thing it claims
    // to be, and a teaser is what the Premium page already is for free users.
    picks: analysis.picks.map((p) => ({
      id: p.id,
      slug: p.slug,
      displayName: p.displayName,
      setCode: p.setCode,
      collectorNumber: p.collectorNumber,
      imageThumbUrl: p.imageThumbUrl,
      score: p.score,
      priceCents: p.priceCents,
      currency: p.currency,
      trend7: p.trend7,
      trend30: p.trend30,
      posPct: p.posPct,
      listings: p.listings,
      spark: p.spark,
      confidence: p.confidence,
      vsLastWeekPct: p.vsLastWeekPct,
      priceSignals: p.priceSignals,
      reason: p.reason,
      move: moves?.get(p.id) ?? null,
    })),
    universeSize: analysis.universeSize,
    qualifying: analysis.qualifying,
    minPointsRequired: analysis.minPointsRequired,
    version: 2,
    weekAgo: weekAgo ? { asOf: weekAgo.asOf } : null,
  };
}
