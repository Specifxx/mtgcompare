import { blogOg } from "@/lib/og/images";

// A post's share image: its title beside its three hero cards.
export const runtime = "nodejs";
export const revalidate = 21600;
export const alt = "OP Compare blog post: the post title and its featured One Piece cards";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image({ params }: { params: { slug: string } }) {
  return blogOg(params.slug);
}
