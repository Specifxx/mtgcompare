"use client";

import Link from "@/components/Link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { retargetHref, type NavItem } from "@/lib/nav";
import { REGIONS, X_DEFAULT_REGION, isRegion, regionFromAcceptLanguage, regionFromTimeZone, type Region } from "@/lib/regions";

/** Where the guess came from: a region the visitor browsed before, the browser's language, its time zone, /api/geo, or a click. */
export type RegionSource = "saved" | "geo" | "language" | "timezone" | "picked";

// A region the visitor picks on a page with no region of its own (the landing page's switcher, the header's, the phone menu's): one
// value for the whole page, so the nav, the sidebar and the landing grid all move together, and remembered as RegionSwitcher does.
let pickedRegion: Region | null = null;
const pickListeners = new Set<() => void>();
function subscribePick(fn: () => void) {
  pickListeners.add(fn);
  return () => {
    pickListeners.delete(fn);
  };
}

/** Choose a region in place (no navigation): every component on the page that follows the visitor's region moves to it. */
export function pickRegion(region: Region) {
  pickedRegion = region;
  try {
    localStorage.setItem("mtg-region", region);
  } catch {
    /* storage blocked */
  }
  pickListeners.forEach((fn) => fn());
}

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
  const picked = useSyncExternalStore(subscribePick, () => pickedRegion, () => null);
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
  return picked ? { known: true, region: picked, source: "picked" } : s;
}

/**
 * The region a page with no region of its own (the landing page, About, the legal pages, a 404) builds its links for: the one the
 * visitor picked or is suggested, else the default (the US, as in the server's HTML).
 */
export function useSoftRegion(): Region {
  const { region } = useSuggestedRegion();
  return region ?? X_DEFAULT_REGION;
}

/**
 * The hero's shortcuts (owner, 2026-10-28: no "Continue to <region>" step before the navigation): the landing page's most-used
 * pages, as links in the visitor's region. The server's HTML has the default region's (`links`, built for it), so they work without
 * script and crawl; in the browser they move to the suggested or picked region with the same labels, so nothing reflows.
 *
 * It also points the hero's plain GET search form (`formId`, server markup) at that region's search, by changing its action
 * attribute only: the US until then, and when no region is suggested.
 */
export function RegionSuggest({ formId, links }: { formId?: string; links: NavItem[] }) {
  const region = useSoftRegion();
  useEffect(() => {
    if (formId) document.getElementById(formId)?.setAttribute("action", `/${region}/sealed`);
  }, [formId, region]);
  return (
    <ul className="flex flex-wrap justify-center gap-2" aria-label={`Popular pages in ${REGIONS[region].inName}`}>
      {links.map((l, i) => (
        <li key={l.label}>
          <Link href={retargetHref(l.href, region)} prefetch={false} className={i === 0 ? "btn-primary min-h-11 px-4" : "chip min-h-11"}>
            {l.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** /about's "What we compare": each type is a link to its page in the suggested region (the US in the server's HTML and with no suggestion). */
export function SuggestedTypeLinks({ types, align = "center" }: { types: { slug: string; label: string }[]; align?: "center" | "start" }) {
  const to = useSoftRegion();
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
