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

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE },
      { userAgent: AI_ALLOWED, allow: "/", disallow: PRIVATE },
      { userAgent: AI_TRAINING_BLOCKED, disallow: "/" },
    ],
    sitemap: [`${SITE_URL}/sitemap.xml`, `${SITE_URL}/news-sitemap.xml`],
    host: SITE_URL,
  };
}
