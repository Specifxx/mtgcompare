import { SET_BY_CODE, SETS, type MtgSet } from "./sets";

/** Has this set not shipped yet? Open offers for it are pre-orders. */
export function isPreorderSet(setCode: string | null | undefined, now: Date = new Date()): boolean {
  if (!setCode) return false;
  const s = SET_BY_CODE.get(setCode);
  if (!s) return false;
  return s.releaseDate > now.toISOString().slice(0, 10);
}

export function formatRelease(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

// ─── Featuring balance (owner's creator feedback, 2026-10-25: "Reality Fracture just came out but Star Trek is popping up") ──────
// Wherever a page leads with a set (the region home's "Hot right now" and latest sets, the landing picks, the hot-set eBay button),
// the newest RELEASED set leads; the next set on pre-order comes second (or only in its own pre-order slot). A rule by date, so it
// moves on by itself on each release day: no set name is written here.

/** The newest set out on `today` (YYYY-MM-DD), or null. */
export function newestReleasedSet(today: string = new Date().toISOString().slice(0, 10)): MtgSet | null {
  let best: MtgSet | null = null;
  for (const s of SETS) if (s.releaseDate <= today && (!best || s.releaseDate > best.releaseDate)) best = s;
  return best;
}

/**
 * `codes` (any order the caller ranks by, most wanted first) reordered for featuring: the newest released set first (or, when the
 * list lacks it, the caller's first released one), then the upcoming sets soonest first, then the rest in the caller's order. A code
 * not in sets.ts (no date) counts as released and keeps its place among the rest.
 */
export function featureOrder(codes: readonly string[], today: string = new Date().toISOString().slice(0, 10)): string[] {
  const newest = newestReleasedSet(today)?.code;
  const date = (c: string) => SET_BY_CODE.get(c)?.releaseDate ?? "";
  const upcoming = codes.filter((c) => date(c) > today).sort((a, b) => date(a).localeCompare(date(b)));
  const released = codes.filter((c) => !upcoming.includes(c));
  // the newest released set when the list has it, else the caller's first released one: never a pre-order first
  const head = newest && released.includes(newest) ? newest : released[0];
  return head === undefined ? upcoming : [head, ...upcoming, ...released.filter((c) => c !== head)];
}

/** A product list reordered the same way by its set (stable within a set): the newest released set's products lead. */
export function featureSort<T extends { setCode: string | null }>(items: readonly T[], today: string = new Date().toISOString().slice(0, 10)): T[] {
  const codes = [...new Set(items.map((p) => p.setCode ?? ""))];
  const order = featureOrder(codes, today);
  return items.map((p, i) => ({ p, i })).sort((a, b) => order.indexOf(a.p.setCode ?? "") - order.indexOf(b.p.setCode ?? "") || a.i - b.i).map((x) => x.p);
}
