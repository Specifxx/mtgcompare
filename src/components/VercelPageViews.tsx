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
      const ai = src && /^(chatgpt\.com|chatgpt|perplexity|perplexity\.ai|claude|gemini|copilot)$/.test(src) ? src : "";
      // And our own creator and social links (2026-11-18): utm_source/medium/campaign as a safe tag (letters, digits, dash,
      // underscore, 40 characters), so Vercel counts the visitors each creator or post brought. Never anything typed.
      const tag = (k: string) => (u.searchParams.get(k) ?? "").toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 40);
      const keep = new URLSearchParams();
      const medium = tag("utm_medium");
      const ours = medium === "creator" || medium === "social";
      const source = ai || (ours ? tag("utm_source") : "");
      if (source) keep.set("utm_source", source);
      if (ours) keep.set("utm_medium", medium);
      const campaign = tag("utm_campaign");
      if (ours && campaign) keep.set("utm_campaign", campaign);
      const q = keep.toString();
      return { ...event, url: `${u.origin}${u.pathname}${q ? `?${q}` : ""}` };
    }
  } catch {
    /* not a URL we can parse: send as-is */
  }
  return event;
}

export function VercelPageViews() {
  return <Analytics beforeSend={stripQuery} />;
}
