import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Personal pages (/watching, /dashboard, /profile and the /watchlist and
// /account redirects) are NOT disallowed: each carries a noindex meta, which a
// Disallow would hide from Google. /llm/* mirrors are noindex pages meant for
// AI crawlers, so they are not disallowed either. The sitemap INDEX is listed,
// never a child (REQ-WP15-8); robots.ts reads no data.
const PRIVATE = ["/api/", "/admin", "/login", "/premium/welcome"];
// AI search and answer crawlers are welcome on the public site; training-only
// crawlers are not.
const AI_ALLOWED = ["OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "Perplexity-User", "ClaudeBot", "Claude-User", "Claude-SearchBot"];
const AI_TRAINING_BLOCKED = ["GPTBot", "CCBot", "Google-Extended", "Bytespider"];
// Backlink, data and minor-engine crawlers (2026-10-16): they render the
// 59,000-URL long tail for someone else's index and send no visitors, as on
// RiftCompare. AhrefsBot and SemrushBot stay allowed. A bot that ignores
// robots.txt needs the Vercel Firewall instead.
const BULK_BLOCKED = ["meta-externalagent", "Meta-ExternalAgent", "MJ12bot", "DotBot", "PetalBot", "DataForSeoBot", "BLEXBot", "Barkrowler", "serpstatbot", "SeekportBot", "ImagesiftBot", "Timpibot"];

// QUERY-STRING URLS ARE NOT CRAWLED (2026-10-16). No sitemap URL carries one,
// and every page that reads one canonicalises to its bare URL: each card page
// links its other finish as ?finish=, which doubled the crawl of 35,000 card
// pages for URLs that canonicalise straight back. The Allows keep what a
// crawler needs that does carry a query: Next's assets (?dpl=; without them
// Google cannot render a page), the share images (og:image is
// ".../opengraph-image?<hash>") and the icons. The longest match wins, so each
// Allow beats "/*?". DECISIONS.md, "The CDN finally caches the public pages".
const QUERY = "/*?";
const QUERY_ALLOWS = ["/_next/", "/*opengraph-image", "/*twitter-image", "/icon", "/apple-icon"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: ["/", ...QUERY_ALLOWS], disallow: [...PRIVATE, QUERY] },
      { userAgent: AI_ALLOWED, allow: ["/", ...QUERY_ALLOWS], disallow: [...PRIVATE, QUERY] },
      { userAgent: [...AI_TRAINING_BLOCKED, ...BULK_BLOCKED], disallow: "/" },
    ],
    sitemap: [`${SITE_URL}/sitemap.xml`, `${SITE_URL}/news-sitemap.xml`],
    host: SITE_URL,
  };
}
