import { NextResponse } from "next/server";
import { adminJsonBody, adminLog, requireAdminApi } from "@/lib/admin";
import { WORKFLOWS, dispatchWorkflow, workflowUrl } from "@/lib/admin-dispatch";

export const dynamic = "force-dynamic";

// "Re-run publish" on /admin/data: dispatches import-prices.yml (the daily import and publish). `force` re-imports although the sources have not changed. The workflow's own concurrency group
// serialises it with the scheduled runs; nothing here writes the data repository.
export async function POST(req: Request) {
  const gate = await requireAdminApi(req, { mutation: true });
  if (gate instanceof NextResponse) return gate;
  const body = await adminJsonBody(req);
  if (body instanceof NextResponse) return body;
  const inputs: Record<string, string> = {};
  if (body?.force === true) inputs.force = "true";
  const r = await dispatchWorkflow("publish", inputs);
  adminLog(gate, "publish-run", { ok: r.ok, status: r.status, inputs });
  return NextResponse.json(r.ok ? { ok: true, message: r.message, url: workflowUrl(WORKFLOWS.publish) } : { error: r.message, url: workflowUrl(WORKFLOWS.publish) }, { status: r.ok ? 200 : r.status });
}
