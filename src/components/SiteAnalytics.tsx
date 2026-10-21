"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/react";

// Vercel Web Analytics, with the query string dropped from every page view:
// /au/sealed?q=… would otherwise send whatever a visitor typed into search.
// The path is enough to count the page. beforeSend has to be a client-side
// function, which is why this is its own component rather than the layout's.
function stripQuery(event: BeforeSendEvent): BeforeSendEvent | null {
  try {
    const u = new URL(event.url);
    if (u.search) return { ...event, url: `${u.origin}${u.pathname}` };
  } catch {
    /* not a URL we can parse: send as-is */
  }
  return event;
}

export function SiteAnalytics() {
  return <Analytics beforeSend={stripQuery} />;
}
