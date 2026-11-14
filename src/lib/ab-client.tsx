"use client";

import { track } from "./track";
import { createContext, useContext } from "react";
import { AB_SEEN, AB_STORE, abActive, armsString, outcomeOf, parseArms, tossArms, visitOf, type AbVisit } from "./ab";

// The browser half of lib/ab.ts: the visitor's arms (kept in their own localStorage), the quick view's context, and the two sends.
// Everything here fails to "no test": a browser without storage, a date outside the test, a server render all draw the control and
// send nothing.

/** The quick view's test visit; null everywhere else (the product page's own table, the server) and outside the test's dates. */
export const AbContext = createContext<AbVisit | null>(null);
export const useAb = (): AbVisit | null => useContext(AbContext);

/** This visitor's test visit for a quick view opened in `region`, tossing their coins on the first one. Null: not in the test. */
export function abVisit(region: string): AbVisit | null {
  try {
    if (typeof window === "undefined" || !abActive(Date.now())) return null;
    let arms = parseArms(window.localStorage.getItem(AB_STORE));
    if (!arms) {
      arms = tossArms(window.crypto.getRandomValues(new Uint8Array(3)));
      window.localStorage.setItem(AB_STORE, armsString(arms));
      // a browser that does not keep it would be re-tossed on every open: leave it out
      if (window.localStorage.getItem(AB_STORE) !== armsString(arms)) return null;
    }
    // MTG Compare's quick view has no small eBay + TCGplayer pair, so the `mini` test applies to nobody here ("-"): `order` and `cta` run.
    return visitOf(arms, region, false);
  } catch {
    return null;
  }
}

/** ab_seen, once a visit per key: the quick view showed its prices. */
export function abSeen(v: AbVisit | null): void {
  if (!v) return;
  try {
    if (window.sessionStorage.getItem(AB_SEEN) === v.k) return;
    window.sessionStorage.setItem(AB_SEEN, v.k);
    track("ab_seen", { k: v.k });
  } catch {
    /* no storage or analytics blocked: nothing to do */
  }
}

/**
 * A buy click inside the quick view: lib/ab.ts's outcome event, and ab_paid for any link that pays (eBay, TCGplayer, Amazon, an affiliate store). Each is sent once a visit (the
 * first click of its kind), so an event's count is "visits that clicked", a share of the visits ab_seen counted. buy_click, sent
 * beside it as always, still counts every click.
 */
export function abClick(v: AbVisit | null, retailer: string, placement: string, rel: string): void {
  if (!v) return;
  try {
    const outcome = outcomeOf(retailer, placement);
    // a store row pays only when its link is an affiliate link (rel sponsored: an Awin store, say)
    const paid = outcome !== "ab_store" || /\bsponsored\b/.test(rel);
    for (const name of paid ? [outcome, "ab_paid"] : [outcome]) {
      const key = `${AB_SEEN}:${name}`;
      if (window.sessionStorage.getItem(key) === v.k) continue;
      window.sessionStorage.setItem(key, v.k);
      track(name, { k: v.k });
    }
  } catch {
    /* analytics must never get in the way of the link */
  }
}
