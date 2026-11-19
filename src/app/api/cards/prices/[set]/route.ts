import { readSet } from "@/lib/cards";

// GET /api/cards/prices/<set>: one set's TCGplayer market prices per finish, { p: { <tcgplayer id>: [normal, foil, etched] } }, for
// My collection (src/lib/vault.ts) to value the cards a visitor owns. Read from the committed set file, never a database or eBay;
// Vercel's CDN keeps each set six hours (the data changes once a day, with a release, which empties the CDN). Cards with no price
// are left out. /api/ is disallowed in robots.txt.
export const dynamic = "force-dynamic";

const CDN = "public, s-maxage=21600, stale-while-revalidate=86400";

export function GET(_req: Request, { params }: { params: { set: string } }) {
  const p: Record<number, [number | null, number | null, number | null]> = {};
  for (const c of readSet(params.set)) if (c.p.some((x) => typeof x === "number" && x > 0)) p[c.id] = c.p;
  return Response.json({ set: params.set, p }, { headers: { "Cache-Control": "public, max-age=3600", "CDN-Cache-Control": CDN, "Vercel-CDN-Cache-Control": CDN } });
}
