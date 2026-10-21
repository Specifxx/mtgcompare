import { prisma } from "@/lib/db";
import { prismaReadDeps } from "@/lib/ebay-read";
import { handleListings } from "@/lib/ebay-route";

// GET /api/ebay/<region>?c=<context>: the listings a strip shows (components/EbayStrip.tsx).
//
// NO eBay call, NO token, NO secret. The listings are imported once a day by a GitHub Actions job
// (scripts/ebay-import.ts) into the EbayListing table; this route READS up to 8 rows of it, for the
// feed(s) a whitelisted context maps to (a cascade: item → type → sealed, set → chase, type → sealed),
// never older than EBAY_LISTING_MAX_AGE_HOURS (default 26). Missing tables answer "empty". Region and
// context are whitelists, the SQL is parameterised, and the response carries only whitelisted fields: see
// src/lib/ebay-route.ts, ebay-read.ts, ebay-context-parse.ts.
//
// Pages never call this while rendering (they stay ISR): a strip fetches from the browser once it scrolls
// near the viewport. The CDN keeps an answer 5 minutes (60 s when it is empty).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { region: string } }) {
  return handleListings(req, params.region, prismaReadDeps(prisma, process.env));
}
