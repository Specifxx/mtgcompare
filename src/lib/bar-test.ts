// The phone buy bar test (Head of Conversion, 2026-11-27; strategy/marketplace-placement-2026-11-24.html). The phone buy bar
// (components/StickyBuyBar.tsx) repeats the page's best price, and that is usually a store that pays nothing (about two of every three
// buy clicks go to unpaid stores). The question: does the bar earn more if it carries the page's paid link instead?
//   "store" today's bar: the best-price card's store (or eBay's listing where it is cheaper, as now).
//   "paid"  where today's bar would show an unpaid store, it shows the cheaper of the page's own eBay listing and TCGplayer's in-stock
//           offer in this region's currency, labelled "Ad" with its real price and link. Never a converted price, never a claim that it
//           is the cheapest; the best-price card and the table above it are unchanged. Neither one there: the store, as today.
// Product pages on a phone only (the bar is lg:hidden), never the quick view. 50/50 in the browser (localStorage `bar-test`), from
// BAR_TEST_START (the A/B freeze runs to 2 Dec). Counted through ONE event, `bar_test` {k}: "<arm>:seen" once a visit when a phone
// product page is drawn (an impression: sampled 1 in 10 visitors with w:10, lib/track.ts), then "<arm>:paid" / "<arm>:store" on that
// visit's first buy click of each kind anywhere on a product page (unsampled; multiply seen by w when reading).
// Read 16 Dec: paid clickers per 100 phone product-page visitors, per arm. Keep "paid": make barArm() return "paid"; drop it: delete this
// file and its calls.
import { track } from "./track";

export const BAR_TEST_KEY = "bar-test";
export const BAR_TEST_START = Date.parse("2026-12-03T00:00:00Z");
const SEEN = "bar-test-seen";

export type BarArm = "store" | "paid";

/** This visitor's arm, tossing the coin on first sight. Null: before the start, on a desktop, no storage, or not in a browser. */
export function barArm(now: number = Date.now()): BarArm | null {
  try {
    if (typeof window === "undefined" || now < BAR_TEST_START) return null;
    if (window.matchMedia?.("(min-width: 1024px)").matches) return null;
    let arm = window.localStorage.getItem(BAR_TEST_KEY);
    if (arm !== "store" && arm !== "paid") {
      arm = Math.random() < 0.5 ? "store" : "paid";
      window.localStorage.setItem(BAR_TEST_KEY, arm);
      if (window.localStorage.getItem(BAR_TEST_KEY) !== arm) return null;
    }
    return arm as BarArm;
  } catch {
    return null;
  }
}

/** A phone product page was drawn: count the visit once, and return the arm. */
export function barTestSeen(): BarArm | null {
  const arm = barArm();
  if (!arm) return null;
  once(SEEN, () => track("bar_test", { k: `${arm}:seen` }));
  return arm;
}

/** A buy click: the visit's first paid and first store click, only in a visit that saw a phone product page, never in the quick view. */
export function barTestClick(el: Element | null, rel: string): void {
  if (!el || el.closest('[role="dialog"]')) return;
  try {
    if (!/^\/[a-z]{2}\/p\//.test(location.pathname)) return;
    if (!sessionStorage.getItem(SEEN)) return;
    const arm = localStorage.getItem(BAR_TEST_KEY);
    if (arm !== "store" && arm !== "paid") return;
    const kind = /\bsponsored\b/.test(rel) ? "paid" : "store";
    once(`${SEEN}-${kind}`, () => track("bar_test", { k: `${arm}:${kind}` }));
  } catch {
    return;
  }
}

/** Which paid link the "paid" arm's bar carries: the cheaper of the two priced ones, eBay on a tie; null when neither is there. */
export function paidChoice(ebayCents: number | null, tcgCents: number | null): "ebay" | "tcg" | null {
  if (ebayCents == null && tcgCents == null) return null;
  if (tcgCents == null) return "ebay";
  if (ebayCents == null) return "tcg";
  return tcgCents < ebayCents ? "tcg" : "ebay";
}

function once(key: string, send: () => void): void {
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    return;
  }
  send();
}
