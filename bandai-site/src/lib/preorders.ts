import { SITE } from "@/site.config";
import type { SetInfo } from "./site-types";

// One pre-order landing page per release (/preorders/<set slug>), the way Rift
// Compare's /radiance-preorders became its most visited page: a release-specific
// title ("<game> <set> Pre-Order Prices"), the set's sealed products with every
// store's price, its facts, and an FAQ. /preorders is the hub that lists them.
//
// SELF-RETIRING. A set has a page while it is upcoming and for RELEASED_WINDOW_DAYS
// after release (then titled "<set> Booster Box Prices": release week is when the
// most people search for a box). After that the URL redirects to the set page,
// so no stale page lingers in Google competing with the card list.

export const RELEASED_WINDOW_DAYS = 45;
const DAY = 86_400_000;

/** Today as YYYY-MM-DD (UTC). */
export const todayIso = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

/** Still a pre-order: flagged upcoming by TCGplayer, or a release date after today. */
export function isPreorder(s: Pick<SetInfo, "upcoming" | "releasedOn">, today = todayIso()): boolean {
  return s.upcoming || (!!s.releasedOn && s.releasedOn > today);
}

/** Inside the page's life: upcoming, or released within RELEASED_WINDOW_DAYS. */
export function inPreorderWindow(s: Pick<SetInfo, "upcoming" | "releasedOn">, today = todayIso()): boolean {
  if (isPreorder(s, today)) return true;
  if (!s.releasedOn) return false;
  const age = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${s.releasedOn}T00:00:00Z`)) / DAY;
  return age >= 0 && age <= RELEASED_WINDOW_DAYS;
}

/**
 * The sets that get a page, upcoming first (soonest release first), then the
 * recently released ones (newest first). `sealed` counts a set's sealed
 * products and booster boxes: a set with nothing sealed (a promo group, a
 * placeholder TCGplayer group) has nothing to compare, and a released set needs
 * a booster box, since its page is then "<set> Booster Box Prices" (a starter
 * deck release is just its product page).
 *
 * `curated` (2026-11-02): an UPCOMING set the site has written pre-order copy
 * for (src/content/preorders.ts) gets its page before any store lists it, so
 * an announced main set ("GD07 pre-order") has a landing from the day it is
 * announced; the page says no store lists it yet. Promo groups and
 * placeholders have no copy, so they still need a sealed product.
 */
export function preorderSets(all: SetInfo[], sealed: (s: SetInfo) => { products: number; boxes: number }, today = todayIso(), curated: (s: SetInfo) => boolean = () => false): SetInfo[] {
  const live = all.filter((s) => {
    if (!inPreorderWindow(s, today)) return false;
    if (isPreorder(s, today) && curated(s)) return true;
    const n = sealed(s);
    return n.products > 0 && (isPreorder(s, today) || n.boxes > 0);
  });
  const up = live.filter((s) => isPreorder(s, today)).sort((a, b) => (a.releasedOn ?? "9999").localeCompare(b.releasedOn ?? "9999"));
  const out = live.filter((s) => !isPreorder(s, today)).sort((a, b) => (b.releasedOn ?? "").localeCompare(a.releasedOn ?? ""));
  return [...up, ...out];
}

export const preorderPath = (s: Pick<SetInfo, "slug">) => `/preorders/${s.slug}`;

/** The set's name with the game in front unless it already says it. */
function named(setName: string): string {
  const g = SITE.gameShort;
  return setName.toLowerCase().includes(g.toLowerCase()) ? setName : `${g} ${setName}`;
}

/** Title ladder for seo-title.ts fitTitle: "booster box" and "pre-order" are the words people search before a release. */
export function preorderTitleCandidates(setName: string, pre: boolean): string[] {
  const n = named(setName);
  return pre
    ? [`${n} Pre-Order Prices: Booster Box Compared`, `${n} Booster Box Pre-Order Prices`, `${setName} Booster Box Pre-Order Prices`, `${setName} Pre-Order Prices`, `${setName} Pre-Orders`]
    : [`${n} Booster Box Prices: Every Store Compared`, `${n} Booster Box Prices`, `${setName} Booster Box Prices`, `${setName} Prices`];
}

/** "13 November 2026" from an ISO date. */
export function longDate(iso: string | null): string {
  if (!iso) return "to be announced";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** Whole days from today until the release (0 on release day), or null once out or undated. */
export function daysUntil(iso: string | null, today = todayIso()): number | null {
  if (!iso || iso < today) return null;
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY);
}
