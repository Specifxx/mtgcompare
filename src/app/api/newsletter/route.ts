import { NextResponse } from "next/server";
import { getEmailStatus } from "@/lib/data";
import { ipKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { parseNewsletterBody, subscribeNewsletter } from "@/lib/newsletter-signup";

export const dynamic = "force-dynamic";

// Newsletter signup — RiftCompare's /api/newsletter, ported in wave 2
// (2026-10-03). A 404 while email is off (the form never renders then).
// Re-subscribing is idempotent and never errors. NOTHING IS SENT HERE: a new
// row has welcomeSentAt null and the hourly outbox (scripts/email-hourly.ts)
// sends the welcome, so no mail key ever reaches a request. Rate-limited to
// stop welcome-email bombing and junk-row insertion.
export async function POST(req: Request) {
  if ((await getEmailStatus()) !== "on") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const rl = rateLimit(`newsletter:${ipKey(req)}`, 20, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const body = parseNewsletterBody(await req.json().catch(() => null));
  if (!body) return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
  try {
    await subscribeNewsletter({ ...body, source: body.source ?? "footer" });
  } catch (e) {
    console.error("newsletter subscribe failed:", e);
    return NextResponse.json({ error: "Try again shortly" }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
