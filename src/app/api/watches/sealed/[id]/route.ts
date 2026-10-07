import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { sameOrigin } from "@/lib/admin-guard";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { deleteSealedWatch, sealedDb, updateSealedWatch } from "@/lib/sealed-watch";

// One sealed watch: PATCH (target, snooze) and DELETE (stop). Owner only;
// editing the target needs a paid tier (lib/sealed-watch.ts).
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const rl = rateLimit(`sealed-watch:${user.id}`, 60, 3_600_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);
  const body = await req.json().catch(() => null);
  const res = await updateSealedWatch(sealedDb, user, params.id, body);
  return NextResponse.json(res.body, { status: res.status, headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const res = await deleteSealedWatch(sealedDb, user, params.id);
  return NextResponse.json(res.body, { status: res.status, headers: { "Cache-Control": "no-store" } });
}
