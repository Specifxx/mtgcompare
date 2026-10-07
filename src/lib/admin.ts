// THE admin gate. Every /admin page and every /api/admin route goes through
// one of the two helpers here, and nothing else decides who is an admin
// (SessionUser.isAdmin = User.isAdmin || isAdminEmail, lib/auth.ts).
//
//   Pages: `await requireAdminPage()` first. Non-admins (signed in or not) get
//          the site's ordinary, server-rendered 404, and every admin page and
//          the layout take their metadata from adminMetadata(), which is EMPTY
//          for non-admins, so neither the title nor the payload names the area.
//   APIs:  const gate = await requireAdminApi(req, { mutation: true });
//          if (gate instanceof NextResponse) return gate;
//          401 {error:"Sign in"} with no session and no valid token,
//          403 {error:"Admins only"} for a signed-in non-admin, and for a
//          session mutation 403 {error:"Cross-site request refused"} or
//          415 {error:"JSON only"}.
//
// ADMIN_TOKEN is optional and for scripts only: accepted from the
// `Authorization: Bearer <token>` header and nowhere else (never a query string
// or a body, which land in history, logs and Referer headers). Unset or shorter
// than 32 characters, the token path is closed.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { getCurrentUser, type SessionUser } from "./auth";
import { bearerTokenOk, readJsonBody, sameOrigin } from "./admin-guard";

export type AdminActor = { kind: "session"; user: SessionUser; label: string } | { kind: "token"; label: "ADMIN_TOKEN" };

export { bearerTokenOk, sameOrigin, MIN_ADMIN_TOKEN_LENGTH, MAX_JSON_BYTES, readJsonBody } from "./admin-guard";

/** Every /admin page (and the admin layout) calls this first. */
export async function requireAdminPage(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user?.isAdmin) notFound();
  return user;
}

/** Is the viewer an admin? The layout, metadata and page share one cached getCurrentUser() read. */
export async function isAdminViewer(): Promise<boolean> {
  return Boolean((await getCurrentUser())?.isAdmin);
}

/**
 * Metadata for an admin page or the admin layout: the given metadata (always
 * noindex) for an admin, and nothing at all for anyone else, so a non-admin's
 * 404 carries the site's default title like any other missing page.
 */
export async function adminMetadata(meta: Metadata): Promise<Metadata> {
  if (!(await isAdminViewer())) return {};
  return { ...meta, robots: { index: false, follow: false } };
}

const json = (status: number, error: string) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

export async function requireAdminApi(req: Request, opts: { mutation: boolean }): Promise<AdminActor | NextResponse> {
  // 1. Script access: a header bearer token. A browser cannot attach this
  //    header cross-site, so it skips the same-origin check.
  if (bearerTokenOk(req.headers.get("authorization"))) return { kind: "token", label: "ADMIN_TOKEN" };
  // 2. The session.
  const user = await getCurrentUser();
  if (!user) return json(401, "Sign in");
  if (!user.isAdmin) return json(403, "Admins only");
  // 3. Session mutations: same origin, JSON body.
  if (opts.mutation) {
    if (!sameOrigin(req)) return json(403, "Cross-site request refused");
    if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return json(415, "JSON only");
  }
  return { kind: "session", user, label: user.email };
}

/** An admin mutation's JSON body (size-capped; 413 over MAX_JSON_BYTES). Call it AFTER requireAdminApi. */
export async function adminJsonBody(req: Request): Promise<Record<string, unknown> | null | NextResponse> {
  const r = await readJsonBody(req);
  if (!r.ok) return json(413, "Request too large");
  return r.body && typeof r.body === "object" && !Array.isArray(r.body) ? (r.body as Record<string, unknown>) : null;
}

/** The audit trail for every admin mutation (Vercel function logs). Never pass tokens or secrets. */
export function adminLog(actor: AdminActor, action: string, detail: Record<string, unknown>): void {
  console.log("[admin]", actor.label, action, JSON.stringify(detail));
}
