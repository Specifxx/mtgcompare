import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { upsertOAuthUser } from "@/lib/accounts";
import { applyReferral } from "@/lib/referral";
import { parseSignupSource, SIGNUP_SOURCE_COOKIE } from "@/lib/signup-source-shared";
import { createSession } from "@/lib/auth";
import { POST_SIGN_IN_FALLBACK, sanitizeNextPath } from "@/lib/next-param";
import { isOAuthProvider, isProviderEnabled, normaliseProfile, providerConfig, redirectUri } from "@/lib/oauth";

export const dynamic = "force-dynamic";

function fail(req: Request, code: string) {
  const dest = new URL("/login", req.url);
  dest.searchParams.set("error", code);
  return NextResponse.redirect(dest);
}

export async function GET(req: Request, { params }: { params: { provider: string } }) {
  const provider = params.provider;
  if (!isOAuthProvider(provider) || !isProviderEnabled(provider)) return fail(req, "provider_unavailable");
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const saved = cookies().get(`oauth_state_${provider}`)?.value;
  cookies().set(`oauth_state_${provider}`, "", { path: "/", maxAge: 0 });
  if (!code || !state || !saved || state !== saved) return fail(req, "oauth_state");

  const cfg = providerConfig(provider);
  let accessToken: string | undefined;
  try {
    const res = await fetch(cfg.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ client_id: cfg.clientId!, client_secret: cfg.clientSecret!, grant_type: "authorization_code", code, redirect_uri: redirectUri(provider) }),
    });
    if (!res.ok) return fail(req, "oauth_token");
    accessToken = ((await res.json()) as { access_token?: string }).access_token;
  } catch {
    return fail(req, "oauth_token");
  }
  if (!accessToken) return fail(req, "oauth_token");

  let profile: Record<string, unknown>;
  try {
    const res = await fetch(cfg.userUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return fail(req, "oauth_profile");
    profile = (await res.json()) as Record<string, unknown>;
  } catch {
    return fail(req, "oauth_profile");
  }
  const p = normaliseProfile(provider, profile);
  if (!p.providerId || !p.email) return fail(req, "oauth_noemail");

  let isNew = false;
  let promo = false;
  try {
    // Wave 2: the whitelisted sign-up surface (mc_signup_src), stamped on a
    // NEW account only, and the referral cookie (attribution only: it
    // writes nothing, lib/referral.ts).
    const signupSource = parseSignupSource(cookies().get(SIGNUP_SOURCE_COOKIE)?.value);
    const user = await upsertOAuthUser(provider, p, { signupSource: signupSource ?? "login" });
    if (!user) return fail(req, "oauth_unverified");
    isNew = user.isNew;
    promo = user.promo;
    if (signupSource) cookies().set(SIGNUP_SOURCE_COOKIE, "", { path: "/", maxAge: 0 });
    if (isNew) await applyReferral(user.id);
    await createSession(user.id);
  } catch {
    return fail(req, "oauth_session");
  }
  const next = sanitizeNextPath(cookies().get(`oauth_next_${provider}`)?.value);
  cookies().set(`oauth_next_${provider}`, "", { path: "/", maxAge: 0 });
  const dest = new URL(next ?? POST_SIGN_IN_FALLBACK, req.url);
  if (isNew) dest.searchParams.set("welcome", provider);
  if (promo) dest.searchParams.set("promo", "1");
  return NextResponse.redirect(dest);
}
