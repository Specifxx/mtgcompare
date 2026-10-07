// The admin gate's pure checks, kept apart from lib/admin.ts (which reads the
// session) so tests and the public form routes can use them without Next's
// request context. lib/admin.ts re-exports both.
import crypto from "node:crypto";
import { SITE_URL } from "./site";

export const MIN_ADMIN_TOKEN_LENGTH = 32;

const sha256 = (s: string) => crypto.createHash("sha256").update(s, "utf8").digest();

/**
 * Constant-time check of an `Authorization` header against ADMIN_TOKEN. The
 * scheme is case-sensitive: only "Bearer <token>" is accepted.
 */
export function bearerTokenOk(header: string | null, secret: string | undefined = process.env.ADMIN_TOKEN): boolean {
  if (!secret || secret.length < MIN_ADMIN_TOKEN_LENGTH) return false;
  if (!header || !header.startsWith("Bearer ")) return false;
  const given = header.slice("Bearer ".length);
  if (!given) return false;
  return crypto.timingSafeEqual(sha256(given), sha256(secret));
}

/**
 * Did this request come from one of our own pages? Browsers send Origin with
 * every fetch POST, so a missing Origin (and no Sec-Fetch-Site) is refused.
 *
 * In production only the canonical SITE_URL origin (plus ADMIN_EXTRA_ORIGINS,
 * a comma-separated allowlist for preview domains) counts: the Host header is
 * the client's, so `Origin == https://<Host>` would trust any host routed to
 * the deployment. Outside production the Host fallback stays, so local and
 * preview QA work over http://localhost, https://<lan ip> and the like.
 */
export function sameOrigin(req: Request, env: Record<string, string | undefined> = process.env): boolean {
  if (req.headers.get("sec-fetch-site") === "same-origin") return true;
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    if (origin === new URL(SITE_URL).origin) return true;
  } catch {
    /* a malformed SITE_URL never matches */
  }
  const extra = (env.ADMIN_EXTRA_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  if (extra.includes(origin)) return true;
  if (env.NODE_ENV === "production") return false;
  const host = req.headers.get("host");
  if (!host) return false;
  return origin === `https://${host}` || origin === `http://${host}`;
}

/** The largest JSON body any form or admin route reads (every real one is a few KB). */
export const MAX_JSON_BYTES = 32 * 1024;

/**
 * Read a JSON body without ever holding more than `max` bytes: a declared
 * Content-Length over the cap is refused before reading, and a chunked body is
 * cut off as soon as it passes it. Malformed JSON reads as `body: null`.
 */
export async function readJsonBody(req: Request, max = MAX_JSON_BYTES): Promise<{ ok: true; body: unknown } | { ok: false; status: 413 }> {
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > max) return { ok: false, status: 413 };
  if (!req.body) return { ok: true, body: null };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return { ok: false, status: 413 };
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  try {
    return { ok: true, body: JSON.parse(new TextDecoder().decode(buf)) };
  } catch {
    return { ok: true, body: null };
  }
}
