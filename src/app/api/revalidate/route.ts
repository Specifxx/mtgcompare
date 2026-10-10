import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { NEON_TAGS } from "@/lib/data";
import { privateHeaders } from "@/lib/data/plane/headers";

// Purges the Neon-backed caches and the three ranking caches after a job that changed what they hold (the demand snapshot, a published deck, an eBay pass). `Authorization: Bearer $CRON_SECRET`.
// `?tag=<t>` (repeatable) purges only those tags, each one of NEON_TAGS (an unknown tag is a 400 and purges nothing): the eBay pass purges `ebay-banner` alone, so it never empties the demand and rising caches.
// PUBLISHED DATA IS NOT PURGED: every plane read is a fetch pinned to a commit sha with no tag, so a publish needs no purge to be correct (contract 7.5, 12.7.2); the publisher calls POST /api/data-warm instead.
export const dynamic = "force-dynamic";

const bearer = (req: Request, secret: string): boolean => {
  const given = Buffer.from(req.headers.get("authorization") ?? ""), want = Buffer.from(`Bearer ${secret}`);
  return given.length === want.length && timingSafeEqual(given, want);
};

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !bearer(req, secret)) return NextResponse.json({ ok: false }, { status: 401, headers: privateHeaders() });
  const asked = new URL(req.url).searchParams.getAll("tag");
  const unknown = asked.filter((t) => !(NEON_TAGS as readonly string[]).includes(t));
  if (unknown.length) return NextResponse.json({ ok: false, unknown }, { status: 400, headers: privateHeaders() });
  const tags = asked.length ? NEON_TAGS.filter((t) => asked.includes(t)) : [...NEON_TAGS];
  for (const tag of tags) revalidateTag(tag);
  return NextResponse.json({ ok: true, revalidated: tags, at: new Date().toISOString() }, { headers: privateHeaders() });
}
