// POST /api/report: "Report a wrong price" and "Suggest a store", filed in the
// private reports repo (src/lib/reports-github.ts). POST only, so no crawler or
// page view ever runs it.
import { handleReportPost } from "@/lib/reports-github";
import { SITE } from "@/site.config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return handleReportPost(req, `${SITE.key}compare`, { email: SITE.supportEmail });
}
