import { blogOg } from "@/lib/og/images";

// A guide's share image: the same composition as a post's (its title beside its
// three hero cards), through the one loader-and-draw function.
export const runtime = "nodejs";
export const revalidate = 21600;
export const alt = "OP Compare guide: the guide title and its featured One Piece cards";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image({ params }: { params: { slug: string } }) {
  return blogOg(params.slug);
}
