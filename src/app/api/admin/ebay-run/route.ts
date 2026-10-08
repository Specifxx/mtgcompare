import { NextResponse } from "next/server";
import { adminJsonBody, adminLog, requireAdminApi } from "@/lib/admin";
import { loadEbayBudget } from "@/lib/admin-db-footprint";
import { WORKFLOWS, dispatchWorkflow, inImportWindow, workflowUrl } from "@/lib/admin-dispatch";

export const dynamic = "force-dynamic";

const MARKETS = ["US", "UK", "AU", "EU", "CA", "SG"];

// "Run now" on /admin/ebay: a workflow_dispatch of ebay-prices.yml. The script computes min(budget left today, remaining quota - reserve) and fails closed, so the button can
// never overspend; it can only LOWER the run's budget (max_calls). Refused inside the daily import window (it shares the import's concurrency group) and while the ledger is latched.
export async function POST(req: Request) {
  const gate = await requireAdminApi(req, { mutation: true });
  if (gate instanceof NextResponse) return gate;
  const body = await adminJsonBody(req);
  if (body instanceof NextResponse) return body;
  const inputs: Record<string, string> = {};
  const max = body?.max_calls;
  if (max !== undefined && max !== null && max !== "") {
    const n = Number(max);
    if (!Number.isInteger(n) || n < 1 || n > 5000) return NextResponse.json({ error: "max_calls must be a whole number from 1 to 5000" }, { status: 400 });
    inputs.max_calls = String(n);
  }
  const market = typeof body?.only_market === "string" ? body.only_market.toUpperCase() : "";
  if (market) {
    if (!MARKETS.includes(market)) return NextResponse.json({ error: `only_market must be one of ${MARKETS.join(" ")}` }, { status: 400 });
    inputs.only_market = market;
  }
  if (body?.force === true) inputs.force = "true";
  if (inImportWindow(new Date())) return NextResponse.json({ error: "Inside the daily import window (21:05 to 23:30 UTC): a manual eBay run could cancel a pending import. Try again after 23:30.", url: workflowUrl(WORKFLOWS.ebay) }, { status: 409 });
  try {
    const b = await loadEbayBudget();
    if (b.latched) return NextResponse.json({ error: "The ledger is latched (a 429 blocked the window): nothing may be spent until it clears.", url: workflowUrl(WORKFLOWS.ebay) }, { status: 409 });
  } catch {
    /* Neon unreachable: the script itself fails closed when it cannot read its ledger */
  }
  const r = await dispatchWorkflow("ebay", inputs);
  adminLog(gate, "ebay-run", { ok: r.ok, status: r.status, inputs });
  return NextResponse.json(r.ok ? { ok: true, message: r.message, url: workflowUrl(WORKFLOWS.ebay) } : { error: r.message, url: workflowUrl(WORKFLOWS.ebay) }, { status: r.ok ? 200 : r.status });
}
