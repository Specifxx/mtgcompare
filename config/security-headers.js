// Security headers for next.config.js `headers()`: one list, tested by
// tests/security-headers.test.ts. /embed/* is meant to be framed by other sites,
// so it gets no X-Frame-Options (its own responses carry frame-ancestors *).
const BASE = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

module.exports = [
  // Every path except /embed/*: framing only by ourselves.
  { source: "/((?!embed(?:/|$)).*)", headers: [...BASE, { key: "X-Frame-Options", value: "SAMEORIGIN" }] },
  { source: "/embed/:path*", headers: BASE },
];
