"use client";

import { useEffect, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { SITE_URL } from "@/lib/site";

// RiftCompare's ShareRow: X, Reddit, Facebook and WhatsApp intent links, the
// native share sheet where the browser has one, and "Copy link". Each click
// sends one GA `share_click` event ({ channel, source }) — MTG Compare's
// custom events go to GA4 only (lib/analytics.ts).
export interface ShareRowProps {
  url?: string;
  title?: string;
  source: string;
  className?: string;
  size?: "sm" | "md";
}

const DEFAULT_TITLE = "MTG Compare — compare Magic: The Gathering prices across every store";

export function ShareRow({ url, title, source, className, size = "md" }: ShareRowProps) {
  const shareUrl = url ?? SITE_URL;
  const shareTitle = title ?? DEFAULT_TITLE;
  const [copied, setCopied] = useState(false);
  // navigator.share is client-only: decided after mount so the server render
  // and the first client render agree.
  const [canNativeShare, setCanNativeShare] = useState(false);
  useEffect(() => {
    setCanNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  const u = encodeURIComponent(shareUrl);
  const t = encodeURIComponent(shareTitle);
  const links = [
    { key: "x", label: "Share on X", short: "X", href: `https://x.com/intent/tweet?url=${u}&text=${t}` },
    { key: "reddit", label: "Share on Reddit", short: "Reddit", href: `https://www.reddit.com/submit?url=${u}&title=${t}` },
    { key: "facebook", label: "Share on Facebook", short: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { key: "whatsapp", label: "Share on WhatsApp", short: "WhatsApp", href: `https://api.whatsapp.com/send?text=${t}%20${u}` },
  ];
  const btn = size === "sm" ? "btn-ghost min-w-11 px-2 py-1 text-[11px]" : "btn-ghost text-xs";

  async function nativeShare() {
    try {
      await navigator.share({ title: shareTitle, url: shareUrl });
      trackEvent("share_click", { channel: "native", source });
    } catch {
      /* dismissed */
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      trackEvent("share_click", { channel: "copy", source });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>
      {canNativeShare && (
        <button type="button" onClick={nativeShare} className={`${btn} border-brand-500/40 text-brand-300`}>
          ↗ Share
        </button>
      )}
      {links.map((l) => (
        <a
          key={l.key}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          aria-label={l.label}
          onClick={() => trackEvent("share_click", { channel: l.key, source })}
          className={btn}
        >
          {l.short}
        </a>
      ))}
      <button type="button" onClick={copy} aria-label="Copy link" className={btn}>
        {copied ? "✓ Copied" : "🔗 Copy link"}
      </button>
    </div>
  );
}
