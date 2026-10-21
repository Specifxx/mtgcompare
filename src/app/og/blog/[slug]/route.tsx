import { POSTS } from "@/lib/blog";
import { ogCard, wrapWords } from "@/lib/og-card";

// /og/blog/<slug>: a post's share card: its title, large. Static, one PNG per post at build, from the registry alone (no data).
export const dynamic = "force-static";
export const dynamicParams = false;

const CARDS = new Map(POSTS.map((p) => [p.slug, p] as const));

export function generateStaticParams() {
  return [...CARDS.keys()].map((slug) => ({ slug }));
}

export function GET(_req: Request, { params }: { params: { slug: string } }) {
  const p = CARDS.get(params.slug as never);
  if (!p) return new Response("Not found", { status: 404 });
  const lines = wrapWords(p.title, 20);
  const size = lines.length <= 3 ? 60 : lines.length === 4 ? 52 : 44;
  return ogCard({ tag: "Blog", lines: lines.map((l, i) => [l, i === lines.length - 1]), size, sub: "With today’s prices from real stores", chips: [p.kicker] });
}
