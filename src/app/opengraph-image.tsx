import { guideOg } from "@/lib/og/images";

// The site's default share image (every page without its own): the price guide
// itself, with five real top cards. The rules (fixed US market, fallback never
// a 500, cache headers) are written down in src/lib/og/images.tsx and respond.ts.
export const runtime = "nodejs";
export const revalidate = 21600;
export const alt =
  "OP Compare's One Piece price guide: the top cards with their TCGplayer market price, the cheapest in-stock store price and store counts, across six markets";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return guideOg("home");
}
