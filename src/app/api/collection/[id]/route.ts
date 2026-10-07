import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { sameOrigin } from "@/lib/admin-guard";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { deleteCollectionRow, patchCollectionRow } from "@/lib/collection-server";

// One binder entry (RiftCompare's /api/collection/[id], wave 2). PATCH edits
// quantity / condition / foil / what was paid / the note — quantity 0 deletes,
// a condition clash merges the two rows and their costs (lib/collection-server.ts).
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const rl = rateLimit(`collection-edit:${user.id}`, 300, 3_600_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);
  try {
    const res = await patchCollectionRow(user.id, params.id, await req.json().catch(() => null));
    return NextResponse.json(res.body, { status: res.status, headers: noStore });
  } catch {
    return NextResponse.json({ error: "Couldn't save that right now — please try again." }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const rl = rateLimit(`collection-edit:${user.id}`, 300, 3_600_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);
  const res = await deleteCollectionRow(user.id, params.id).catch(() => ({ status: 500, body: { error: "Couldn't remove that right now." } }));
  return NextResponse.json(res.body, { status: res.status, headers: noStore });
}
