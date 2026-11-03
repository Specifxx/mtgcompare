/** @type {import('next').NextConfig} */
// Cost notes (mirrors Rift Compare, DECISIONS.md "Cached pages refresh every 6
// to 24 hours"): public pages read committed JSON under data/, never the
// database, so the data files must ship with every server function.
module.exports = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    // Card art is served straight from TCGplayer's CDN at the size we ask for;
    // Vercel image optimisation is billed per source image, so it stays off.
    unoptimized: true,
  },
  experimental: {
    outputFileTracingIncludes: {
      "/**": ["./data/public/**/*", "./data/history/**/*"],
    },
  },
  async redirects() {
    return [{ source: "/deals", destination: "/tools/deal-finder", permanent: true }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};
