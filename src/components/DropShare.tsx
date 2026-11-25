"use client";

import { track } from "@vercel/analytics";
import { useEffect, useRef, useState } from "react";
import { SITE_URL } from "@/lib/site";
import { shareUrl } from "@/lib/share-link";
import { Icon } from "./Icon";

// "Share this deal" under the best price (lib/share-link.ts dropText, 2026-11-23): the phone's share sheet, else the line and our
// page's canonical link copied for a group chat. Separate from ShareButton (whose share-for-a-deal A/B test it leaves alone): its
// own event share { kind: "drop" } (one property) and utm_medium=drop, so its clicks and the visits it brings read apart.
export function DropShare({ path, text, title, className = "" }: { path: string; text: string; title: string; className?: string }) {
  const [note, setNote] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  function say(t: string) {
    setNote(t);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setNote(""), 2500);
  }
  async function share() {
    const url = shareUrl(SITE_URL, path, "drop");
    try {
      track("share", { kind: "drop" });
    } catch {
      /* analytics never gets in the way */
    }
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      say("Copied. Paste it in your group chat");
    } catch {
      say("Couldn’t copy the link");
    }
  }
  return (
    <span className={`relative inline-flex ${className}`}>
      <button type="button" onClick={share} aria-label="Share this deal with your group chat" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-muted underline decoration-line underline-offset-4 hover:text-ink">
        <Icon name="share" size={16} />
        Share deal
      </button>
      <span role="status" aria-live="polite" className={`pointer-events-none absolute left-0 top-full z-10 mt-1 whitespace-nowrap rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-surface shadow-lift transition-opacity motion-reduce:transition-none ${note ? "opacity-100" : "opacity-0"}`}>
        {note}
      </span>
    </span>
  );
}
