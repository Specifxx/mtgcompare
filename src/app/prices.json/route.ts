import { buildPriceApi } from "@/lib/price-api";

// The free public price file (lib/price-api.ts). Built with the deploy and served as a file: no function runs for
// it, and only a release changes it. Open to every origin, so a browser tool can read it directly.
export const dynamic = "force-static";

export function GET() {
  return new Response(JSON.stringify(buildPriceApi()), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, s-maxage=86400", "Access-Control-Allow-Origin": "*" },
  });
}
