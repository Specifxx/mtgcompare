"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ADSENSE_CLIENT_ID, AD_UNITS_ENABLED } from "@/lib/adsense";

// One in-content slot (RiftCompare's AdSlot). Renders exactly one of:
//   - a real AdSense <ins> unit: only when a publisher id is configured AND the
//     page is neither thin nor noindex;
//   - a first-party house promo: the default (no network, no tracking);
//   - nothing: thin or noindex pages (monetising a page we tell Google not to
//     index is a made-for-advertising page), and for ad-free members the whole
//     slot carries data-ad-placement, so the root's ad-free CSS hides it.
// The frame is a fixed-height, overflow-hidden box, so whatever lands in it
// (promo, ad, or an unfilled unit that collapses) never moves the layout.
// The AdSense loader script is separate (AdSenseLoader) and never gated here.
const HOUSE_ADS = [
  { title: "This week's biggest price moves", sub: "Risers, drops and best-value buys, updated daily", cta: "See the movers", href: "/movers" },
  { title: "Is that booster box worth opening?", sub: "Run the numbers against live singles prices", cta: "Box EV calculator", href: "/tools/box-ev" },
  { title: "The MTG Compare Index", sub: "The whole Magic market in one number", cta: "View the index", href: "/market" },
  { title: "Pay less for the same cards", sub: "Best Basket finds the cheapest stores for a whole order, postage included", cta: "Open Best Basket", href: "/tools/best-basket" },
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function HouseAd({ seed, height }: { seed: string; height: number }) {
  const ad = HOUSE_ADS[hashStr(seed) % HOUSE_ADS.length];
  return (
    <Link href={ad.href} className="relative flex h-full w-full items-center justify-between gap-3 overflow-hidden rounded-xl border border-ink-700 bg-gradient-to-r from-ink-900 to-ink-850 px-4 transition-colors hover:border-brand-500" style={{ height }}>
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold text-white">{ad.title}</span>
        <span className="block truncate text-xs text-slate-400">{ad.sub}</span>
      </span>
      <span className="hidden shrink-0 rounded-lg border border-brand-500/40 bg-brand-500/10 px-3 py-1.5 text-xs font-bold text-brand-400 sm:block">{ad.cta} →</span>
      <span className="absolute right-1 top-1 rounded bg-ink-950/70 px-1 text-[9px] font-semibold uppercase tracking-wide text-slate-500">MTG Compare</span>
    </Link>
  );
}

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

// Pushed once per mount; the ref guard matters because React StrictMode double-invokes
// effects in development and a double push throws, which would kill every later slot.
function AdSenseUnit({ slot, height }: { slot: string; height: number }) {
  const pushed = useRef(false);
  useEffect(() => {
    if (pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle ?? []).push({});
    } catch {
      /* loader blocked or not present: the slot stays empty */
    }
  }, []);
  return <ins className="adsbygoogle block" style={{ display: "block", height, width: "100%" }} data-ad-client={ADSENSE_CLIENT_ID ?? undefined} data-ad-slot={slot} data-ad-format="auto" data-full-width-responsive="true" />;
}

// Mount the real unit only once the slot nears the viewport, so a page with a
// dozen slots does not fire a dozen ad requests at once.
function useNearViewport<T extends HTMLElement>(rootMargin = "200px") {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (near) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setNear(true);
        io.disconnect();
      }
    }, { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [near, rootMargin]);
  return [ref, near] as const;
}

export function AdSlot({ slot, seed, height = 100, thin = false, noindex = false, className = "" }: { slot: string; seed?: string; height?: number; thin?: boolean; noindex?: boolean; className?: string }) {
  const [ref, near] = useNearViewport<HTMLDivElement>();
  if (thin || noindex) return null;
  const real = AD_UNITS_ENABLED;
  return (
    <div ref={ref} data-ad-placement={`slot-${slot}`} className={`w-full ${className}`} style={{ height }} aria-label="Advertisement">
      {real ? near ? <AdSenseUnit slot={slot} height={height} /> : null : <HouseAd seed={seed ?? slot} height={height} />}
    </div>
  );
}
