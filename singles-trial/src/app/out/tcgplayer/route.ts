import { impactUrl } from "@/lib/affiliate";
import { looksLikeBot } from "@/lib/bot-click";

export const dynamic = "force-dynamic";

// Every TCGplayer link goes through here (the sister sites' rule, 2026-11-17): a person is sent on through our Impact link; a
// crawler, or anything that did not follow a link on one of our pages, goes to TCGplayer's own page untagged, so Impact never
// counts it as our click. Not an open redirect: https and tcgplayer.com only. Never cached, never indexed.
const HEADERS = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer-when-downgrade" };

export function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  let dest: URL;
  try {
    dest = new URL(q.get("u") ?? "");
  } catch {
    return new Response(null, { status: 302, headers: { ...HEADERS, Location: "/" } });
  }
  if (dest.protocol !== "https:" || !/(?:^|\.)tcgplayer\.com$/i.test(dest.hostname)) return new Response(null, { status: 302, headers: { ...HEADERS, Location: "/" } });
  const sid = (q.get("sharedid") ?? "").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 80);
  const location = looksLikeBot(req.headers) || !sid ? dest.toString() : impactUrl(dest.toString(), sid);
  return new Response(null, { status: 302, headers: { ...HEADERS, Location: location } });
}
