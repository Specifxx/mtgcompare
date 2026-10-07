// Sessions: an HS256 JWT {sub: userId} in an httpOnly cookie, 30 days, no
// session table — RiftCompare's model. A second, readable cookie (oc_auth=1)
// only tells the browser "someone is signed in", so signed-out visitors never
// call /api/me; it grants nothing (the JWT is what's checked).
//
// Egress: getCurrentUser is one narrow, per-user, uncached read, made only by
// account pages and API routes, never by the layout or a cached loader.
import { cache } from "react";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { authSecret } from "./auth-secret";
import { isAdminEmail } from "./admin-emails";
import { prisma } from "./db";

export const SESSION_COOKIE = "oc_session";
export const AUTH_HINT_COOKIE = "oc_auth";
const MAX_AGE = 60 * 60 * 24 * 30;

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  premiumUntil: Date | null;
  premiumTier: string;
  stripeCustomerId: string | null;
  googleId: string | null;
  discordId: string | null;
  createdAt: Date;
  // Wave 2 (member track): activity stamps (lib/activity.ts) and the market
  // the welcome checklist saved. Same row, no extra read.
  lastActiveAt: Date | null;
  activeDays: number;
  preferredCountry: string | null;
}

export async function createSession(userId: string): Promise<void> {
  const token = await new SignJWT({ sub: userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30d").sign(authSecret());
  const secure = process.env.NODE_ENV === "production";
  cookies().set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: MAX_AGE });
  cookies().set(AUTH_HINT_COOKIE, "1", { httpOnly: false, sameSite: "lax", secure, path: "/", maxAge: MAX_AGE });
}

export function destroySession(): void {
  cookies().set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  cookies().set(AUTH_HINT_COOKIE, "", { path: "/", maxAge: 0 });
}

async function userIdFromCookie(): Promise<string | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, authSecret());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

/** The signed-in user, or null. One query per request (React cache). */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const id = await userIdFromCookie();
  if (!id) return null;
  const u = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, email: true, displayName: true, avatarUrl: true, isAdmin: true, premiumUntil: true, premiumTier: true,
      stripeCustomerId: true, googleId: true, discordId: true, createdAt: true,
      lastActiveAt: true, activeDays: true, preferredCountry: true,
    },
  });
  if (!u) return null;
  return { ...u, isAdmin: u.isAdmin || isAdminEmail(u.email) };
});
