import { regionFromAcceptLanguage, regionFromCountry } from "@/lib/regions";

// GET /api/geo: the visitor's likely region, for the landing page's grid (components/HomeRegionGrid.tsx): Vercel's
// x-vercel-ip-country header, else the Accept-Language country. A suggestion, never a redirect: the landing page is the same
// static HTML for everyone (and for crawlers), and the grid it fills keeps a region switcher. Edge, no data read, never cached
// (the answer is per visitor), and nothing stored: the country is read and dropped.
export const runtime = "edge";
export const dynamic = "force-dynamic";

export function GET(req: Request): Response {
  const country = regionFromCountry(req.headers.get("x-vercel-ip-country"));
  const language = country ? null : regionFromAcceptLanguage(req.headers.get("accept-language"));
  const body = { region: country ?? language, source: country ? "geo" : language ? "language" : null };
  return Response.json(body, { headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" } });
}
