"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { SITE_REVIEWS } from "@/lib/site-reviews-config";
import {
  OPEN_EVENT,
  SESSION_KEY,
  SESSION_PAGES_KEY,
  countPage,
  loadState,
  saveState,
  shouldAsk,
} from "@/lib/site-reviews";
import { RatingForm } from "./RatingForm";

// The rate-us corner card, mounted once in the root layout. When it asks on
// its own is lib/site-reviews.ts (never on arrival, after real use or a store
// tab, at most three times, 14 days apart); "Rate us" opens it at any time.
// A small card, not a modal: the page stays usable under it, and ✕, Escape
// and "Not now" all close it.

const SHOW_DELAY_MS = 8_000;
/** Owner, 2026-11-03: "we don't run ads right now so the least you could do is leave us a review". Shown only while no ad script is on the page, so it is never untrue. */
export const NO_ADS_LINE = "We don't run banner ads, so if this helped, please leave us a review.";

function pageHasAds(): boolean {
  return !!document.querySelector('script[src*="googlesyndication"], script[src*="mediavine"], ins.adsbygoogle');
}
const RETURN_DELAY_MS = 1_500;

function sessionPages(path: string): number {
  try {
    const seen: string[] = JSON.parse(sessionStorage.getItem(SESSION_PAGES_KEY) ?? "[]");
    if (!seen.includes(path)) {
      seen.push(path);
      sessionStorage.setItem(SESSION_PAGES_KEY, JSON.stringify(seen.slice(-50)));
    }
    return seen.length;
  } catch {
    return 0;
  }
}

function askedThisVisit(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return true; // no storage: never ask on our own
  }
}

/** Another dialog is open, or they are typing: not the moment. */
function busy(): boolean {
  if (document.querySelector('[aria-modal="true"]')) return true;
  const a = document.activeElement;
  return !!a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT");
}

export function RateCard() {
  const path = usePathname() ?? "/";
  const [open, setOpen] = useState<null | "auto" | "user">(null);
  const [done, setDone] = useState(false);
  const [noAds, setNoAds] = useState(false);
  const openRef = useRef(open);
  openRef.current = open;

  // Count every page view.
  useEffect(() => {
    saveState(countPage(loadState(), Date.now()));
  }, [path]);

  // Ask on its own after real use.
  useEffect(() => {
    if (openRef.current) return;
    const pages = sessionPages(path);
    const ask = () => !askedThisVisit() && shouldAsk(loadState(), Date.now(), window.location.pathname, { pages });
    if (!ask()) return;
    const t = setTimeout(() => {
      if (!openRef.current && !busy() && ask()) show();
    }, SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, [path]);

  // The moment it has earned: back from a store tab opened here.
  useEffect(() => {
    let armed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      try {
        const u = new URL(a.href, window.location.href);
        if (u.host && u.host !== window.location.host && /^https?:$/.test(u.protocol)) armed = true;
      } catch {
        /* not a link we can read */
      }
    };
    const onVisible = () => {
      if (!armed || document.visibilityState !== "visible") return;
      armed = false;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const pages = sessionPages(window.location.pathname);
        if (!openRef.current && !askedThisVisit() && !busy() && shouldAsk(loadState(), Date.now(), window.location.pathname, { pages, intent: true })) show();
      }, RETURN_DELAY_MS);
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // "Rate us" anywhere on the page.
  useEffect(() => {
    const onOpen = () => {
      setDone(false);
      setOpen("user");
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (open) setNoAds(!pageHasAds());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function show() {
    const s = loadState();
    saveState({ ...s, asks: s.asks + 1 });
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* private mode */
    }
    setDone(false);
    setOpen("auto");
  }

  function close() {
    if (!done && openRef.current === "auto") saveState({ ...loadState(), snoozedAt: Date.now() });
    setOpen(null);
  }

  function never() {
    saveState({ ...loadState(), optedOut: true });
    setOpen(null);
  }

  if (!open) return null;

  return (
    <div role="dialog" aria-modal="false" aria-label={`Rate ${SITE_REVIEWS.name}`} className="srv-card" data-rate-card>
      <button type="button" onClick={close} aria-label="Close" className="srv-x">
        ✕
      </button>
      {!done && (
        <>
          <p className="srv-title">How would you rate {SITE_REVIEWS.name}?</p>
          <p className="srv-muted">{noAds ? NO_ADS_LINE : "One tap. It helps other people find us."}</p>
        </>
      )}
      <RatingForm
        compact
        onDone={() => {
          setDone(true);
          setTimeout(() => setOpen(null), 2500);
        }}
      />
      {!done && (
        <div className="srv-later">
          <button type="button" onClick={close}>
            Not now
          </button>
          {open === "auto" && (
            <button type="button" onClick={never}>
              Don&apos;t ask again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
