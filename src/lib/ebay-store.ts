// The importer's database side: the EbayListing / EbayCallDay tables (prisma/schema.prisma), the
// atomic call reservation, replace-a-feed, the purge, and the read the plan needs. IMPORTER ONLY
// (the web route reads through ebay-read.ts). Everything the importer does to the database goes
// through the ImportDb interface, so tests/ run the whole importer against an in-memory fake
// while scripts/ebay-import.ts and the scratch-database verification use prismaImportDb().
import { Prisma, type PrismaClient } from "@prisma/client";
import type { FeedItem } from "./ebay-context";
import { utcTimestamp } from "./pg-time";

// ─── The budget day ────────────────────────────────────────────────────────────

/**
 * The time zone eBay resets its daily call limit in: midnight Pacific (America/Los_Angeles; daylight saving
 * included, which is why the day is computed with Intl and not by a fixed UTC offset). eBay's own limits
 * page could not be read from this sandbox (403); apis.io's summary of eBay's limits says "reset at
 * midnight Pacific Time", and the Analytics API's getRateLimits returns the exact reset timestamp.
 */
export const BUDGET_TZ = "America/Los_Angeles";

/** YYYY-MM-DD of `ms` in the budget time zone. */
export function budgetDay(ms: number, tz: string = BUDGET_TZ): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// ─── The interface ─────────────────────────────────────────────────────────────

/** What the planner needs to know about one product in one region (a ProductStat row, with its cheapest listed offer). */
export interface PlanRow {
  productId: string;
  name: string;
  /** Product.productType: the type's label ("Booster Box"). */
  typeLabel: string;
  setCode: string | null;
  groupKey: string;
  /** AU | NZ | US | UK | CA | EU | SG */
  market: string;
  /** ProductStat.lowestPriceCents: cheapest OPEN offer, in the market's currency (null: nothing open = sold out). */
  openCents: number | null;
  /** Cheapest offer of any stock state, same currency (null: no offer rows). */
  anyCents: number | null;
}

export interface FeedSummary {
  feeds: number;
  rows: number;
  itemFeeds: number;
  oldest: Date | null;
}

export interface ImportDb {
  /** Create the two tables if they are missing (identical to what `prisma db push` makes). */
  ensureTables(): Promise<void>;
  /** Reserve `n` Browse calls for `day` against `cap`, atomically: the day's new total, or null when it would pass the cap. */
  reserve(day: string, n: number, cap: number): Promise<number | null>;
  /** Calls reserved so far for `day`. */
  used(day: string): Promise<number>;
  /** Replace ALL of a feed's rows with `items` in one transaction (never appended). */
  replaceFeed(feed: string, items: readonly FeedItem[], fetchedAt: Date): Promise<void>;
  /** replaceFeed for many feeds in ONE transaction (the catalogue sweep writes hundreds); feeds with no items are left alone. */
  replaceFeeds(feeds: readonly { feed: string; items: readonly FeedItem[] }[], fetchedAt: Date): Promise<void>;
  /** Delete every listing fetched before `cutoff` and every call-day row older than `keepDays`; returns the number of listings deleted. */
  purge(cutoff: Date, today: string, keepDays?: number): Promise<number>;
  /** Every ProductStat row with its prices (the importer may read whole tables: db.ts rule 3). */
  planRows(): Promise<PlanRow[]>;
  /** The feeds' keys and ages for the plan's "keep the old rows" decisions and the summary. */
  feedAges(): Promise<Map<string, Date>>;
  summary(): Promise<FeedSummary>;
}

// ─── DDL: what prisma db push makes, for the importer to self-heal with ────────

export const DDL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS "EbayListing" (
    "feed" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "itemId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "priceValue" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "shipValue" TEXT,
    "shipFree" BOOLEAN,
    "condition" TEXT,
    "url" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EbayListing_pkey" PRIMARY KEY ("feed","rank")
  )`,
  `CREATE INDEX IF NOT EXISTS "EbayListing_fetchedAt_idx" ON "EbayListing"("fetchedAt")`,
  `CREATE TABLE IF NOT EXISTS "EbayCallDay" (
    "day" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EbayCallDay_pkey" PRIMARY KEY ("day")
  )`,
];

// ─── Prisma implementation ─────────────────────────────────────────────────────

/** The few PrismaClient members the importer uses (typed loosely so db.ts's extended client fits). */
interface Db {
  $executeRawUnsafe: PrismaClient["$executeRawUnsafe"];
  $queryRaw: PrismaClient["$queryRaw"];
  $executeRaw: PrismaClient["$executeRaw"];
  $transaction: (ops: Prisma.PrismaPromise<unknown>[]) => Promise<unknown>;
}

export function prismaImportDb(prisma: Db): ImportDb {
  return {
    async ensureTables() {
      for (const sql of DDL) await prisma.$executeRawUnsafe(sql);
    },

    // ONE statement. The first reservation of a day inserts (n <= cap is checked before); every later one is
    // the conflict branch, whose WHERE refuses any increment that would pass the cap, so overlapping runs and
    // manual dispatches can never spend more than `cap` between them. RETURNING is empty when refused.
    async reserve(day, n, cap) {
      if (!Number.isInteger(n) || n <= 0 || n > cap) return null;
      const rows = await prisma.$queryRaw<{ total: number }[]>`
        INSERT INTO "EbayCallDay" ("day", "total", "updatedAt")
        VALUES (${day}, ${n}, (now() AT TIME ZONE 'UTC'))
        ON CONFLICT ("day") DO UPDATE
          SET "total" = "EbayCallDay"."total" + ${n}, "updatedAt" = (now() AT TIME ZONE 'UTC')
          WHERE "EbayCallDay"."total" + ${n} <= ${cap}
        RETURNING "total"`;
      return rows.length ? Number(rows[0].total) : null;
    },

    async used(day) {
      // A database that has not had its first import yet has no table: that is "nothing used", not an error.
      const has = await prisma.$queryRaw<{ ok: boolean }[]>`SELECT to_regclass('public."EbayCallDay"') IS NOT NULL AS "ok"`;
      if (!has[0]?.ok) return 0;
      const rows = await prisma.$queryRaw<{ total: number }[]>`SELECT "total" FROM "EbayCallDay" WHERE "day" = ${day}`;
      return rows.length ? Number(rows[0].total) : 0;
    },

    async replaceFeed(feed, items, fetchedAt) {
      if (!items.length) return; // the caller never replaces with nothing; belt and braces
      const values = Prisma.join(
        items.map(
          (it, rank) =>
            Prisma.sql`(${feed}, ${rank}, ${it.id}, ${it.title}, ${it.imageUrl}, ${it.price.value}, ${it.price.currency},
              ${it.ship?.free ? null : it.ship?.value ?? null}, ${it.ship ? (it.ship.free ? true : it.ship.value ? false : null) : null}, ${it.condition ?? null}, ${it.url}, ${utcTimestamp(fetchedAt)})`,
        ),
      );
      await prisma.$transaction([
        // Two runs replacing the same feed at once would both delete, then both insert (a primary-key violation): one at a time.
        prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${feed}))`,
        prisma.$executeRaw`DELETE FROM "EbayListing" WHERE "feed" = ${feed}`,
        prisma.$executeRaw`INSERT INTO "EbayListing" ("feed","rank","itemId","title","imageUrl","priceValue","currency","shipValue","shipFree","condition","url","fetchedAt") VALUES ${values}`,
      ]);
    },

    async replaceFeeds(feeds, fetchedAt) {
      const list = feeds.filter((f) => f.items.length > 0);
      if (!list.length) return;
      const names = [...new Set(list.map((f) => f.feed))].sort(); // locks taken in one order: two writers can never deadlock
      const values = Prisma.join(
        list.flatMap((f) =>
          f.items.map(
            (it, rank) =>
              Prisma.sql`(${f.feed}, ${rank}, ${it.id}, ${it.title}, ${it.imageUrl}, ${it.price.value}, ${it.price.currency},
                ${it.ship?.free ? null : it.ship?.value ?? null}, ${it.ship ? (it.ship.free ? true : it.ship.value ? false : null) : null}, ${it.condition ?? null}, ${it.url}, ${utcTimestamp(fetchedAt)})`,
          ),
        ),
      );
      await prisma.$transaction([
        prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(f)) FROM unnest(${names}::text[]) AS f ORDER BY f`,
        prisma.$executeRaw`DELETE FROM "EbayListing" WHERE "feed" = ANY(${names}::text[])`,
        prisma.$executeRaw`INSERT INTO "EbayListing" ("feed","rank","itemId","title","imageUrl","priceValue","currency","shipValue","shipFree","condition","url","fetchedAt") VALUES ${values}`,
      ]);
    },

    async purge(cutoff, today, keepDays = 7) {
      const n = await prisma.$executeRaw`DELETE FROM "EbayListing" WHERE "fetchedAt" < ${utcTimestamp(cutoff)}`;
      const oldest = budgetDay(Date.parse(`${today}T12:00:00Z`) - keepDays * 86400_000, "UTC");
      await prisma.$executeRaw`DELETE FROM "EbayCallDay" WHERE "day" < ${oldest}`;
      return Number(n);
    },

    async planRows() {
      const rows = await prisma.$queryRaw<
        { productId: string; name: string; typeLabel: string; setCode: string | null; groupKey: string; market: string; openCents: number | null; anyCents: number | null }[]
      >`
        SELECT ps."productId" AS "productId", p."name" AS "name", p."productType" AS "typeLabel", p."setCode" AS "setCode",
               p."groupKey" AS "groupKey", ps."market" AS "market", ps."lowestPriceCents" AS "openCents",
               (SELECT min(o."priceCents") FROM "Offer" o WHERE o."productId" = ps."productId" AND o."market" = ps."market") AS "anyCents"
        FROM "ProductStat" ps JOIN "Product" p ON p."id" = ps."productId"`;
      return rows.map((r) => ({ ...r, openCents: r.openCents == null ? null : Number(r.openCents), anyCents: r.anyCents == null ? null : Number(r.anyCents) }));
    },

    async feedAges() {
      const rows = await prisma.$queryRaw<{ feed: string; at: Date }[]>`SELECT "feed", min("fetchedAt") AS "at" FROM "EbayListing" GROUP BY "feed"`;
      return new Map(rows.map((r) => [r.feed, new Date(r.at)]));
    },

    async summary() {
      const rows = await prisma.$queryRaw<{ feeds: bigint; rows: bigint; items: bigint; oldest: Date | null }[]>`
        SELECT count(DISTINCT "feed") AS "feeds", count(*) AS "rows", count(DISTINCT "feed") FILTER (WHERE "feed" LIKE '%|item:%') AS "items", min("fetchedAt") AS "oldest"
        FROM "EbayListing"`;
      const r = rows[0];
      return { feeds: Number(r?.feeds ?? 0), rows: Number(r?.rows ?? 0), itemFeeds: Number(r?.items ?? 0), oldest: r?.oldest ? new Date(r.oldest) : null };
    },
  };
}
