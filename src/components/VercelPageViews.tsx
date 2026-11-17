"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/react";

// Vercel Web Analytics, PAGE VIEWS ONLY (owner, 2026-10-25: "it says zero visitors" — it had been switched off for cost on
// 2026-10-22). Custom events stay off (src/lib/track.ts is a no-op): each one is another billed event. The query string is dropped
// from every page view so what a visitor typed into search is never sent.
function stripQuery(event: BeforeSendEvent): BeforeSendEvent | null {
  try {
    const u = new URL(event.url);
    if (u.search) {
      // Keep one thing: an AI assistant's utm_source (ChatGPT adds utm_source=chatgpt.com), so Vercel → Analytics → UTM
      // shows visits from answers (2026-11-17). Nothing a visitor typed is ever sent.
      const src = u.searchParams.get("utm_source")?.toLowerCase();
      const ai = src && /^(chatgpt\.com|chatgpt|perplexity|perplexity\.ai|claude|gemini|copilot)$/.test(src) ? `?utm_source=${src}` : "";
      return { ...event, url: `${u.origin}${u.pathname}${ai}` };
    }
  } catch {
    /* not a URL we can parse: send as-is */
  }
  return event;
}

export function VercelPageViews() {
  return <Analytics beforeSend={stripQuery} />;
}
