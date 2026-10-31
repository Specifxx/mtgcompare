// POST /api/report: "Report a wrong price" and "Suggest a store", filed in the
// private reports repo (src/lib/reports-github.ts). POST only, so no page view or
// crawler runs it and no CDN rule is needed (DECISIONS.md, 2026-10-31).
import { handleReportPost } from "@/lib/reports-github";
import { CONTACT_EMAIL } from "@/lib/site";

export const runtime = "nodejs";

export function POST(req: Request) {
  return handleReportPost(req, "mtgcompare", { email: CONTACT_EMAIL });
}
