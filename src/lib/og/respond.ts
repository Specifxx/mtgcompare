// The one way a route turns a composition into a PNG: brand fonts, 1200×630.
//
// Cache headers. ImageResponse sends "public, immutable, no-transform,
// max-age=31536000" unless told otherwise, and the ?hash Next appends to
// og:image tracks the route's code, not the prices; so a browser or proxy
// honouring that header would keep a card's price for a year, and with no
// s-maxage the CDN may not keep it at all (each unfurl redraws for 0.5–2 s).
// The per-slug images therefore send OG_CACHED: no browser cache, a day at the
// CDN (OG_REVALIDATE; the routes are force-dynamic and export no `revalidate`,
// so this header is the whole freshness bound), a day more of
// stale-while-revalidate (OG_STALE). An image is drawn at most about once a day
// per URL and CDN region, so the published data (and, on the Neon backend, the
// database) is read at most that often for it. A fallback drawn after a read
// error or for an unknown slug sends OG_AFTER_ERROR (one minute), so a brief
// outage, or a card shared minutes before its import, never pins the
// placeholder. The key must be lowercase to replace ImageResponse's default.
//
// What goes out. Next 14's generated route for an opengraph-image with params
// (and the param-less one alike) returns this Response untouched: it adds its own
// Cache-Control only to sitemap/robots/manifest routes. Vercel's CDN then reads
// s-maxage and stale-while-revalidate and REMOVES them from the copy it sends to
// the client, so a curl of the live site shows "public, max-age=0" (the
// sitemap's "public, s-maxage=300, stale-while-revalidate=600" arrives as
// "public"). Check the CDN with x-vercel-cache (HIT) and age, not with
// cache-control; `next start` shows the full header (DECISIONS 2026-10-14,
// "Share images stay at the CDN for a day").
import type { ReactElement } from "react";
import { ImageResponse } from "next/og";
import { loadOgFonts } from "./fonts";
import { OG_REVALIDATE, OG_SIZE, OG_STALE } from "./theme";

export const OG_CACHED = `public, max-age=0, s-maxage=${OG_REVALIDATE}, stale-while-revalidate=${OG_STALE}`;
export const OG_AFTER_ERROR = "public, max-age=0, s-maxage=60";

export async function ogResponse(el: ReactElement, cacheControl?: string): Promise<ImageResponse> {
  return new ImageResponse(el, {
    ...OG_SIZE,
    fonts: await loadOgFonts(),
    ...(cacheControl ? { headers: { "cache-control": cacheControl } } : {}),
  });
}
