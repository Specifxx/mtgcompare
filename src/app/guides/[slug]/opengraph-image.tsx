import { blogOg } from "@/lib/og/images";

// A guide's share image: the same composition as a post's (its title beside its
// three hero cards), through the one loader-and-draw function.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "MTG Compare guide: the guide title and its featured Magic cards";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image({ params }: { params: { slug: string } }) {
  return blogOg(params.slug);
}
