// Every outbound buy link goes through here: the destination is checked
// against known shop hosts (so /go is not an open redirect), tagged with the
// affiliate parameters, and the visitor is sent on. The click itself is
// recorded by the "buy_click" Vercel Analytics event (BuyClickTracker); there
// is no database.
import { NextResponse } from "next/server";
import { SITE } from "@/site.config";
import { subId, tagged } from "@/lib/affiliate";

export const dynamic = "force-dynamic";

const ALLOWED = [
  /(^|\.)ebay\.(com|co\.uk|com\.au|ca|de|fr|it|es)$/i,
  /(^|\.)tcgplayer\.com$/i,
  /(^|\.)amazon\.(com|co\.uk|ca|com\.au|de)$/i,
  ...[...SITE.stores, ...(SITE.kits?.stores ?? [])].map((s) => new RegExp(`(^|\\.)${new URL(s.base).hostname.replace(/^www\./, "").replace(/\./g, "\\.")}$`, "i")),
];

export function GET(req: Request) {
  const u = new URL(req.url);
  const dest = u.searchParams.get("u") ?? "";
  let host = "";
  try {
    host = new URL(dest).hostname;
  } catch {}
  if (!host || !ALLOWED.some((r) => r.test(host)) || !/^https:\/\//.test(dest)) return NextResponse.redirect(new URL("/", req.url));
  const pid = Number(u.searchParams.get("p")) || null;
  const page = (u.searchParams.get("from") ?? "").slice(0, 40) || null;
  const market = (u.searchParams.get("m") ?? "").slice(0, 4) || null;
  const res = NextResponse.redirect(tagged(dest, subId(market, page, pid)), 302);
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  // Affiliate links must be non-indexed and non-cacheable (Amazon Associates Operating Agreement, 2026-11-02).
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
