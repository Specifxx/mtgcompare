import { NextResponse } from "next/server";
import { adminJsonBody, adminLog, requireAdminApi } from "@/lib/admin";
import { WORKFLOWS, dispatchWorkflow, workflowUrl } from "@/lib/admin-dispatch";

export const dynamic = "force-dynamic";

// "Run release now" on /admin/deploys: dispatches production-deploy.yml, which lands the [deploy] release commit on main. An UNSCHEDULED release (the weekly one is Tuesday 08:00 UTC), so a reason is required
// and is written into the release commit body. Only for a release that cannot wait for Tuesday (CLAUDE.md "Deploys are gated and weekly").
export async function POST(req: Request) {
  const gate = await requireAdminApi(req, { mutation: true });
  if (gate instanceof NextResponse) return gate;
  const body = await adminJsonBody(req);
  if (body instanceof NextResponse) return body;
  const reason = typeof body?.reason === "string" ? body.reason.replace(/[\r\n]+/g, " ").trim() : "";
  if (reason.length < 5 || reason.length > 300) return NextResponse.json({ error: "Give a reason of 5 to 300 characters (it is written into the release commit)" }, { status: 400 });
  const r = await dispatchWorkflow("deploy", { reason });
  adminLog(gate, "deploy-run", { ok: r.ok, status: r.status, reason });
  return NextResponse.json(r.ok ? { ok: true, message: r.message, url: workflowUrl(WORKFLOWS.deploy) } : { error: r.message, url: workflowUrl(WORKFLOWS.deploy) }, { status: r.ok ? 200 : r.status });
}
