import { blogOg } from "@/lib/og/images";

// A post's share image: its title beside its three hero cards.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "MTG Compare blog post: the post title and its featured Magic cards";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image({ params }: { params: { slug: string } }) {
  return blogOg(params.slug);
}
