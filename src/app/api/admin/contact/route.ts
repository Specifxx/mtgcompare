import { NextResponse } from "next/server";
import { adminJsonBody, adminLog, requireAdminApi } from "@/lib/admin";
import { deleteContact, setContactStatus } from "@/lib/admin-inbox";
import { CONTACT_STATUSES, isIn } from "@/lib/inbox-rules";

export const dynamic = "force-dynamic";

// {id, action: NEW | DONE | "delete"}
export async function POST(req: Request) {
  const gate = await requireAdminApi(req, { mutation: true });
  if (gate instanceof NextResponse) return gate;
  const body = await adminJsonBody(req);
  if (body instanceof NextResponse) return body;
  const id = typeof body?.id === "string" && body.id.length <= 64 ? body.id : null;
  const action = body?.action;
  if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  if (action !== "delete" && !isIn(CONTACT_STATUSES, action)) return NextResponse.json({ error: "Bad action" }, { status: 400 });
  const r = action === "delete" ? await deleteContact(id) : await setContactStatus(id, action);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  adminLog(gate, "contact", { id, action, before: r.before ?? null, after: r.after ?? null });
  return NextResponse.json({ ok: true });
}
