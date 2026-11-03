import { SITE } from "@/site.config";
import { SITE_URL } from "@/lib/site";
import { dailyCards } from "@/lib/daily-data";
import { buildPuzzle, dayKey } from "@/lib/daily";
import { dailyHtml, secondsToUtcMidnight } from "@/lib/embed";
import { imageAt } from "@/lib/image";
import { shortName } from "@/lib/names";

// The daily game's widget (DECISIONS.md 2026-11-03): today's first pair, prices
// hidden, one link to /daily. A route handler reading the date, so its only
// cache is the CDN header, held until midnight UTC when the puzzle changes.
export const dynamic = "force-dynamic";

export function GET() {
  const now = new Date();
  const p = buildPuzzle(dailyCards(), dayKey(now));
  const headers = { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex" };
  const href = `${SITE_URL}/daily?utm_source=embed&utm_medium=daily`;
  if (!p) return new Response(dailyHtml({ site: SITE.name, game: SITE.gameShort, n: 0, a: { name: "", image: null }, b: { name: "", image: null }, href }), { headers: { ...headers, "Cache-Control": "public, s-maxage=300" } });
  const [a, b] = p.rounds[0];
  const side = (c: typeof a) => ({ name: shortName(c.name), image: imageAt(c.image, "200w") });
  return new Response(dailyHtml({ site: SITE.name, game: SITE.gameShort, n: p.n, a: side(a), b: side(b), href }), {
    headers: { ...headers, "Cache-Control": `public, s-maxage=${secondsToUtcMidnight(now)}, stale-while-revalidate=3600` },
  });
}
