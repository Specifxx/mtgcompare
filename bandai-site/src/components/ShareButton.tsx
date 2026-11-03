"use client";
// Share (owner, 2026-11-02, word of mouth): the phone's own share sheet
// (navigator.share) where there is one, else the link copied to the clipboard
// with a short "Link copied" note. No pop-up, no reward, no account. The link
// is the page's canonical URL plus utm_source=share (lib/share.ts), and the
// message names the real price gap in the visitor's market when there is one.
// One Vercel event per tap, share { medium } (the growth report counts it).
import { useEffect, useRef, useState } from "react";
import { track } from "@vercel/analytics";
import { money } from "@/lib/format";
import { SITE_URL } from "@/lib/site";
import { priceGap, shareText, shareUrl, type ShareMedium } from "@/lib/share";
import type { Offer } from "@/lib/site-types";
import { useMarket } from "./ClientPrefs";

export function ShareButton({ path, name, medium, offers, text, label = "Share", compact = false, className = "" }: { path: string; name: string; medium: ShareMedium; offers?: Offer[]; /** overrides the price-gap message */ text?: string; label?: string; /** icon only on phones */ compact?: boolean; className?: string }) {
  const { market } = useMarket();
  const [note, setNote] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const say = (t: string) => {
    setNote(t);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setNote(""), 2500);
  };

  async function share() {
    const url = shareUrl(SITE_URL, path, medium);
    const message = text ?? shareText(name, offers ? priceGap(offers, market) : null, (c, cur) => money(c, cur));
    try {
      track("share", { medium });
    } catch {}
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: name, text: message, url });
        return;
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${message} ${url}`);
      say("Link copied");
    } catch {
      say("Couldn’t copy the link");
    }
  }

  return (
    <span className={`relative inline-flex shrink-0 ${className}`}>
      <button type="button" onClick={share} className="btn-ghost px-3 py-1.5" aria-label={`Share ${name}`} title="Share">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
          <path d="M16 6l-4-4-4 4" />
          <path d="M12 2v13" />
        </svg>
        <span className={compact ? "hidden sm:inline" : undefined}>{label}</span>
      </button>
      <span role="status" aria-live="polite" className={`pointer-events-none absolute right-0 top-full z-10 mt-1.5 whitespace-nowrap rounded-md bg-fg px-2.5 py-1 text-xs font-semibold text-ink-950 transition-opacity ${note ? "opacity-100" : "opacity-0"}`}>
        {note}
      </span>
    </span>
  );
}
