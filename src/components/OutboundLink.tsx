"use client";

import { track } from "@vercel/analytics";
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
}) {
  function record() {
    try {
      track("buy_click", { retailer: retailer.slice(0, 255), placement: placement.slice(0, 255) });
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
