// The eBay stand-out A/B (owner, 2026-11-19: "the eBay clicks fell … due to the color change … we can do something even more than
// just a color change … make it stand out even more"). Every visitor already gets eBay's blue button (.btn-ad). This test asks whether
// making eBay stand out further wins more eBay clicks: 50/50 in the browser (localStorage `ebay-pop`).
//   "b"   today's look.
//   "pop" eBay's button bolder and larger with a soft blue halo, and the list row that holds one tinted eBay blue with a blue edge
//         (globals.css, "The eBay stand-out A/B"). No new words, no new claim, no position change, no extra eBay API call.
// NOT IN THE QUICK VIEW: its own A/B runs 20 Nov to 3 Dec (lib/ab.ts) and nothing there may change, so the CSS and the counting both
// skip anything inside a [role="dialog"].
// Counted through ONE event, `ebay_pop` {k}: "<arm>:seen" once a visit, "<arm>:ebay" on the visit's first eBay click outside the quick
// view. Read 3 Dec: visits with an eBay click per 100 visits, per arm. Keep it: make ebayPop() return "pop"; drop it: "b".
import { track } from "./track";

export const EBAY_POP_KEY = "ebay-pop";
const SEEN = "ebay-pop-seen";
const CLICKED = "ebay-pop-clicked";

export function ebayPop(): "b" | "pop" {
  try {
    const had = localStorage.getItem(EBAY_POP_KEY);
    if (had === "b" || had === "pop") return had;
    const arm = Math.random() < 0.5 ? "b" : "pop";
    localStorage.setItem(EBAY_POP_KEY, arm);
    return arm;
  } catch {
    return "b";
  }
}

/** Sets `<html data-ebaypop>` and counts the visit once (browser only). */
export function applyEbayPop(): void {
  if (typeof document === "undefined") return;
  const arm = ebayPop();
  document.documentElement.setAttribute("data-ebaypop", arm);
  once(SEEN, () => track("ebay_pop", { k: `${arm}:seen` }));
}

/** An eBay buy click: counts the visit's first one outside the quick view. */
export function ebayPopClick(el: Element | null): void {
  if (!el || el.closest('[role="dialog"]')) return;
  let arm = "";
  try {
    arm = localStorage.getItem(EBAY_POP_KEY) ?? "";
  } catch {
    return;
  }
  if (arm !== "b" && arm !== "pop") return;
  once(CLICKED, () => track("ebay_pop", { k: `${arm}:ebay` }));
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
