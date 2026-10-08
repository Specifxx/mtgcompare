import { deckOg } from "@/lib/og/images";

// A published deck's share image: the deck's title and cost beside its commander
// and two dearest cards.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "MTG Compare deck: the deck title, what it costs to build and its key cards";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image({ params }: { params: { slug: string } }) {
  return deckOg(params.slug);
}
