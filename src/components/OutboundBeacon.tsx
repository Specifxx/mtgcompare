"use client";

import { useEffect } from "react";
import { buyClickProps } from "@/lib/buy-click";
import { readEntrySource } from "@/lib/entry-source";

// The outbound click log's browser half (contract 10.32): one document listener, in the capture phase, that reports a click on any a[data-retailer] (price
// rows, the eBay and TCGplayer buttons, the chase strip, Deal Finder, Best Basket ...) to POST /api/click with navigator.sendBeacon, which survives the
// navigation that follows. The body is retailer, page, card (the product's slug) and the visit's entry bucket; the server adds the market, clips every field
// again and writes nothing per click (it buffers and flushes in the half-hour window). A middle-click opens a tab and counts too. /admin is never logged.
//
// It reads no consent signal: the log carries no cookie, no user id, no IP and no URL (first-party, anonymous counts of which retailer earns), and it is
// switched off by CLICK_LOG=0 on the server. GA's and Vercel's buy_click are separate listeners and unaffected. Renders nothing.
export function OutboundBeacon() {
  useEffect(() => {
    const report = (e: MouseEvent) => {
      if (e.type === "auxclick" && e.button !== 1) return;
      const a = (e.target as Element | null)?.closest?.("a[data-retailer]");
      if (!a || location.pathname.startsWith("/admin")) return;
      const props = buyClickProps(
        { retailer: a.getAttribute("data-retailer"), page: a.getAttribute("data-page"), card: a.getAttribute("data-card"), surface: a.getAttribute("data-surface") },
        location.pathname,
      );
      if (!props) return;
      try {
        const body = JSON.stringify({ retailer: props.retailer, page: props.page, card: props.card, entry: readEntrySource() });
        navigator.sendBeacon?.("/api/click", new Blob([body], { type: "application/json" }));
      } catch {
        /* a log failure never gets in the way of the click */
      }
    };
    document.addEventListener("click", report, true);
    document.addEventListener("auxclick", report, true);
    return () => {
      document.removeEventListener("click", report, true);
      document.removeEventListener("auxclick", report, true);
    };
  }, []);
  return null;
}
