"use client";

import Link from "@/components/Link";
import { useEffect, useState } from "react";
import { REGIONS, X_DEFAULT_REGION, isRegion, regionFromAcceptLanguage, regionFromTimeZone, type Region } from "@/lib/regions";

/** Where the guess came from: a region the visitor browsed before, the browser's language, its time zone, /api/geo, or a click. */
export type RegionSource = "saved" | "geo" | "language" | "timezone" | "picked";

let geoAnswer: Promise<{ region: Region | null; source: RegionSource | null }> | null = null;

/** /api/geo (Vercel's x-vercel-ip-country, else Accept-Language), asked once per page however many components want it. */
function askGeo(): Promise<{ region: Region | null; source: RegionSource | null }> {
  geoAnswer ??= fetch("/api/geo", { headers: { accept: "application/json" } })
    .then((r) => (r.ok ? (r.json() as Promise<{ region: string | null; source: RegionSource | null }>) : { region: null, source: null }))
    .then((j) => (isRegion(j.region) ? { region: j.region, source: j.source } : { region: null, source: null }))
    .catch(() => ({ region: null, source: null }));
  return geoAnswer;
}

/**
 * The visitor's likely region, worked out in the browser so the landing page stays one CDN copy for everyone. In order, and free
 * until the last step: the region they last browsed (RegionSwitcher remembers it); the browser's language when it names a country
 * we compare and the time zone doesn't contradict it ("en-AU" → au; an Australian with an en-US browser and a Sydney time zone is au);
 * else the time zone alone. Only when none of those decides is /api/geo asked (one tiny Edge function call: the owner's budget is
 * about $1 a day). A suggestion, never a redirect. Unknown until mount; null when nothing maps to a region.
 */
export function useSuggestedRegion(): { known: boolean; region: Region | null; source: RegionSource | null } {
  const [s, setS] = useState<{ known: boolean; region: Region | null; source: RegionSource | null }>({ known: false, region: null, source: null });
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("mtg-region");
    } catch {
      /* storage blocked */
    }
    if (isRegion(saved)) {
      setS({ known: true, region: saved, source: "saved" });
      return;
    }
    let tz: string | undefined;
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      /* no Intl time zone */
    }
    const byZone = regionFromTimeZone(tz);
    const byLanguage = regionFromAcceptLanguage((navigator.languages?.length ? navigator.languages : [navigator.language]).join(","));
    if (byLanguage && (!byZone || byZone === byLanguage)) {
      setS({ known: true, region: byLanguage, source: "language" });
      return;
    }
    if (byZone) {
      setS({ known: true, region: byZone, source: "timezone" });
      return;
    }
    let live = true;
    askGeo().then((g) => live && setS({ known: true, region: g.region, source: g.region ? g.source : null }));
    return () => {
      live = false;
    };
  }, []);
  return s;
}

/**
 * The hero's call to action, in a box of fixed height the page gives it (h-12). The server's HTML (and a visitor whose time zone
 * names no region) gets "Choose your region ↓", a jump to the landing page's region switcher; once the region is known it becomes "Continue to
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

/** /about's "What we compare": each type is a link to its page in the suggested region (the US in the server's HTML and with no suggestion). */
export function SuggestedTypeLinks({ types, align = "center" }: { types: { slug: string; label: string }[]; align?: "center" | "start" }) {
  const { region } = useSuggestedRegion();
  const to = region ?? X_DEFAULT_REGION;
  return (
    <ul className={`flex flex-wrap gap-2 ${align === "center" ? "justify-center" : ""}`} aria-label={`Product types in ${REGIONS[to].inName}`}>
      {types.map((t) => (
        <li key={t.slug}>
          <Link href={`/${to}/type/${t.slug}`} prefetch={false} className="chip min-h-11">
            {t.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
