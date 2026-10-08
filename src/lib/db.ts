// The Prisma client, one per process.
//
// ── NEON HOLDS PRIVATE STATE ONLY (contract 12: public data is published files, not rows) ────────────────────────────────────
// Accounts, billing, watchlists, price alerts, collection, notifications, newsletter, inbox, counters, the eBay ledger and listings, ops rows. The catalogue, every price,
// the price history, the browse index and every precomputed public view are JSON files read through the loaders of src/lib/data/** (plane/runtime.ts: a pinned fetch with no
// tag, so a publish needs no purge). A public page renders with this database down, deleted or rotated.
//
// ── EGRESS AND COMPUTE RULES (Neon Free: 5 GB/month of transfer, 100 CU-hours of compute; RiftCompare learned them the expensive way, DECISIONS.md there, 2026-09-11) ──
//   1. A request path never reads the database directly. Nothing under src/app imports this module (tests/app-no-db-import.test.ts); the per-user libraries named in CLAUDE.md
//      query per user or per request, uncached, `select`-limited, from account pages and /api routes only: never from the root layout and never from a public page's server
//      render (tests/public-no-neon.test.ts). Panels that need a Neon row on a public page (the eBay listings, "decks using this card", reviews, the launch promo) load from
//      /api routes in the browser, and not at all for crawlers (plane/crawler.ts).
//   2. unstable_cache lives only in src/lib/data/ (tests/nested-cache.test.ts). A Neon-backed cache wraps a callback that only queries Neon; it never wraps a plane read, a loader
//      or a fetch, and never wraps a loader that already caches itself.
//   3. The only per-request WRITE of public traffic is the card-view counter, and it is sampled, batched in the instance and flushed in the first minute of each half hour
//      (plane/view-beacon.ts), so the database wakes at most 48 times a day however many instances run (contract 12.12).
//   4. Select only the columns a page renders. No generateStaticParams prewarming of data-backed routes, and production builds are gated to the weekly release
//      (scripts/vercel-ignore-build.sh): a build reads no database and no data host.
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** `next build` and its page-data workers run with NEXT_PHASE=phase-production-build. A build reads no database (Annex C check 24): in that phase the client is pointed at a closed local port, so a stray query fails at once instead of reading the real one. */
const building = process.env.NEXT_PHASE === "phase-production-build";
const BUILD_URL = "postgresql://build:none@127.0.0.1:1/none";

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.PRISMA_LOG === "1" ? ["query", "warn", "error"] : ["error"],
    ...(building ? { datasourceUrl: BUILD_URL } : {}),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}
