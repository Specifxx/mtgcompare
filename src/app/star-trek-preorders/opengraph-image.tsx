import { starTrekPreorderOg } from "@/lib/og/images";

// The /star-trek-preorders share image: static (date, set name, markets, three real Star Trek cards), no price and no live count.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "Magic: The Gathering Star Trek pre-order prices: Play Boosters, Collector Boosters and Commander decks compared across every store on MTG Compare";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return starTrekPreorderOg();
}
