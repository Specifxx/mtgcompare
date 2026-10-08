import { sealedOg } from "@/lib/og/images";

// A sealed product's share image: the product on a white plate with its price.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "Magic: The Gathering sealed product price on MTG Compare: product image, cheapest in-stock price and TCGplayer market price";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image({ params }: { params: { slug: string } }) {
  return sealedOg(params.slug);
}
