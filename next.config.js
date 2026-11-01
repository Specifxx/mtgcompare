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
  "script-src 'self' 'unsafe-inline' https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.google.com https://*.gstatic.com https://*.adtrafficquality.google https://www.googletagmanager.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "connect-src 'self' https://api.github.com https://raw.githubusercontent.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://vitals.vercel-insights.com https://*.googlesyndication.com https://*.google.com https://*.doubleclick.net https://*.adtrafficquality.google",
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
const CDN_PAGES = ["/", "/:region(au|us|uk|ca|nz|eu|sg)", "/:region(au|us|uk|ca|nz|eu|sg)/:path*", "/guides/:slug", "/blog", "/blog/:slug", "/forum", "/forum/:path*"];

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
      // The old MTG Compare was a singles site (until 2026-10-21). Its US pages had no region prefix; its market pages were
      // /au, /uk, /ca, /eu, /sg, which still exist. Card, deck and member pages have no sealed equivalent: they go to the
      // sealed browse page of the market (US when none), so old links and Google's index land somewhere useful. Upper-case
      // region prefixes (/AU) are lowercased by src/middleware.ts: a redirect here matches case-insensitively, so
      // "/AU/:path*" → "/au/:path*" would match /au too and loop.
      { source: "/sealed", destination: "/us/sealed", permanent: true },
      { source: "/sealed/:slug*", destination: "/us/sealed", permanent: true },
      { source: "/:region(au|uk|ca|eu|sg)/sealed/:slug+", destination: "/:region/sealed", permanent: true },
      { source: "/sets", destination: "/us/sets", permanent: true },
      { source: "/sets/:set*", destination: "/us/sets", permanent: true },
      { source: "/stores", destination: "/us/stores", permanent: true },
      { source: "/stores/:path*", destination: "/us/stores", permanent: true },
      { source: "/release-dates", destination: "/us/releases", permanent: true },
      { source: "/star-trek-preorders", destination: "/us/preorders/star-trek", permanent: true },
      { source: "/:path(card|cards|singles|browse|search|price-guide|movers|rising|market|commanders|decks|deck|tools|colors|keywords|gallery|trade|embed|c)", destination: "/us/sealed", permanent: true },
      { source: "/:path(card|cards|singles|browse|search|price-guide|movers|rising|market|commanders|decks|deck|tools|colors|keywords|gallery|trade|embed|c)/:rest*", destination: "/us/sealed", permanent: true },
      { source: "/:region(au|uk|ca|eu|sg)/:path(card|cards|singles|browse|search|price-guide|movers|rising|market|commanders|decks|tools)/:rest*", destination: "/:region/sealed", permanent: true },
      { source: "/:path(premium|login|account|profile|dashboard|portfolio|watching|watchlist|alerts|newsletter|unsubscribe|support|feedback|learn|methodology|editorial-policy|authors|admin)", destination: "/about", permanent: true },
      { source: "/:path(premium|login|account|profile|dashboard|portfolio|watching|watchlist|alerts|newsletter|unsubscribe|support|feedback|learn|methodology|editorial-policy|authors|admin)/:rest*", destination: "/about", permanent: true },
      // The old singles site's creator pages: /creators is the creators hub again (2026-10-30); anything under it goes there.
      { source: "/creators/:rest+", destination: "/creators", permanent: true },
      // Blog and guide redirects (old slugs that no longer exist) go below this line.
      // The old site's singles-only posts (src/lib/blog/index.ts DROPPED_POSTS) go to the blog; its /guides/<slug> posts to their
      // /blog/<slug>, or the blog when dropped (OLD_GUIDE_POSTS). tests/guides.test.ts checks both lists against these rules. The
      // last rule sends every other /guides/<slug> to the US guides, except the one region-less guide that lives there.
      { source: "/blog/:slug(magic-star-trek-spoilers|magic-card-price-movers|commander-staples-prices|cheapest-magic-mythic-rares-by-colour|most-expensive-magic-cards|magic-set-value-concentration|newest-magic-set-chase-cards|magic-card-rarities-explained)", destination: "/blog", permanent: true },
      { source: "/guides/:slug(where-to-buy-magic-cards|are-magic-cards-cheaper-abroad)", destination: "/blog/:slug", permanent: true },
      { source: "/guides/magic-card-rarities-explained", destination: "/blog", permanent: true },
      { source: "/guides", destination: "/us/guides", permanent: true },
      { source: "/guides/:path((?!magic-booster-box-prices-by-country$).*)", destination: "/us/guides", permanent: true },
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
