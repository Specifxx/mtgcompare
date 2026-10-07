// THE server secret (AUTH_SECRET), resolved once and lazily, so a missing value
// fails at request time, not build time. Ported from RiftCompare: in production
// a missing or known-default value THROWS, because signing with a public secret
// would let anyone forge a session cookie.
let cached: Uint8Array | null = null;
const DEV_SECRET = "opcompare-dev-secret-change-me";

export function authSecret(): Uint8Array {
  if (cached) return cached;
  const s = process.env.AUTH_SECRET;
  if (!s || s === DEV_SECRET || s === "change-me") {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "AUTH_SECRET is not set (or is a default). Refusing to sign sessions in production. " +
          "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
      );
    }
    console.warn("[auth] AUTH_SECRET not set — using an insecure development-only secret.");
    cached = new TextEncoder().encode(DEV_SECRET);
    return cached;
  }
  cached = new TextEncoder().encode(s);
  return cached;
}
