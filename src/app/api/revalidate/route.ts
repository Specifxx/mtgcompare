import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { NEON_TAGS } from "@/lib/data";
import { privateHeaders } from "@/lib/data/plane/headers";

// Purges the Neon-backed caches and the three ranking caches after a job that changed what they hold (the demand snapshot, a published deck, an eBay pass). `Authorization: Bearer $CRON_SECRET`.
// PUBLISHED DATA IS NOT PURGED: every plane read is a fetch pinned to a commit sha with no tag, so a publish needs no purge to be correct (contract 7.5, 12.7.2); the publisher calls POST /api/data-warm instead.
export const dynamic = "force-dynamic";

const bearer = (req: Request, secret: string): boolean => {
  const given = Buffer.from(req.headers.get("authorization") ?? ""), want = Buffer.from(`Bearer ${secret}`);
  return given.length === want.length && timingSafeEqual(given, want);
};

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !bearer(req, secret)) return NextResponse.json({ ok: false }, { status: 401, headers: privateHeaders() });
  for (const tag of NEON_TAGS) revalidateTag(tag);
  return NextResponse.json({ ok: true, revalidated: NEON_TAGS, at: new Date().toISOString() }, { headers: privateHeaders() });
}
