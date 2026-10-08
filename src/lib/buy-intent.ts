"use client";

// WHERE THE BUY IS, AND WHETHER IT HAS HAPPENED YET (RiftCompare's
// lib/buy-intent.ts, parity P43).
//
// buy_click is the event every affiliate dollar depends on, and the sign-up
// popup (LaunchPromoPopup) is the one thing on the site that can cover it up.
// This module is the shared signal between the two, so the popup stays off the
// buy path without either side hardcoding a list of "pages with buy links": a
// list that would rot the first time a new surface rendered an OutboundLink.
//
// Two facts, both cheap:
//
//   registerBuyLink()  OutboundLink calls this on mount/unmount, so
//                      buyLinksOnPage() answers "can this visitor buy something
//                      right now?" for whatever page they are on, with no path
//                      list to maintain.
//
//   markBuyClick()     OutboundLink calls this when a buy link is actually
//                      clicked. Buy links open in a NEW TAB (target="_blank"),
//                      so the visitor is still here afterwards, having got
//                      exactly what they came for: the best moment on the site
//                      to ask for a sign-up, and the only one that cannot cost a
//                      buy_click, because the click already happened.
//
// The flag is per SESSION (tab): someone who bought something this session has
// cleared the bar for the rest of it. buyPathClear() is the rule the popup
// applies; useBuyPathClear() is its React form. Without an OutboundLink that
// registers (WP06 owns it, REQ-WP18-8) buyLinksOnPage() stays false and the
// popup behaves exactly as before.
import { useEffect, useState } from "react";

const BOUGHT_KEY = "mc_bought_this_session";
export const BUY_CLICK_EVENT = "mc:buy_click";
/** Fired whenever the number of buy links on the page changes, so a waiting popup can look again. */
export const BUY_LINKS_EVENT = "mc:buy_links";

let liveBuyLinks = 0;

function announce(name: string): void {
  try {
    window.dispatchEvent(new CustomEvent(name));
  } catch {
    /* non-browser / very old engine: the counters and the session flag still carry the answer */
  }
}

/** OutboundLink mount/unmount. Returns the unregister function. */
export function registerBuyLink(): () => void {
  liveBuyLinks += 1;
  announce(BUY_LINKS_EVENT);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    liveBuyLinks = Math.max(0, liveBuyLinks - 1);
    announce(BUY_LINKS_EVENT);
  };
}

/** Is there anything on this page the visitor could click through and buy? */
export function buyLinksOnPage(): boolean {
  return liveBuyLinks > 0;
}

/** Has this visitor already clicked out to a store this session? */
export function hasBoughtThisSession(): boolean {
  try {
    return sessionStorage.getItem(BOUGHT_KEY) === "1";
  } catch {
    // Private mode: fail to FALSE. A consumer treats "unknown" as "not yet
    // bought", which keeps it off the buy path, the safe direction for the
    // metric this whole module exists to protect.
    return false;
  }
}

/** Called from OutboundLink's click handler, after the buy_click event. */
export function markBuyClick(): void {
  try {
    sessionStorage.setItem(BOUGHT_KEY, "1");
  } catch {
    /* private mode: the event below still fires, so a listener still hears it */
  }
  announce(BUY_CLICK_EVENT);
}

/**
 * The popup's rule, pure: a page with no buy link is free to be asked on; a page with one is
 * left alone until the visitor has clicked out to buy this session. `bought` unknown is false.
 */
export function buyPathClear(buyLinks: boolean, bought: boolean): boolean {
  return !buyLinks || bought;
}

/** React form of buyPathClear: re-evaluates when a buy link mounts or goes, and after a buy click. True on the server and first paint (no buy link is known yet). */
export function useBuyPathClear(): boolean {
  const [clear, setClear] = useState(true);
  useEffect(() => {
    const look = () => setClear(buyPathClear(buyLinksOnPage(), hasBoughtThisSession()));
    look();
    window.addEventListener(BUY_LINKS_EVENT, look);
    window.addEventListener(BUY_CLICK_EVENT, look);
    return () => {
      window.removeEventListener(BUY_LINKS_EVENT, look);
      window.removeEventListener(BUY_CLICK_EVENT, look);
    };
  }, []);
  return clear;
}
