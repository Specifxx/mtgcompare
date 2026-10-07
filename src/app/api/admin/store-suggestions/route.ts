import { NextResponse } from "next/server";
import { adminJsonBody, adminLog, requireAdminApi } from "@/lib/admin";
import { deleteSuggestion, setSuggestionStatus } from "@/lib/admin-inbox";
import { SUGGESTION_STATUSES, isIn } from "@/lib/inbox-rules";

export const dynamic = "force-dynamic";

// {id, action: pending | added | rejected | "delete"}
export async function POST(req: Request) {
  const gate = await requireAdminApi(req, { mutation: true });
  if (gate instanceof NextResponse) return gate;
  const body = await adminJsonBody(req);
  if (body instanceof NextResponse) return body;
  const id = typeof body?.id === "string" && body.id.length <= 64 ? body.id : null;
  const action = body?.action;
  if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  if (action !== "delete" && !isIn(SUGGESTION_STATUSES, action)) return NextResponse.json({ error: "Bad action" }, { status: 400 });
  const r = action === "delete" ? await deleteSuggestion(id) : await setSuggestionStatus(id, action);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  adminLog(gate, "store-suggestion", { id, action, before: r.before ?? null, after: r.after ?? null });
  return NextResponse.json({ ok: true });
}
