import { NextResponse } from "next/server";
import { adminJsonBody, adminLog, requireAdminApi } from "@/lib/admin";
import { parseTicketPatch, updateTicket } from "@/lib/admin-support";

export const dynamic = "force-dynamic";

// {id, status?, adminNote?}: ticket triage. POST like every admin mutation
// (same-origin and JSON for a session); PATCH is the same handler for callers
// that want the verb.
async function handle(req: Request) {
  const gate = await requireAdminApi(req, { mutation: true });
  if (gate instanceof NextResponse) return gate;
  const body = await adminJsonBody(req);
  if (body instanceof NextResponse) return body;
  const parsed = parseTicketPatch(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const r = await updateTicket(parsed.id, parsed.patch);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  adminLog(gate, "support", { id: parsed.id, status: parsed.patch.status ?? null, note: parsed.patch.adminNote !== undefined, before: r.before, after: r.after });
  return NextResponse.json({ ok: true });
}

export const POST = handle;
export const PATCH = handle;
