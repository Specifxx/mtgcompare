import { NextResponse, type NextRequest } from "next/server";

// /AU/… → /au/… (308). Only the seven region prefixes, only when the first
// segment is not already lowercase: a next.config.js redirect can't do this,
// because its sources match case-insensitively (a "/AU/:path*" rule would
// match /au and loop) and its destinations can't lowercase a parameter.
// Everything else passes straight through untouched.
const UPPER = /^\/(AU|NZ|US|UK|CA|EU|SG)(?=\/|$)/i;

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const m = UPPER.exec(pathname);
  if (m && m[1] !== m[1].toLowerCase()) {
    const url = req.nextUrl.clone();
    url.pathname = `/${m[1].toLowerCase()}${pathname.slice(m[0].length)}`;
    return NextResponse.redirect(url, 308);
  }
  return NextResponse.next();
}

// Unlike next.config.js redirects, the matcher is compiled case-SENSITIVE
// (checked: /au never enters the middleware, /Au is a plain 404), so this runs
// only on the exact upper-case prefixes and costs the ordinary pages nothing.
export const config = {
  matcher: ["/(AU|NZ|US|UK|CA|EU|SG)", "/(AU|NZ|US|UK|CA|EU|SG)/:path*"],
};
