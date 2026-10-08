// Lightweight, dependency-free, in-memory rate limiter (ported from RiftCompare),
// plus ipKey(): a salted one-way hash of the client IP, so the raw address is
// never stored, logged or used as a Map key.
//
// IMPORTANT: on serverless (Vercel) each function instance has its own memory,
// so these limits are PER INSTANCE and reset on a cold start. They slow floods
// of form posts; they are NOT a global cap.
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { authSecret } from "./auth-secret";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

// Drop expired buckets occasionally so the map can't grow without bound.
function sweep(now: number): void {
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}

export interface RateLimitResult {
  ok: boolean;
  retryAfter: number; // seconds until the window resets
}

export const HOUR = 60 * 60 * 1000;

// Returns ok:false once more than `limit` calls share a key inside `windowMs`.
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  if (buckets.size > 10_000) sweep(now);

  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  b.count++;
  if (b.count > limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  }
  return { ok: true, retryAfter: 0 };
}

// Give back one call to a key: for a request that took a slot but turned out
// not to deliver what the limit meters. A no-op once the window has reset.
export function refundRateLimit(key: string): void {
  const b = buckets.get(key);
  if (b && b.resetAt > Date.now() && b.count > 0) b.count--;
}

// Best-effort client IP. Only ipKey() may call this: the raw address goes no
// further. The FIRST X-Forwarded-For entry is whatever the client sent, so it
// is never used:
//   - on Vercel (VERCEL set) the platform overwrites x-real-ip and
//     x-vercel-forwarded-for with the address it saw, so those are trusted;
//   - anywhere else, a proxy APPENDS the address it saw to X-Forwarded-For, so
//     the LAST hop is the one a client can't choose; then x-real-ip.
// The per-IP limits therefore rely on the platform or proxy rewriting these
// headers. Served directly with no proxy, every header is the client's.
export function clientIp(req: Request, env: Record<string, string | undefined> = process.env): string {
  const h = req.headers;
  const last = (v: string | null) => v?.split(",").map((s) => s.trim()).filter(Boolean).pop() ?? null;
  if (env.VERCEL) {
    const v = h.get("x-real-ip")?.trim() || last(h.get("x-vercel-forwarded-for")) || last(h.get("x-forwarded-for"));
    if (v) return v;
  }
  return last(h.get("x-forwarded-for")) ?? h.get("x-real-ip")?.trim() ?? "unknown";
}

let salt: string | null = null;
function ipSalt(): string {
  salt ??= crypto.createHash("sha256").update("mtgcompare-rate-limit:").update(authSecret()).digest("hex");
  return salt;
}

/** "ip:<16 hex>" — a salted SHA-256 of the client IP, for rate-limit keys only. */
export function ipKey(req: Request): string {
  return "ip:" + crypto.createHash("sha256").update(ipSalt() + clientIp(req)).digest("hex").slice(0, 16);
}

// Standard 429 response with a Retry-After header.
export function tooManyRequests(retryAfter: number): NextResponse {
  return NextResponse.json(
    { error: "Too many requests — please slow down and try again shortly." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}
