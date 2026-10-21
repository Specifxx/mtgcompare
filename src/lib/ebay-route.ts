// GET /api/ebay/<region>?c=<context>, minus Next: validate, read, answer. The route file
// (src/app/api/ebay/[region]/route.ts) only wires this to the real database; tests/ call it with a fake reader.
//
// No eBay call, no token, no secret: a READ of the rows the daily import stored (ebay-read.ts). Region and
// context are whitelisted (ebay-context-parse.ts), the response holds only whitelisted fields, and nothing
// older than the age bound (EBAY_LISTING_MAX_AGE_HOURS, default 26) is ever returned. EBAY_LISTINGS=off is the kill switch.
//
// Caching (the growth release; it was 5 minutes and 60 s): the rows change once a day, so a good answer is kept by the CDN for an
// HOUR and may then be served stale for up to 23 hours more while the CDN fetches a fresh copy in the background
// (stale-while-revalidate); browsers keep it a minute. Every product page asks for its own item:<slug> context, so a long tail of
// contexts used to miss a 5-minute cache and reach Neon on almost every view. An empty or failed answer is kept 10 minutes at the
// edge (a blip is never cached for long). The cost: a fresh import, or the kill switch, can take up to an hour to reach a given edge
// (DEPLOY.md, "Edge cache and the kill switch"). Safety does not depend on the cache: the browser re-checks every answer, a stale
// copy included, against the age bound it carries (ebay-context.ts acceptResponse), so no listing past the bound is ever shown.
import { NextResponse } from "next/server";
import { hoursToMs, parseMaxAgeHours, parseRegion, type ListingsResponse } from "./ebay-context";
import { parseContext } from "./ebay-context-parse";
import { listingsFor, type ReadDeps } from "./ebay-read";

/** A good answer: browsers 1 minute, the CDN 1 hour, then served stale for up to 23 hours while it revalidates. */
export const GOOD = "public, max-age=60, s-maxage=3600, stale-while-revalidate=82800";
/** An empty, failed or rejected answer: browsers 30 s, the CDN 10 minutes, never stale. */
export const SHORT = "public, max-age=30, s-maxage=600";

function reply(body: ListingsResponse, status: number, cache: string) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": cache, "X-Content-Type-Options": "nosniff" } });
}

export async function handleListings(req: Request, regionParam: string, deps: ReadDeps): Promise<Response> {
  const region = parseRegion(regionParam);
  const ctx = parseContext(new URL(req.url).searchParams.get("c") ?? "chase");
  if (!region || !ctx) {
    return reply({ feed: null, items: [], fetchedAt: null, maxAgeMs: hoursToMs(parseMaxAgeHours(deps.env.EBAY_LISTING_MAX_AGE_HOURS)), reason: "bad-request" }, 400, SHORT);
  }
  const out = await listingsFor(ctx, region, deps); // never throws
  return reply(out, 200, out.items.length > 0 ? GOOD : SHORT);
}
