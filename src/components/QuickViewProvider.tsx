"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Dialog from "./Dialog";
import { QuickView, loadQuickView } from "./QuickView";

// The card QuickView (RiftCompare's QuickViewProvider): a plain left click on any
// card link (CardQuickLink) opens the card in a dialog instead of loading its
// page. Mounted once in the root layout; reads no session and no cookie.
//
// The dialog gets a real address: the URL bar becomes /card/<slug> through
// history.pushState (no navigation, so no page load), so the link can be copied
// and shared, Back closes the dialog, Forward reopens it, and visiting that URL
// directly renders the full server-rendered card page (deep-link safe). Next's
// router patches pushState and copies its own history state into ours, so the
// page under the dialog stays exactly as it was.

export interface QuickViewOpen {
  /** The clicked link's own image, shown while the card loads. */
  thumb?: string | null;
  /** The clicked link's text, shown as the title while the card loads. */
  label?: string | null;
}

interface Ctx {
  open: (slug: string, hint?: QuickViewOpen) => void;
  prefetch: (slug: string) => void;
}

const QuickViewContext = createContext<Ctx | null>(null);

/** The QuickView controls, or null where no provider is mounted (links then navigate normally). */
export function useQuickView(): Ctx | null {
  return useContext(QuickViewContext);
}

const STATE_KEY = "mcQuickView";
const cardPath = (slug: string) => `/card/${slug}`;

interface Shown extends QuickViewOpen {
  slug: string;
  /** Bumped on every open, so reopening the same card remounts the panel. */
  n: number;
}

export default function QuickViewProvider({ children, providers = [] }: { children: React.ReactNode; providers?: ("google" | "discord")[] }) {
  const [shown, setShown] = useState<Shown | null>(null);
  // Kept through a close so the exit transition still has content behind it.
  const last = useRef<Shown | null>(null);
  if (shown) last.current = shown;
  const display = shown ?? last.current;

  const pushed = useRef(false); // our history entry is the current one
  const backPending = useRef(false); // close() called history.back(), popstate not yet seen
  const queued = useRef<string | null>(null); // an open that arrived during that back
  const expectedPath = useRef<string | null>(null); // the pathname while the dialog is open
  const counter = useRef(0);

  const pushFor = useCallback((slug: string) => {
    const url = cardPath(slug);
    if (window.location.pathname !== url) {
      window.history.pushState({ [STATE_KEY]: slug }, "", url);
      pushed.current = true;
    } else {
      pushed.current = false;
    }
    expectedPath.current = url;
  }, []);

  const open = useCallback(
    (slug: string, hint?: QuickViewOpen) => {
      counter.current += 1;
      setShown({ slug, thumb: hint?.thumb ?? null, label: hint?.label ?? null, n: counter.current });
      void loadQuickView(slug).catch(() => {});
      if (backPending.current) {
        // Opened again before the previous close's Back landed: push once it has.
        queued.current = slug;
      } else if (pushed.current) {
        // Card to card while open: replace, so Back still returns to the page.
        window.history.replaceState({ [STATE_KEY]: slug }, "", cardPath(slug));
        expectedPath.current = cardPath(slug);
      } else {
        pushFor(slug);
      }
      (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag?.("event", "quickview_open", { card: slug });
    },
    [pushFor],
  );

  const close = useCallback(() => {
    setShown(null);
    queued.current = null;
    expectedPath.current = null;
    if (pushed.current) {
      pushed.current = false;
      backPending.current = true;
      window.history.back(); // restore the page's own URL
    }
  }, []);

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      if (backPending.current) {
        backPending.current = false;
        const q = queued.current;
        queued.current = null;
        if (q) pushFor(q);
        return;
      }
      const slug = (e.state as Record<string, unknown> | null)?.[STATE_KEY];
      if (typeof slug === "string" && window.location.pathname === cardPath(slug)) {
        // Forward onto a QuickView entry: show it again.
        counter.current += 1;
        pushed.current = true;
        expectedPath.current = cardPath(slug);
        setShown({ slug, n: counter.current });
        return;
      }
      pushed.current = false;
      expectedPath.current = null;
      setShown(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [pushFor]);

  // A real navigation while open (a link the dialog doesn't own): just let go.
  const pathname = usePathname();
  useEffect(() => {
    if (expectedPath.current && pathname && pathname !== expectedPath.current && !backPending.current) {
      pushed.current = false;
      expectedPath.current = null;
      setShown(null);
    }
  }, [pathname]);

  const prefetch = useCallback((slug: string) => {
    void loadQuickView(slug).catch(() => {});
  }, []);

  return (
    <QuickViewContext.Provider value={{ open, prefetch }}>
      {children}
      <Dialog open={!!shown} onClose={close} size="3xl" labelledBy="quickview-title">
        {display ? <QuickView key={`${display.slug}-${display.n}`} slug={display.slug} thumb={display.thumb ?? null} label={display.label ?? null} onClose={close} providers={providers} /> : null}
      </Dialog>
    </QuickViewContext.Provider>
  );
}
