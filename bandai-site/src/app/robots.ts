import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Bulk crawlers that neither send visitors nor feed a search or answer engine:
// each page they fetch is a render and an ISR write we pay for (Rift Compare's
// list, DECISIONS.md "Vercel cost"). AhrefsBot and SemrushBot stay allowed (the
// owner's SEO tools), as do Google, Bing and the AI answer engines.
const BLOCKED_BOTS = [
  "Bytespider", "meta-externalagent", "Meta-ExternalAgent",
  "MJ12bot", "DotBot", "PetalBot", "DataForSeoBot", "BLEXBot", "Barkrowler", "serpstatbot", "SeekportBot", "ImagesiftBot", "Timpibot",
];

// No sitemap URL carries a query string and every page canonicalises to its
// clean URL, so a crawler walking ?q= / ?sort= / ?utm_ variants only buys
// requests. The longest matching rule wins, so each Allow beats "/*?": Next's
// assets (?dpl=; Google needs them to render), share images and icons.
// A shared link (?utm_source=share, lib/share.ts) is allowed too, so X's and
// Reddit's preview fetchers, which obey robots.txt, can draw its card; the page
// canonicalises to its clean URL.
const QUERY_ALLOWS = ["/_next/", "/*opengraph-image", "/*twitter-image", "/icon", "/apple-icon", "/*utm_source=share"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: ["/", ...QUERY_ALLOWS], disallow: ["/api/", "/go", "/*?"] },
      { userAgent: BLOCKED_BOTS, disallow: "/" },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
