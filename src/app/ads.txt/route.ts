import { ADSENSE_CLIENT, adsTxt } from "@/lib/adsense";

// /ads.txt: Google AdSense's authorised-seller line, built from NEXT_PUBLIC_ADSENSE_CLIENT at build time. A 404 until it is set.
export const dynamic = "force-static";

export function GET() {
  const body = adsTxt(ADSENSE_CLIENT);
  if (!body) return new Response("Not found\n", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
}
