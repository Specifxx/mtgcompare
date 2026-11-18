// Pages are rendered per request and kept by Vercel's CDN for a day (never ISR: an ISR write is billed per page, and
// the data only changes with the daily release, which empties the CDN). Safe because no page reads a cookie, a header
// or the session (tests/cost-rules.test.ts). Query-string pages (/search) are not cached here; the search API caches itself.
const CDN_CACHE = "public, s-maxage=86400, stale-while-revalidate=86400";
const CDN_PAGES = ["/", "/about", "/terms", "/privacy", "/:game", "/:game/:set", "/:game/:set/:card", "/sitemap.xml", "/sitemaps/:file", "/llms.txt"];
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
];

/** @type {import('next').NextConfig} */
module.exports = {
  poweredByHeader: false,
  reactStrictMode: true,
  images: { unoptimized: true },
  // The card files are read with fs at request time: trace them into the functions that read them.
  experimental: { outputFileTracingIncludes: { "/**": ["./data/**/*.json"] } },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      ...CDN_PAGES.map((source) => ({ source, headers: [{ key: "Vercel-CDN-Cache-Control", value: CDN_CACHE }] })),
    ];
  },
};
