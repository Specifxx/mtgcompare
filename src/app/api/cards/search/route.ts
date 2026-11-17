import { cardSearch } from "@/lib/card-search";

// GET /api/cards/search?q=: the header typeahead's card suggestions (DECISIONS.md "Card prices: every card"). Answered from the
// committed search index, never a database; each distinct query is kept by Vercel's CDN for six hours (the data changes once a day,
// with a release, which empties the CDN). The typeahead asks only from three characters, after a pause. /api/ is disallowed in
// robots.txt.
export const dynamic = "force-dynamic";

const CDN = "public, s-maxage=21600, stale-while-revalidate=86400";

export function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 80);
  const { hits, total } = cardSearch(q, 6);
  return Response.json({ q, hits, total }, { headers: { "Cache-Control": "public, max-age=3600", "CDN-Cache-Control": CDN, "Vercel-CDN-Cache-Control": CDN } });
}
