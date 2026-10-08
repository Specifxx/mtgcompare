import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getBrowseIndex, getDataRef } from "@/lib/data";
import { privateHeaders } from "@/lib/data/plane/headers";
import { PLANE_PREFIX, type IxDict } from "@/lib/data/plane/formats";
import { planeSourceAt, refreshPointer } from "@/lib/data/plane/runtime";
import { PlaneError } from "@/lib/data/plane/source";
import { hotSet } from "@/lib/data/plane/shards";

// POST /api/data-warm { ref } with `Authorization: Bearer $CRON_SECRET`, sent by the publisher right after the pointer commit (and by `data-hook` after a token rotation). It reads the HOT SET of that commit (about 60 files, 14 MB: the index, the home, market
// and mover views, the set list, the store runs) through the pinned reader, so the regional Data Cache and this instance's memory hold them before the first visitor asks; it makes this instance look at the pointer again at once (the 20-second memo would otherwise
// decide) and builds the browse index when the pointer already names `ref`. Nothing is purged: pinned URLs need none. A file that does not exist yet (ix/s before the first store stage, pv/ before the first demand snapshot) is counted as absent, not failed.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bearer = (req: Request, secret: string): boolean => {
  const given = Buffer.from(req.headers.get("authorization") ?? ""), want = Buffer.from(`Bearer ${secret}`);
  return given.length === want.length && timingSafeEqual(given, want);
};

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !bearer(req, secret)) return NextResponse.json({ ok: false }, { status: 401, headers: privateHeaders() });
  const started = Date.now();
  const body = (await req.json().catch(() => ({}))) as { ref?: unknown };
  refreshPointer();
  const ptr = await getDataRef().catch(() => null);
  const named = typeof body.ref === "string" && /^[0-9a-f]{40}$/.test(body.ref) ? body.ref : null, target = named ?? ptr?.ref ?? null;
  if (!target) return NextResponse.json({ ok: false, error: "no pointer and no ref" }, { status: 503, headers: { ...privateHeaders(), "retry-after": "30" } });
  const src = planeSourceAt(target, target === ptr?.ref ? (ptr?.prev ?? null) : null, ptr?.repo);   // the pointer's repository: after a rotation the named commit lives there (a commit the pointer does not name yet is looked up in the same one)
  const dict = await src.json<IxDict>("ix/dict.json").catch(() => null), files = hotSet(dict?.rows ?? 0);
  let bytes = 0, absent = 0, failed = 0;
  await Promise.all(files.map(async (rel) => {
    try { const text = await src.text(rel); bytes += text.length; } catch (e) { if (e instanceof PlaneError && e.reason === "missing") absent++; else failed++; }
  }));
  let index = false;
  if (target === ptr?.ref && failed === 0) { try { await getBrowseIndex(); index = true; } catch { /* the index is built on demand */ } }
  return NextResponse.json({ ok: failed === 0, ref: target, servedRef: ptr?.ref ?? null, prefix: PLANE_PREFIX, files: files.length, bytes, absent, failed, index, ms: Date.now() - started }, { headers: privateHeaders() });
}
