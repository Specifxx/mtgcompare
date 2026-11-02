"use client";

import { track } from "@/lib/track";
import { useEffect, useRef, useState } from "react";
import { SITE_URL } from "@/lib/site";
import { shareUrl } from "@/lib/share-link";
import { Icon } from "./Icon";

// Share this page: the phone's own share sheet (navigator.share) where there is one, else the link copied to the clipboard with a short
// "Link copied" note. It shares the page's CANONICAL URL (SITE_URL + path: never the address bar, which may carry a query string), and
// records one Vercel event, share { kind }: ONE property (Vercel keeps two per event; nothing about the visitor or the page's data).
// A 44 px round button; the note appears beside it, absolutely placed (nothing moves), and is read out by an aria-live region.
// Exported for the set page too (the integrator's wiring commit): <ShareButton title=… path={`/${region}/sets/${slug}`} kind="set" />.

export type ShareKind = "product" | "set" | "list";

export function ShareButton({ title, path, kind, text, className = "" }: { title: string; path: string; kind: ShareKind; /** the message, e.g. the real price gap (lib/share-link.ts) */ text?: string; className?: string }) {
  const [note, setNote] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  function say(text: string) {
    setNote(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setNote(""), 2500);
  }

  async function share() {
    // utm_source=share (lib/share-link.ts, 2026-11-02): the growth report counts the visits a shared link brings.
    const url = shareUrl(SITE_URL, path, kind);
    try {
      track("share", { kind });
    } catch {
      /* analytics never gets in the way */
    }
    if (typeof navigator.share === "function") {
      try {
        await navigator.share(text ? { title, text, url } : { title, url });
        return;
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return; // the visitor closed the sheet
        // any other failure (no permission, an embedded view): fall back to copying
      }
    }
    try {
      await navigator.clipboard.writeText(text ? `${text} ${url}` : url);
      say("Link copied");
    } catch {
      say("Couldn’t copy the link");
    }
  }

  return (
    <span className={`relative inline-flex shrink-0 ${className}`}>
      <button
        type="button"
        onClick={share}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-muted transition-colors hover:border-ink/30 hover:text-ink"
        aria-label={`Share ${kind === "set" ? "this set" : kind === "list" ? "this list" : "this product"}`}
        title="Share"
      >
        <Icon name="share" size={18} />
      </button>
      <span
        role="status"
        aria-live="polite"
        className={`pointer-events-none absolute right-0 top-full z-10 mt-2 whitespace-nowrap rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-surface shadow-lift transition-opacity motion-reduce:transition-none ${note ? "opacity-100" : "opacity-0"}`}
      >
        {note}
      </span>
    </span>
  );
}
