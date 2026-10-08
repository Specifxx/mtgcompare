// The Open Graph fields every page carries. A page that sets its own `openGraph`
// REPLACES the root's object (Next does not deep-merge), so pages build theirs
// with pageOg(), which keeps og:site_name / og:locale / og:type and adds og:url.
// Never set `images` in a page's openGraph when an opengraph-image.tsx sits
// beside it: the key alone (even `images: undefined`) blocks the file
// (tests/og.test.ts). The root sets no `url`: inherited by every page, og:url
// would point them all at the homepage.
import type { Metadata } from "next";
import { SITE_NAME } from "../site";

export const OG_BASE = { siteName: SITE_NAME, locale: "en_US", type: "website" } as const;

type OpenGraph = NonNullable<Metadata["openGraph"]>;

/**
 * The site default share image (src/app/opengraph-image.tsx). A page that sets
 * its own openGraph loses the root's file-based image (Next replaces the whole
 * object, images included), so pageOg() names it again. `alt` must match the
 * route's own export (tests/og.test.ts).
 */
export const DEFAULT_OG_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  type: "image/png",
  alt: "MTG Compare's Magic: The Gathering price guide: the top cards with their TCGplayer market price, the cheapest in-stock store price and store counts, across six markets",
} as const;

function build(path: string, extra: Partial<OpenGraph>): OpenGraph {
  if (!path.startsWith("/")) throw new Error(`pageOg: "${path}" is not a site path`);
  return { ...OG_BASE, url: path, ...extra } as OpenGraph;
}

/**
 * A page's openGraph: OG_BASE, og:url = its canonical path (resolved against
 * metadataBase) and the site's default share image. og:title / og:description
 * are left out unless `extra` sets them: Next then copies the page's own
 * (templated) title and description in.
 */
export function pageOg(path: string, extra: Partial<OpenGraph> = {}): OpenGraph {
  return build(path, { images: [DEFAULT_OG_IMAGE], ...extra });
}

/**
 * For a page with its own opengraph-image.tsx beside it: as pageOg() but with
 * no `images` key at all, because the key alone (even `images: undefined`)
 * blocks the sibling file.
 */
export function pageOgOwnImage(path: string, extra: Partial<OpenGraph> & { images?: never } = {}): OpenGraph {
  if ("images" in extra) throw new Error("pageOgOwnImage: the sibling opengraph-image.tsx is the image");
  return build(path, extra);
}
