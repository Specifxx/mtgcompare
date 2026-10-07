"use client";

import { useState } from "react";

// X / Reddit / Facebook / copy — plain share intents, no tracking scripts.
export function ShareRow({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  const btn = "inline-flex min-h-10 items-center rounded-md border border-ink-700 bg-ink-900 px-3 text-sm font-semibold text-slate-200 hover:border-ink-600";
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
      <span>Share:</span>
      <a className={btn} href={`https://x.com/intent/post?url=${u}&text=${t}`} target="_blank" rel="noopener noreferrer">X</a>
      <a className={btn} href={`https://www.reddit.com/submit?url=${u}&title=${t}`} target="_blank" rel="noopener noreferrer">Reddit</a>
      <a className={btn} href={`https://www.facebook.com/sharer/sharer.php?u=${u}`} target="_blank" rel="noopener noreferrer">Facebook</a>
      <button
        type="button"
        className={btn}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          } catch {
            /* ignore */
          }
        }}
      >
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
