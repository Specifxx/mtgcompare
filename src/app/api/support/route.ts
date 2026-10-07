import { NextResponse } from "next/server";
import { createSupportTicket } from "@/lib/inbox";
import { parseSupportTicket } from "@/lib/inbox-rules";
import { publicFormGate } from "@/lib/public-form";
import { rateLimit, refundRateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;

// Public support-ticket intake (RiftCompare's /api/support through OP's public
// form gate): same-origin, size-capped, honeypot, 3 an hour per IP, and for a
// signed-in account 5 a day. The ticket gets a number (OC-<n>, shown on screen);
// no email is sent, because no mailer exists: the owner reads /admin/support and
// replies from their own mail client.
export async function POST(req: Request) {
  const gate = await publicFormGate(req, { name: "support", perHour: 3, perIpHour: 3 });
  if ("response" in gate) return gate.response;
  let dayKey: string | null = null;
  if (gate.userId) {
    dayKey = `support:day:${gate.userId}`;
    const d = rateLimit(dayKey, 5, DAY);
    if (!d.ok) return tooManyRequests(d.retryAfter);
  }
  const parsed = parseSupportTicket(gate.body);
  if (!parsed.ok) {
    if (dayKey) refundRateLimit(dayKey);
    return gate.reject(parsed.error);
  }
  const r = await createSupportTicket(parsed.value, gate.userId);
  return NextResponse.json({ ok: true, ticket: r.ticket });
}
