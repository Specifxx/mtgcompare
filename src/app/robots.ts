import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Personal pages (/watching, /dashboard, /profile and the /watchlist and
// /account redirects) are NOT disallowed: each carries a noindex meta, which a
// Disallow would hide from Google (RiftCompare, wave 2).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/login", "/premium/welcome"] }],
    sitemap: [`${SITE_URL}/sitemap.xml`, `${SITE_URL}/news-sitemap.xml`],
    host: SITE_URL,
  };
}
