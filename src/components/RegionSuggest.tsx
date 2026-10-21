"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { REGIONS, X_DEFAULT_REGION, isRegion, regionFromTimeZone, type Region } from "@/lib/regions";
import { EbayStrip } from "./EbayStrip";

/**
 * The landing page's guess at the visitor's region: the one they last browsed (RegionSwitcher remembers it), else their time
 * zone's. A suggestion, never a redirect: the landing page stays crawlable and a traveller can pick another region. Unknown
 * until mount (the page is static, the same HTML for everyone), and null when the time zone maps to no region (UTC, Asia/Tokyo).
 */
export function useSuggestedRegion(): { known: boolean; region: Region | null } {
  const [s, setS] = useState<{ known: boolean; region: Region | null }>({ known: false, region: null });
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("dex-region");
    } catch {
      /* storage blocked */
    }
    let tz: string | undefined;
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      /* no Intl time zone */
    }
    setS({ known: true, region: isRegion(saved) ? saved : regionFromTimeZone(tz) });
  }, []);
  return s;
}

/**
 * The hero's call to action, in a box of fixed height the page gives it (h-12). The server's HTML (and a visitor whose time zone
 * names no region) gets "Choose your region ↓", a jump to the region grid; once the region is known it becomes "Continue to
 * Australia →". A new element (keyed), not a reflowed one, so the swap is no layout shift, and the box is never empty.
 *
 * It also points the hero's plain GET search form (`formId`, server markup) at the suggested region's search, by changing its
 * action attribute only: the US until then, and when no region is suggested.
 */
export function RegionSuggest({ formId }: { formId?: string }) {
  const { region } = useSuggestedRegion();
  useEffect(() => {
    if (formId) document.getElementById(formId)?.setAttribute("action", `/${region ?? X_DEFAULT_REGION}/sealed`);
  }, [formId, region]);
  if (!region) {
    return (
      <a key="choose" href="#regions" className="btn-primary h-12 px-6 text-base shadow-lift">
        Choose your region <span aria-hidden="true">↓</span>
      </a>
    );
  }
  const r = REGIONS[region];
  return (
    <Link key="continue" href={`/${r.region}`} className="btn-primary h-12 px-6 text-base shadow-lift">
      <span aria-hidden="true">{r.flag}</span> Continue to {r.name} <span aria-hidden="true">→</span>
    </Link>
  );
}

/** "What we compare": each type is a link to its page in the suggested region (the US in the server's HTML and with no suggestion). */
export function SuggestedTypeLinks({ types }: { types: { slug: string; label: string }[] }) {
  const { region } = useSuggestedRegion();
  const to = region ?? X_DEFAULT_REGION;
  return (
    <ul className="flex flex-wrap justify-center gap-2" aria-label={`Product types in ${REGIONS[to].inName}`}>
      {types.map((t) => (
        <li key={t.slug}>
          <Link href={`/${to}/type/${t.slug}`} prefetch={false} className="chip min-h-10">
            {t.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

// Which eBay a region's links go to (affiliate.ts EBAY_FOR_REGION), as the strip's top line names it: the landing page has no
// region of its own, so the strip always says whose eBay it is ("Live listings on eBay Australia" for a New Zealand visitor).
const EBAY_SITE_LABEL: Record<Region, string> = { au: "Australia", nz: "Australia", us: "US", uk: "UK", ca: "Canada", eu: "Germany", sg: "US" };

/**
 * The landing page's one eBay unit, for the suggested region, exactly as the 404's (NotFoundEbay): laid out but invisible until the
 * region is known, then shown in the same render, with nothing in it whose height depends on the region (regionKnown={false}).
 * It fetches only near the viewport, by which time the region is known. No suggestion: the US.
 */
export function SuggestedEbayStrip() {
  const { known, region } = useSuggestedRegion();
  const to = region ?? X_DEFAULT_REGION;
  return (
    <div style={{ visibility: known ? "visible" : "hidden" }}>
      <EbayStrip
        region={to}
        context="chase"
        placement="listings-landing"
        site={EBAY_SITE_LABEL[to]}
        regionKnown={false}
        search={{ kind: "card", query: "" }}
      />
    </div>
  );
}
