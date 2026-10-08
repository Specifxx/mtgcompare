import { guideOg } from "@/lib/og/images";

// /price-guide's own share image: the default composition with the guide's
// footer and alt, kept as its own file so it survives a change to the default.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt =
  "Magic: The Gathering price guide on MTG Compare: every printing in one table with TCGplayer market price, cheapest in-stock price and store counts";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return guideOg("guide");
}
