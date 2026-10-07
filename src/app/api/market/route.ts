import { NextResponse } from "next/server";
import { COUNTRY_COOKIE, isCountry } from "@/lib/country";
import { sanitizeNextPath } from "@/lib/next-param";

// GET /api/market?m=UK&to=/card/<slug>?utm_… — open a same-origin page IN A
// GIVEN MARKET (RiftCompare's /api/market, wave 2, 2026-10-03). Sets the
// `country` cookie (the one the switcher writes and getCountry() reads) and
// 307s to `to`. Alert emails link a UK watcher's card through here, so the page
// shows the UK stores and prices the alert quoted even on a device with no
// cookie yet.
//
// No database, no session. `to` must be a same-origin, non-API path
// (sanitizeNextPath); anything else goes home, and the resolved target is
// re-checked against this request's own origin before the redirect (an open
// redirect on the domain the alert emails teach people to trust would be a
// phishing primitive). An unknown market is ignored.
export const dynamic = "force-dynamic";

const ONE_YEAR = 60 * 60 * 24 * 365;

export function GET(req: Request) {
  const url = new URL(req.url);
  const to = sanitizeNextPath(url.searchParams.get("to")) ?? "/";
  const m = (url.searchParams.get("m") ?? "").toUpperCase();
  let dest = new URL(to, url.origin);
  if (dest.origin !== url.origin || dest.pathname.startsWith("/api")) dest = new URL("/", url.origin);
  const res = NextResponse.redirect(dest, 307);
  res.headers.set("Cache-Control", "no-store");
  // Not httpOnly: CountryProvider reads it client-side, like the switcher's own.
  if (isCountry(m)) res.cookies.set(COUNTRY_COOKIE, m, { path: "/", maxAge: ONE_YEAR, sameSite: "lax" });
  return res;
}
