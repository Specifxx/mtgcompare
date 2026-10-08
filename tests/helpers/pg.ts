// DB-backed tests skip (never fail) when TEST_DATABASE_URL is unset, so `npm test` stays green on a machine without Postgres (C23). Owner WP19.
// Usage: const db = await testDb(); if (!db) return t.skip("TEST_DATABASE_URL is not set");   Private tables only: public data is files, not rows (section 12), so no public-data test needs a database.
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";
export const hasTestDb = (): boolean => TEST_DATABASE_URL.length > 0;
/** Refuses anything that is not a local/scratch database: a test must never write to Neon production. */
export function assertScratchUrl(url: string): void {
  const u = new URL(url);
  const ok = ["localhost", "127.0.0.1", "::1"].includes(u.hostname) || /_test$|_scratch$/.test(u.pathname.replace(/^\//, ""));
  if (!ok || /neon\.tech/i.test(u.hostname)) throw new Error(`TEST_DATABASE_URL must point at a local or *_test/*_scratch database, got host ${u.hostname}`);
}
export async function testDb(): Promise<import("@prisma/client").PrismaClient | null> {
  if (!hasTestDb()) return null;
  assertScratchUrl(TEST_DATABASE_URL);
  const { PrismaClient } = await import("@prisma/client");
  return new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });
}
