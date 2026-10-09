// The one source of the Cache-Control of plane-backed pages (contract 12.7.6): tests/headers-allowlist.test.ts reads the same file.
const plane = require("./src/lib/data/plane/headers.json");

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "tcgplayer-cdn.tcgplayer.com" }],
  },
  experimental: {
    // Share images read their brand fonts from src/lib/og/fonts at runtime
    // (lib/og/fonts.ts); trace them into every opengraph-image function. The
    // key is matched against the route (e.g. /card/[slug]/opengraph-image).
    outputFileTracingIncludes: { "opengraph-image": ["./src/lib/og/fonts/*.ttf"] },
  },
  // www.mtgcompare.app → mtgcompare.app, whatever the Vercel domain settings say,
  // so search engines only ever see the apex host the canonical URLs name.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.mtgcompare.app" }],
        destination: "https://mtgcompare.app/:path*",
        permanent: true,
      },
      // Wave-2 tools (RiftCompare's lineup): the Buy List Planner became Best
      // Basket, the box value page became the Box EV calculator, and the bulk
      // pricer is /deck (RiftCompare folded its Bulk Pricer into /deck).
      { source: "/tools/buy-list", destination: "/tools/best-basket?source=watchlist", permanent: true },
      { source: "/tools/box-value", destination: "/tools/box-ev", permanent: true },
      { source: "/bulk-pricer", destination: "/deck", permanent: true },
      // There is no pre-order price page: the sets still to come are the "Coming up" part of
      // /release-dates, each linking to its set page, where pre-order listings are priced. An
      // old /preorders URL lands there; it was a page.tsx that only redirected (and the nav's
      // "Pre-order prices") until 2026-10-09 (tests/nav-routes.test.ts).
      { source: "/preorders", destination: "/release-dates", permanent: true },
      // A signed-out visit to a member page is a real 307 to the login page,
      // decided before anything streams. These routes have a loading.tsx; the
      // page's own redirect() only runs after that shell has been flushed, and
      // swapping the shell for the redirect threw React error #310 in production
      // (11 of 32 crawl combinations). No session cookie means the page would
      // redirect anyway, so the page's check stays for a stale or invalid cookie.
      { source: "/watching", missing: [{ type: "cookie", key: "mc_session" }], destination: "/login?next=/watching", permanent: false },
      { source: "/portfolio", missing: [{ type: "cookie", key: "mc_session" }], destination: "/login?next=/portfolio", permanent: false },
      { source: "/portfolio/sets", missing: [{ type: "cookie", key: "mc_session" }], destination: "/login?next=/portfolio/sets", permanent: false },
      { source: "/portfolio/sets/:set", missing: [{ type: "cookie", key: "mc_session" }], destination: "/login?next=/portfolio/sets/:set", permanent: false },
    ];
  },
  async headers() {
    return [
      // The admin area answers outsiders with a 404, and is noindex besides.
      { source: "/admin", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      { source: "/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      // Framing: every page is SAMEORIGIN except the embeds (/embed/**), which exist to be framed and say so with their own `frame-ancestors *` (src/lib/embed-html.ts).
      { source: "/((?!embed(?:/|$)).*)", headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }] },
      // Share PNGs are not pages: keep them out of search results.
      { source: "/opengraph-image:suffix(.*)", headers: [{ key: "X-Robots-Tag", value: "noindex" }] },
      { source: "/:path*/opengraph-image:suffix(.*)", headers: [{ key: "X-Robots-Tag", value: "noindex" }] },
      // Plane-backed pages: the CDN keeps the HTML five minutes and may serve it stale ten more; per-user and per-tier pages and every /api route are private.
      // Sitemaps, feeds, llms files and image routes are route handlers and set publicDataHeaders() themselves (Next adds its own Cache-Control to metadata routes, so a header here would double).
      ...plane.pagesPublic.map((source) => ({ source, headers: [{ key: "Cache-Control", value: plane.public }] })),
      ...plane.pagesPrivate.map((source) => ({ source, headers: [{ key: "Cache-Control", value: plane.private }] })),
    ];
  },
};

module.exports = nextConfig;
