"use client";

import { track } from "@/lib/track";
import { gaEvent } from "@/lib/gtag";
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
  function record() {
    try {
      track("buy_click", { retailer: retailer.slice(0, 255), placement: placement.slice(0, 255) });
      // GA4 (lib/gtag.ts, a no-op without NEXT_PUBLIC_GA_ID): a paid link (eBay, TCGplayer: rel "sponsored") is affiliate_click.
      gaEvent(/\bsponsored\b/.test(rel) ? "affiliate_click" : "outbound_store_click", { retailer: retailer.slice(0, 100), placement, link_domain: hostOf(href) });
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
        if (e.button === 0) record();
      }}
      onAuxClick={(e) => {
        if (e.button === 1) record();
      }}
    >
      {children}
    </a>
  );
}
