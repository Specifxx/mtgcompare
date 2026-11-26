"use client";

import { abClick, useAb } from "@/lib/ab-client";
import { ebayPopClick } from "@/lib/ebay-pop";
import { track } from "@/lib/track";
import { isCheckoutLink } from "@/lib/checkout-link";
import { gaEvent } from "@/lib/gtag";
import { readCampaign } from "@/lib/campaign";
import type { ReactNode } from "react";
import type { Placement } from "@/lib/affiliate";

// Every outbound buy link — to a store, TCGplayer or eBay — is one of these. A
// plain <a target="_blank">: no redirect hop and no JS navigation, so a click
// lands exactly where the href says and the affiliate networks see it untouched
// (the same design as Rift Compare's OutboundLink).
//
// It records one Vercel Web Analytics event per click:
//   buy_click { retailer: "Pokebox (AU)" | "TCGplayer" | "eBay (ebay.com.au)", placement }
// EXACTLY two properties: Vercel's Pro plan keeps two custom-event properties
// per event and drops the rest (Hobby records no custom events at all), so a
// third one would silently cost us one of these. See DEPLOY.md.
//
// Middle-click opens a tab without a `click` event, so it is caught through
// auxclick (button 1 only; right-click is button 2 and opens a menu, not the
// link). Each handler takes only its own button, so one click never fires both.
function hostOf(href: string): string {
  try {
    return new URL(href).hostname;
  } catch {
    return "";
  }
}

/**
 * The click's context, read from the DOM at click time (2026-11-17, growth report item 1): which row of its price list the link is in
 * (`pos`, 1 = first row drawn), where it ranks by item price among the list's priced rows (`rank`, ties share) and how far above the
 * cheapest that is (`gap_pct`). Rows say their price with data-cents (StoreRow, EbayOfferRow); a link outside a row sends none of the
 * three. Item price only, never converted, never postage. Pure reads: nothing is stored or fetched.
 */
export function rowContext(el: Element | null): { pos?: number; rank?: number; gap_pct?: number } {
  const row = el?.closest?.("[data-offer-row]");
  const list = row?.parentElement;
  if (!row || !list) return {};
  const rows = Array.from(list.children).filter((c) => c.hasAttribute("data-offer-row"));
  const out: { pos?: number; rank?: number; gap_pct?: number } = { pos: rows.indexOf(row) + 1 };
  const mine = Number(row.getAttribute("data-cents"));
  const prices = rows.map((c) => Number(c.getAttribute("data-cents"))).filter((n) => Number.isFinite(n) && n > 0);
  if (mine > 0 && prices.length) {
    const cheapest = Math.min(...prices);
    out.rank = prices.filter((n) => n < mine).length + 1;
    out.gap_pct = Math.round(((mine - cheapest) / cheapest) * 1000) / 10;
  }
  return out;
}

/** The market the page shows: the region in its path (/au/p/…), else "" (the home, a guide, a blog post). */
function regionOfPath(pathname: string): string {
  const seg = pathname.split("/")[1] ?? "";
  return /^(us|au|uk|ca|nz|sg|eu)$/.test(seg) ? seg : "";
}

export function OutboundLink({
  href,
  rel,
  retailer,
  placement,
  className,
  title,
  children,
  "aria-label": ariaLabel,
  onFocus,
  amazon,
}: {
  href: string;
  rel: string;
  retailer: string;
  placement: Placement;
  className?: string;
  title?: string;
  children: ReactNode;
  "aria-label"?: string;
  onFocus?: (e: React.FocusEvent<HTMLAnchorElement>) => void;
  /** An Amazon AU link (lib/amazon.ts): also GA4's amazon_click {product, region, page}. Vercel still gets only buy_click. */
  amazon?: { product: string; region: string; page: string };
}) {
  // Inside the quick view during an A/B test (lib/ab.ts): the click also counts for the visitor's arms. Null everywhere else.
  const ab = useAb();
  function record(el: Element | null) {
    // The after-buy price alert offer listens for this (components/AfterBuyAlert.tsx); nothing else does.
    try {
      window.dispatchEvent(new Event("buyclick"));
    } catch {
      /* never in the link's way */
    }
    abClick(ab, retailer, placement, rel);
    if (/^ebay/i.test(retailer)) ebayPopClick(el);
    try {
      track("buy_click", { retailer: retailer.slice(0, 255), placement: placement.slice(0, 255), link_type: isCheckoutLink(href) ? "checkout" : "product" });
      // GA4 (lib/gtag.ts, a no-op without NEXT_PUBLIC_GA_ID): a paid link (eBay, TCGplayer: rel "sponsored") is affiliate_click.
      // GA4 has no two-property limit, so the click log's fields go here (Vercel's buy_click stays {retailer, placement, link_type}, and
      // already carries the page path and the visitor's country itself): paid, the row's position, its price rank and the gap to the
      // cheapest. `store` is the retailer; `region` the market in the path.
      const paid = /\bsponsored\b/.test(rel);
      gaEvent(paid ? "affiliate_click" : "outbound_store_click", {
        retailer: retailer.slice(0, 100),
        placement,
        // The tab's first-touch utm_campaign (a creator's handle), so paid creators' buy clicks can be counted (lib/campaign.ts).
        campaign: readCampaign(),
        link_domain: hostOf(href),
        paid: paid ? 1 : 0,
        nudge_arm: (() => { try { return localStorage.getItem("rn-arm") ?? ""; } catch { return ""; } })(),
        page: typeof location !== "undefined" ? location.pathname.slice(0, 100) : "",
        region: typeof location !== "undefined" ? regionOfPath(location.pathname) : "",
        ...rowContext(el),
      });
      if (amazon) gaEvent("amazon_click", { product: amazon.product.slice(0, 100), region: amazon.region, page: amazon.page.slice(0, 100) });
    } catch {
      /* analytics must never get in the way of the link */
    }
  }
  return (
    <a
      href={href}
      target="_blank"
      rel={rel}
      className={className}
      title={title}
      aria-label={ariaLabel}
      onFocus={onFocus}
      onClick={(e) => {
        if (e.button === 0) record(e.currentTarget);
      }}
      onAuxClick={(e) => {
        if (e.button === 1) record(e.currentTarget);
      }}
    >
      {children}
    </a>
  );
}
