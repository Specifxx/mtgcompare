// The one way a route turns a composition into a PNG: brand fonts, 1200×630.
//
// Cache headers. ImageResponse sends "public, immutable, no-transform,
// max-age=31536000" unless told otherwise, and the ?hash Next appends to
// og:image tracks the route's code, not the prices; so a browser or proxy
// honouring that header would keep a card's price for a year, and with no
// s-maxage the CDN may not keep it at all (each unfurl redraws for 0.5–2 s).
// The per-slug images therefore send OG_CACHED: no browser cache, 6 h at the
// CDN (OG_REVALIDATE; the routes are force-dynamic and export no `revalidate`,
// so this header is the whole freshness bound), a day of
// stale-while-revalidate. A fallback drawn after a read error or for an
// unknown slug sends OG_AFTER_ERROR (one minute), so a brief outage, or a card
// shared minutes before its import, never pins the placeholder. The key must be
// lowercase to replace ImageResponse's default. Same choice as RiftCompare's
// Pokémon share images (TCGEmpire DECISIONS D8).
import type { ReactElement } from "react";
import { ImageResponse } from "next/og";
import { loadOgFonts } from "./fonts";
import { OG_REVALIDATE, OG_SIZE } from "./theme";

export const OG_CACHED = `public, max-age=0, s-maxage=${OG_REVALIDATE}, stale-while-revalidate=86400`;
export const OG_AFTER_ERROR = "public, max-age=0, s-maxage=60";

export async function ogResponse(el: ReactElement, cacheControl?: string): Promise<ImageResponse> {
  return new ImageResponse(el, {
    ...OG_SIZE,
    fonts: await loadOgFonts(),
    ...(cacheControl ? { headers: { "cache-control": cacheControl } } : {}),
  });
}
