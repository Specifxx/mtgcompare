// The shared front half of every public inbox route (/api/price-report,
// /api/stores/suggest, /api/feedback, /api/contact):
//   same-origin only (403) → JSON body, at most MAX_JSON_BYTES (413) → honeypot (a silent fake success) →
//   per-instance rate limit (429; by account when signed in, else by a salted
//   IP hash) → the route parses and writes through lib/inbox.ts.
// Signing in is optional everywhere. No IP is stored, nothing sends email.
// A submission the route then rejects (400) gives its slots back (`reject`),
// so a visitor who makes a few typos is not locked out for an hour; a write
// keeps them.
import { NextResponse } from "next/server";
import { readJsonBody, sameOrigin } from "./admin-guard";
import { getCurrentUser } from "./auth";
import { isHoneypotHit } from "./inbox-rules";
import { HOUR, ipKey, rateLimit, refundRateLimit, tooManyRequests } from "./rate-limit";

export interface FormLimits {
  name: string; // bucket namespace, e.g. "report"
  perHour: number; // per account when signed in, else per IP hash
  perIpHour?: number; // an extra per-IP cap applied to everyone
}

export type FormGate = {
  body: unknown;
  userId: string | null;
  /** A 400 for this submission, with its rate-limit slots refunded. */
  reject: (error: string) => NextResponse;
  /** A 503 for this submission (a dependency the form needs is unreachable), slots refunded: the visitor did nothing wrong. */
  unavailable: (error: string) => NextResponse;
} | { response: NextResponse };

export async function publicFormGate(req: Request, limits: FormLimits, success: Record<string, unknown> = { ok: true }): Promise<FormGate> {
  if (!sameOrigin(req)) return { response: NextResponse.json({ error: "Cross-site request refused" }, { status: 403 }) };
  const read = await readJsonBody(req);
  if (!read.ok) return { response: NextResponse.json({ error: "Request too large" }, { status: 413 }) };
  const body = read.body;
  if (isHoneypotHit(body)) return { response: NextResponse.json(success) };
  const user = await getCurrentUser();
  const ip = ipKey(req);
  const taken: string[] = [];
  if (limits.perIpHour != null) {
    const ipBucket = `${limits.name}:${ip}`;
    const r = rateLimit(ipBucket, limits.perIpHour, HOUR);
    if (!r.ok) return { response: tooManyRequests(r.retryAfter) };
    taken.push(ipBucket);
  }
  const key = user ? `${limits.name}:u:${user.id}` : `${limits.name}:${limits.perIpHour != null ? "anon:" : ""}${ip}`;
  const r = rateLimit(key, limits.perHour, HOUR);
  if (!r.ok) {
    taken.forEach(refundRateLimit); // a refused request uses no slot anywhere
    return { response: tooManyRequests(r.retryAfter) };
  }
  taken.push(key);
  const reject = (error: string) => {
    taken.forEach(refundRateLimit);
    return badRequest(error);
  };
  const unavailable = (error: string) => {
    taken.forEach(refundRateLimit);
    return NextResponse.json({ error }, { status: 503, headers: { "Retry-After": "60" } });
  };
  return { body, userId: user?.id ?? null, reject, unavailable };
}

export const badRequest = (error: string) => NextResponse.json({ error }, { status: 400 });
