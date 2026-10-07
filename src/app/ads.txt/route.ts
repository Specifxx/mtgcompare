import { ADSENSE_CLIENT_ID, adsTxtBody } from "@/lib/adsense";

// /ads.txt, served ONLY when an AdSense publisher id is configured: without an
// account there is no seller line to publish, and a made-up one would be worse
// than a 404.
export const dynamic = "force-static";

export function GET() {
  const body = adsTxtBody(ADSENSE_CLIENT_ID);
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
