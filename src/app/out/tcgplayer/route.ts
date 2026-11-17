import { impactUrl } from "@/lib/affiliate";
import { looksLikeBot } from "@/lib/bot-click";

export const dynamic = "force-dynamic";

// Every TCGplayer link on the site goes through here (2026-11-17, "Bot clicks on TCGplayer" in DECISIONS.md). A person is
// sent on to TCGplayer through our Impact link; a crawler, a headless browser or anything that did not follow a link on
// one of our pages is sent to TCGplayer's own page, untagged, so Impact never counts it as our click. The destination is
// checked (https, tcgplayer.com only: this is not an open redirect). Never cached, never indexed, disallowed in robots.txt.
const HEADERS = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer-when-downgrade" };

export function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  let dest: URL;
  try {
    dest = new URL(q.get("u") ?? "");
  } catch {
    return new Response(null, { status: 302, headers: { ...HEADERS, Location: "/" } });
  }
  if (dest.protocol !== "https:" || !/(?:^|\.)tcgplayer\.com$/i.test(dest.hostname)) {
    return new Response(null, { status: 302, headers: { ...HEADERS, Location: "/" } });
  }
  const sid = (q.get("sharedid") ?? "").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 80);
  const location = looksLikeBot(req.headers) || !sid ? dest.toString() : impactUrl(dest.toString(), sid);
  return new Response(null, { status: 302, headers: { ...HEADERS, Location: location } });
}
