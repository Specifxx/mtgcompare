import { sealedOg } from "@/lib/og/images";

// A sealed product's share image: the product on a white plate with its price.
export const runtime = "nodejs";
export const revalidate = 21600;
export const alt = "One Piece sealed product price on OP Compare: product image, cheapest in-stock price and TCGplayer market price";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image({ params }: { params: { slug: string } }) {
  return sealedOg(params.slug);
}
