import { cardOg } from "@/lib/og/images";

// A card's share image: art, printing, rarity and the cheapest price in each
// market, from the published data (no Offer query).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "Magic: The Gathering card price on MTG Compare: card art, TCGplayer market price and the cheapest store in each market";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image({ params }: { params: { slug: string } }) {
  return cardOg(params.slug);
}
