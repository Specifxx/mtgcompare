"use client";
// Vercel Web Analytics custom event for every outbound buy click. Every buy
// link on the site goes through /go?u=…&s=<retailer>&m=<market>&p=<product>&from=<page>,
// so one delegated listener covers the price rows, eBay Picks, deals, guides
// and pre-orders without touching each component. Event: "buy_click" with
// retailer, market, product, page, plus the destination host. It sits next to
// the server-side ClickEvent row /go writes (admin dashboard); the Vercel
// event is the one visible in Vercel → Analytics → Events.
import { useEffect } from "react";
import { track } from "@vercel/analytics";
import { SITE } from "@/site.config";

const NAMES: Record<string, string> = {
  tcgplayer: "TCGplayer",
  ebay: "eBay",
  amazon: "Amazon",
  ...Object.fromEntries(SITE.stores.map((s) => [s.key, s.name])),
};

export function BuyClickTracker() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href^='/go?']") as HTMLAnchorElement | null;
      if (!a) return;
      try {
        const q = new URL(a.href, location.origin).searchParams;
        const source = q.get("s") ?? "unknown";
        let host = "";
        try {
          host = new URL(q.get("u") ?? "").hostname.replace(/^www\./, "");
        } catch {}
        track("buy_click", {
          retailer: NAMES[source] ?? source,
          retailer_key: source,
          market: q.get("m") ?? "US",
          product: q.get("p") ?? "",
          page: q.get("from") ?? location.pathname,
          host,
        });
      } catch {}
    };
    // Capture phase + auxclick: middle-clicks and new-tab opens count too.
    document.addEventListener("click", onClick, true);
    document.addEventListener("auxclick", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("auxclick", onClick, true);
    };
  }, []);
  return null;
}
