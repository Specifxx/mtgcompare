import { searchAll } from "@/lib/search";

export const dynamic = "force-dynamic";
// The header's suggestions. Cached by the CDN for six hours per query; the browser asks only after a pause in typing.
export function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const q = (u.get("q") ?? "").slice(0, 80);
  const game = (u.get("game") ?? "").replace(/[^a-z0-9-]/g, "") || null;
  const { hits, total } = searchAll(q, game, 8);
  return Response.json({ hits, total }, { headers: { "Vercel-CDN-Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400", "Cache-Control": "public, max-age=300", "X-Robots-Tag": "noindex" } });
}
