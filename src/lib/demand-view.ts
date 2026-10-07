// WHO SEES WHAT ON DEMAND FINDER (RiftCompare's lib/demand-view.ts) — pure, no database, so the entitlement can
// be tested by running it (tests/demand-finder.test.ts) rather than by reading
// the page's source.
//
// Demand Finder (/tools/demand) is Premium (isPremium(user, "premium"); owner,
// 2026-09-25: Plus was "not much different to premium"). Anyone below that —
// signed out, a free account or Plus — gets EXACTLY the free "Most searched
// this week" strip that /movers shows every visitor: the top FREE_DEMAND_ROWS
// by searches over 7 days, searches only. Never the most-viewed list, the
// 30-day window, the view counts or a deeper list. The page asks the loader
// for no more than that, so the rest never reaches the HTML or RSC payload.

// The windows anyone can ask for. A fixed set, so the loader's cache holds at
// most two entries a day, whatever a query string says.
export const DEMAND_WINDOWS = [7, 30] as const;
export type DemandWindowDays = (typeof DEMAND_WINDOWS)[number];

// The free strip's size — on /movers and on /tools/demand alike — and
// Demand Finder's full lists (Premium). OP Compare keeps every tier number in
// lib/tier-limits.ts (wave-2 plan §1: import, never redeclare); re-exported
// here so the pure who-sees-what rules read as RiftCompare's do.
import { FREE_DEMAND_ROWS, PREMIUM_DEMAND_ROWS } from "./tier-limits";
export { FREE_DEMAND_ROWS, PREMIUM_DEMAND_ROWS };

export type DemandList = "searched" | "viewed";
export type DemandAccess = "full" | "free";

export function parseDemandWindow(v: string | undefined): DemandWindowDays {
  return v === "30" ? 30 : 7;
}

export function parseDemandList(v: string | undefined): DemandList {
  return v === "viewed" ? "viewed" : "searched";
}

/** The one getTopDemand call a viewer's access allows. Free = the /movers strip's call. */
export function demandQueryFor(access: DemandAccess, days: DemandWindowDays): { days: DemandWindowDays; limit: number } {
  return access === "full" ? { days, limit: PREMIUM_DEMAND_ROWS } : { days: 7, limit: FREE_DEMAND_ROWS };
}

/** The rows a viewer may see. Free is always the most-searched list, capped at the strip's size. */
export function visibleDemandRows<T>(result: { bySearch: T[]; byView: T[] }, access: DemandAccess, list: DemandList): T[] {
  if (access === "full") return list === "viewed" ? result.byView : result.bySearch;
  return result.bySearch.slice(0, FREE_DEMAND_ROWS);
}
