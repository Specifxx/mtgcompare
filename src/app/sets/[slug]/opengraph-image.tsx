import { setOg } from "@/lib/og/images";

// A set's share image: its own mini price guide (top five cards by value).
// Rendered per slug on demand and cached; never prewarmed (no generateStaticParams).
export const runtime = "nodejs";
export const revalidate = 21600;
export const alt = "One Piece set card list and prices on OP Compare: the set's most valuable cards and their cheapest in-stock prices";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image({ params }: { params: { slug: string } }) {
  return setOg(params.slug);
}
