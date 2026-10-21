/** @type {import('next').NextConfig} */

// Safe defaults on every response. The Content-Security-Policy is REPORT-ONLY:
// product photos are hotlinked from ~250 store CDNs, and an enforcing policy
// that is wrong silently blanks them. Report-only never blocks anything; a
// violation shows in the browser console (there is no report endpoint), and the
// audit before switching it to enforce is: browse a few pages, read the console.
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "img-src https: data:",
  // Google AdSense (only loaded once NEXT_PUBLIC_ADSENSE_CLIENT is set: src/lib/adsense.ts).
  "script-src 'self' 'unsafe-inline' https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.google.com https://*.gstatic.com https://*.adtrafficquality.google",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "connect-src 'self' https://vitals.vercel-insights.com https://*.googlesyndication.com https://*.google.com https://*.doubleclick.net https://*.adtrafficquality.google",
  "frame-src https://*.googlesyndication.com https://*.doubleclick.net https://*.google.com",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
];

// THE PAGES ARE CACHED BY VERCEL'S CDN, NOT ISR (2026-10-17, DEPLOY.md "Caching"). An ISR write is billed per 8 KB of the page
// (~45 units for a product page's HTML + RSC) and every release empties the ISR cache, so each visited page was written again after
// every release: about twenty times what rendering it costs. Every data page is force-dynamic and this header keeps its response at
// the CDN for a day: Vercel-CDN-Cache-Control is read by Vercel's CDN before the page's own `private, no-store` and never reaches the
// browser. The data only changes with a release, and a release empties the CDN. Safe because no page reads a cookie, a header or
// the session: one copy is right for every visitor (tests/cache-ttl.test.ts walks them).
const CDN_CACHE = "public, s-maxage=86400, stale-while-revalidate=86400";
const CDN_PAGES = ["/:region(au|us|uk|ca|nz|eu|sg)", "/:region(au|us|uk|ca|nz|eu|sg)/:path*", "/guides/:slug"];

const nextConfig = {
  reactStrictMode: true,
  // The public data files (data/public/, ~25 MB: src/lib/public-data/) ride with every server function, which reads them instead of
  // Neon. Only when the build will read them (PUBLIC_DATA_MODE "files", the default, or "fallback").
  experimental: {
    outputFileTracingIncludes: (process.env.PUBLIC_DATA_MODE || "files").trim().toLowerCase() === "db" ? {} : { "/**": ["./data/public/**/*.json"] },
  },
  poweredByHeader: false,
  // Product photos are plain <img> tags pointing at each store's own CDN. Never
  // route them through Vercel Image Optimization, which is metered.
  images: { unoptimized: true },
  // The old DexCompare was a singles site. Its section URLs now point at the
  // sealed equivalents in Australia (its home market); old card pages 404.
  // Upper-case region prefixes (/AU) are lowercased by src/middleware.ts: a
  // redirect here matches case-insensitively, so "/AU/:path*" → "/au/:path*"
  // would match /au too and loop.
  async redirects() {
    return [
      { source: "/sealed", destination: "/au/sealed", permanent: true },
      { source: "/sealed/:slug", destination: "/au/sealed", permanent: true },
      { source: "/browse", destination: "/au/sealed", permanent: true },
      { source: "/sets", destination: "/au/sets", permanent: true },
      { source: "/sets/:set", destination: "/au/sets/:set", permanent: true },
      { source: "/stores", destination: "/au/stores", permanent: true },
      { source: "/restock", destination: "/au", permanent: true },
      { source: "/restock/:slug", destination: "/au", permanent: true },
      { source: "/deals", destination: "/au/deals", permanent: true },
      // The old site's guides and blog posts whose subject the sealed site now covers, each to the page that answers it. Only
      // slugs that existed under that prefix (apps/dexcompare/src/lib/articles.ts: category "guide" → /guides, "blog" → /blog)
      // are mapped; tests/guides.test.ts checks every one. They come before the blanket rule below, which matches /guides too.
      { source: "/guides", destination: "/au/guides", permanent: true },
      { source: "/guides/pokemon-sealed-products-explained", destination: "/au/guides/pokemon-sealed-products-explained", permanent: true },
      { source: "/guides/where-to-buy-pokemon-cards", destination: "/au/stores", permanent: true },
      { source: "/guides/how-to-buy-pokemon-sealed-product-for-less", destination: "/au/cheapest-packs", permanent: true },
      { source: "/guides/pokemon-card-sets-and-eras-explained", destination: "/au/sets", permanent: true },
      { source: "/blog", destination: "/au/guides", permanent: true },
      { source: "/blog/are-booster-boxes-worth-it", destination: "/au/guides/are-pokemon-booster-boxes-worth-it", permanent: true },
      { source: "/blog/cheapest-way-to-buy-pokemon-cards", destination: "/au/cheapest-packs", permanent: true },
      { source: "/blog/pokemon-30th-celebration-preorder-guide", destination: "/au/sets/30th-celebration", permanent: true },
      { source: "/blog/pitch-black-preorder-guide", destination: "/au/sets/pitch-black", permanent: true },
      { source: "/blog/chaos-rising-restock-playbook", destination: "/au/sets/chaos-rising", permanent: true },
      // The singles-only guides (grading, fakes, rarities, card values) have no sealed equivalent: the About page. Keep this last.
      // It skips the guides that live at /guides/<slug> now, the ones that compare every market at once
      // (src/app/(site)/guides/[slug]: "pokemon-booster-box-prices-by-country"): a redirect runs before the page would.
      { source: "/guides/:path((?!pokemon-booster-box-prices-by-country$).*)", destination: "/about", permanent: true },
    ];
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      ...CDN_PAGES.map((source) => ({ source, headers: [{ key: "Vercel-CDN-Cache-Control", value: CDN_CACHE }] })),
    ];
  },
};

module.exports = nextConfig;
