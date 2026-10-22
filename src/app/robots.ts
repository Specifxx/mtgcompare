import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Backlink, data and minor-engine crawlers that render page after page of the
// long tail for someone else's index and send no visitors (2026-10-16, as on
// RiftCompare). A bot that ignores robots.txt needs the Vercel Firewall instead.
const BLOCKED_BOTS = [
  "Bytespider", "meta-externalagent", "Meta-ExternalAgent",
  "MJ12bot", "DotBot", "PetalBot", "DataForSeoBot", "BLEXBot", "Barkrowler", "serpstatbot", "SeekportBot", "ImagesiftBot", "Timpibot",
  // Added 2026-10-22 (cost: each page a crawler renders is a billed function invocation, ~17,000 product URLs × a release a day):
  // SEO-tool crawlers and AI training crawlers, which send no visitors. Search engines and AI SEARCH crawlers (OAI-SearchBot,
  // PerplexityBot, Claude-SearchBot) can still read the site.
  "AhrefsBot", "SemrushBot", "GPTBot", "CCBot", "ClaudeBot", "anthropic-ai", "Google-Extended", "Applebot-Extended", "Amazonbot", "cohere-ai", "Diffbot", "omgili",
];

// QUERY-STRING URLS ARE NOT CRAWLED (2026-10-16). No page reads a query string
// and no sitemap URL carries one, so a ?utm_ / ?ref= variant is the same page
// fetched again. The Allows keep what a crawler needs that does carry a query:
// Next's assets (?dpl=; without them Google cannot render a page), the share
// images and the icon. The longest matching rule wins, so each beats "/*?".
const QUERY_ALLOWS = ["/_next/", "/og/", "/*opengraph-image", "/icon"];

// /sitemap.xml is the index Next writes for generateSitemaps (src/app/sitemap.ts).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: ["/", ...QUERY_ALLOWS], disallow: ["/api/", "/*?"] },
      { userAgent: BLOCKED_BOTS, disallow: "/" },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
