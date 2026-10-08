"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { COUNTRIES, COUNTRY_COOKIE, normalizeCountry, type Country } from "@/lib/country";
import { REGION_HOME_PATH } from "@/lib/seo";
import { trackEvent } from "@/lib/analytics";

// The visitor's market — RiftCompare's CountryProvider model (wave 2,
// 2026-10-03). The root layout reads no cookie: every page's shared chrome
// renders for DEFAULT_COUNTRY, and this provider resolves the real market on
// the client after mount — the `country` cookie first, then its localStorage
// mirror (a cleared/blocked cookie), then one /api/geo call for a first-time
// visitor. Pages that price server-side still call getCountry() themselves
// (per page, allowed); setCountry() refreshes them.
//
// Not ported: RiftCompare's GBP→EUR display toggle for the UK market and the
// signed-in User.preferredCountry sync (MTG Compare's /api/me carries no
// market yet).
const REGION_HOME_PATHS = new Set(Object.values(REGION_HOME_PATH));

interface Ctx {
  country: Country;
  setCountry: (c: Country) => void;
  /** The market's currency (ISO 4217), e.g. "USD". */
  currency: string;
  /** True while the server tree re-renders for a newly chosen market. */
  pending: boolean;
}
const CountryContext = createContext<Ctx | null>(null);

function readCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}
function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}
function readLocalStorage(name: string): string | null {
  try {
    return window.localStorage.getItem(name);
  } catch {
    return null;
  }
}
function writeLocalStorage(name: string, value: string) {
  try {
    window.localStorage.setItem(name, value);
  } catch {
    /* best-effort */
  }
}
// A real choice writes both stores together so they cannot drift.
function persist(name: string, value: string) {
  writeCookie(name, value);
  writeLocalStorage(name, value);
}

export function CountryProvider({ initial, children }: { initial: Country; children: React.ReactNode }) {
  const [country, setState] = useState<Country>(initial);
  const [pending, start] = useTransition();
  const router = useRouter();
  const pathname = usePathname();

  // A visitor whose STORED market disagrees with the region home they are on
  // goes to their own (router.replace: a correction, not a history entry).
  // Never from the anonymous geo guess: a first-time visitor may land on and
  // stay on any region home (a search result, a shared /au link).
  const goToOwnRegionHome = (c: Country) => {
    const target = REGION_HOME_PATH[c];
    if (pathname && REGION_HOME_PATHS.has(pathname) && target !== pathname) router.replace(target);
  };

  useEffect(() => {
    let stored = readCookie(COUNTRY_COOKIE);
    if (!stored) {
      const ls = readLocalStorage(COUNTRY_COOKIE);
      if (ls) {
        stored = ls;
        writeCookie(COUNTRY_COOKIE, ls);
      }
    }
    if (stored) {
      const c = normalizeCountry(stored);
      if (c !== country) setState(c);
      goToOwnRegionHome(c);
      return;
    }
    let cancelled = false;
    fetch("/api/geo")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { country?: string } | null) => {
        if (cancelled || !d?.country) return;
        // A manual pick may have landed while this was in flight: it wins.
        if (readCookie(COUNTRY_COOKIE)) return;
        const geo = normalizeCountry(d.country);
        setState((prev) => (geo !== prev ? geo : prev));
        // Backfill the cookie so the next server render already agrees. No
        // refresh: a page that prices server-side read the same geo header
        // through getCountry().
        persist(COUNTRY_COOKIE, geo);
      })
      .catch(() => {
        /* geo is best-effort — the default market stands */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setCountry = useCallback(
    (c: Country) => {
      if (c === country) return;
      // Fires for a person's pick only, never for the silent restore above.
      trackEvent("region_changed", { from: country, to: c });
      setState(c);
      persist(COUNTRY_COOKIE, c);
      // Re-render server components (prices, store lists) for the new market.
      start(() => router.refresh());
    },
    [country, router],
  );

  return (
    <CountryContext.Provider value={{ country, setCountry, currency: COUNTRIES[country].currency, pending }}>{children}</CountryContext.Provider>
  );
}

export function useCountry(): Ctx {
  const v = useContext(CountryContext);
  if (!v) throw new Error("useCountry outside CountryProvider");
  return v;
}

/** The context, or null outside the provider. */
export function useCountryMaybe(): Ctx | null {
  return useContext(CountryContext);
}

/**
 * Pins the market for everything inside it. A region home (/au, /uk, /ca, /sg, /eu) is one market's page: its hero, its Today's Top
 * Deals and its eBay chase strip must quote THAT market even for a visitor whose stored market is another or who has none yet (the
 * provider above resolves the visitor's own market and, for a stored one, sends them to their own region home). Switching market is
 * still the visitor's call: setCountry is the provider's. Outside a provider it renders its children unchanged.
 */
export function CountryLock({ country, children }: { country: Country; children: React.ReactNode }) {
  const parent = useContext(CountryContext);
  const value = useMemo<Ctx | null>(
    () => (parent ? { ...parent, country, currency: COUNTRIES[country].currency } : null),
    [parent, country],
  );
  return value ? <CountryContext.Provider value={value}>{children}</CountryContext.Provider> : <>{children}</>;
}
