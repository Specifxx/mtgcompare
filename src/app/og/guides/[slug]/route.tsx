import { GUIDES } from "@/content/guides";
import { COUNTRY_GUIDE } from "@/content/guides/country-prices";
import { ogCard, wrapWords } from "@/lib/og-card";

// /og/guides/<slug>: a guide's share card (its og:image in every region, and the by-country guide's): the title, large. Static, one
// PNG per guide at build, from the registries alone (no data).
export const dynamic = "force-static";
export const dynamicParams = false;

const CARDS = new Map<string, { title: string; kicker: string }>([...GUIDES.map((g) => [g.slug, g] as const), [COUNTRY_GUIDE.slug, COUNTRY_GUIDE]]);

export function generateStaticParams() {
  return [...CARDS.keys()].map((slug) => ({ slug }));
}

export function GET(_req: Request, { params }: { params: { slug: string } }) {
  const g = CARDS.get(params.slug);
  if (!g) return new Response("Not found", { status: 404 });
  const lines = wrapWords(g.title, 20);
  const size = lines.length <= 3 ? 60 : lines.length === 4 ? 52 : 44;
  return ogCard({
    tag: "Guide",
    lines: lines.map((l, i) => [l, i === lines.length - 1]),
    size,
    sub: "With today’s prices from real stores",
    chips: [g.kicker],
  });
}
