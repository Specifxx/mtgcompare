// What GET /api/ebay/<region> does, minus the HTTP: a context → the feeds that may answer it (a CASCADE)
// → ONE indexed read of the EbayListing table → the first feed with enough live rows. No eBay call, no token,
// no secret: the rows were put there by the daily import (scripts/ebay-import.ts). Injectable reader and clock,
// so tests/ run it with a fake and the route runs it with Prisma.
import { routeRaw } from "./public-data/route";
import { publicRowsBy } from "./public-data/store";
import { Prisma } from "@prisma/client";
import { listingHref } from "./affiliate";
import { refusedForType, refusedListing } from "./ebay-rules";
import {
  cleanImageUrl,
  feedKey,
  hoursToMs,
  MARKETPLACE_OF_REGION,
  MAX_FEED_ROWS,
  minRowsFor,
  parseMaxAgeHours,
  type FeedItem,
  type FeedKind,
  type ListingsResponse,
} from "./ebay-context";
import { utcTimestamp } from "./pg-time";
import type { ParsedContext } from "./ebay-context-parse";
import type { Region } from "./regions";
import { ALWAYS_TYPES } from "./ebay-eligibility";
import { TYPE_BY_LABEL, TYPE_BY_SLUG, type TypeKey } from "./sealed-title";

/** One EbayListing row, as the route reads it. */
export interface ListingRow {
  feed: string;
  rank: number;
  itemId: string;
  title: string;
  imageUrl: string;
  priceValue: string;
  currency: string;
  shipValue: string | null;
  shipFree: boolean | null;
  condition: string | null;
  url: string;
  fetchedAt: Date;
}

export interface ReadDeps {
  /**
   * The rows of the FIRST feed in `feeds` (priority order) that has at least its `mins` entry of rows fetched at or after
   * `cutoff`; nothing when none does. One indexed query (the primary key leads with `feed`), at most
   * MAX_FEED_ROWS rows. May throw (a missing table, a database error): the caller answers "empty".
   */
  rows(feeds: readonly string[], cutoff: Date, mins: readonly number[]): Promise<ListingRow[]>;
  /** The product behind a slug (a unique-index lookup), or null. */
  product(slug: string): Promise<{ id: string; productType: string } | null>;
  now(): number;
  env: Record<string, string | undefined>;
}

/**
 * May the generic "Sealed Pokémon" feed (boxes, ETBs, UPCs at US$30 and up) stand in for a type? Only for the types whose own prices are
 * that class. A booster pack, a tin, a blister or an unknown type would sit under a A$9 product with A$130–700 listings: no strip
 * (the compact eBay link) is better than a mismatched one.
 */
function sealedMayStandIn(type: TypeKey | undefined): boolean {
  return type !== undefined && ALWAYS_TYPES.has(type);
}

/** The feeds, in priority order, that can answer a context in a region's marketplace. `product` is item contexts' lookup result. */
export function cascadeFor(ctx: ParsedContext, region: Region, product?: { id: string; productType: string } | null): { kind: FeedKind; key: string }[] {
  const mkt = MARKETPLACE_OF_REGION[region];
  const f = (kind: FeedKind, arg?: string) => ({ kind, key: feedKey(mkt, kind, arg) });
  switch (ctx.kind) {
    case "chase":
      return [f("chase")];
    case "sealed":
      return [f("sealed")];
    case "set":
      return [f("set", ctx.slug!), f("chase")];
    case "type":
      return [f("type", ctx.slug!), ...(sealedMayStandIn(TYPE_BY_SLUG.get(ctx.slug!)?.key) ? [f("sealed")] : [])];
    case "item": {
      const type = product ? TYPE_BY_LABEL.get(product.productType) : undefined;
      return [...(product ? [f("item", product.id)] : []), ...(type ? [f("type", type.slug)] : []), ...(sealedMayStandIn(type?.key) ? [f("sealed")] : [])];
    }
  }
}

/**
 * A stored row is only returned if its link is one eBay item page with a campaign id in it (the same check the browser makes,
 * affiliate.ts listingHref: https, an eBay host, /itm/<id>, no port, one campid) and its picture is on eBay's image host. The campaign
 * id is NOT compared with this runtime's NEXT_PUBLIC_EBAY_CAMPAIGN_ID: the importer enforced the owner's id when it wrote the row.
 */
export function rowIsSafe(r: ListingRow, type?: TypeKey): boolean {
  return !!cleanImageUrl(r.imageUrl) && listingHref(r.url) !== null && !refusedAtRead(r, type);
}

/**
 * A sealed-product row (an item, type or generic sealed feed) the importer's rules refuse TODAY (ebay-normalise.ts refusedListing: a
 * product's contents, lots, partials, random variants…): not shown, even when it was stored before the rule existed (rows live up to a
 * day). Chase and set feeds (single cards) have their own filter at import.
 */
function refusedAtRead(r: ListingRow, type?: TypeKey): boolean {
  if (/\|(?:chase|set:)/.test(r.feed)) return false;
  return refusedListing(r.title) || (type !== undefined && refusedForType(r.title, type));
}

/** The product type a sealed feed is FOR (an item feed: the product's; a type feed: its slug's), so the per-type rules apply too. */
function feedType(kind: FeedKind, ctx: ParsedContext, product: { productType: string } | null | undefined): TypeKey | undefined {
  if (kind === "item") return product ? TYPE_BY_LABEL.get(product.productType)?.key : undefined;
  if (kind === "type" && ctx.kind === "type") return TYPE_BY_SLUG.get(ctx.slug!)?.key;
  return undefined;
}

/** A stored row → the whitelisted item the response carries. Shipping currency is the price's (eBay prices shipping in the marketplace's currency). */
export function rowToItem(r: ListingRow): FeedItem {
  const ship = r.shipFree ? { free: true } : r.shipValue ? { value: r.shipValue, currency: r.currency } : undefined;
  return {
    id: r.itemId,
    title: r.title,
    imageUrl: r.imageUrl,
    price: { value: r.priceValue, currency: r.currency },
    ...(ship ? { ship } : {}),
    ...(r.condition ? { condition: r.condition } : {}),
    url: r.url,
  };
}

/** The answer for a parsed context. Never throws: a database error, a missing table or an unknown product is "empty". */
export async function listingsFor(ctx: ParsedContext, region: Region, deps: ReadDeps): Promise<ListingsResponse> {
  const maxAgeMs = hoursToMs(parseMaxAgeHours(deps.env.EBAY_LISTING_MAX_AGE_HOURS));
  const empty = (reason: string): ListingsResponse => ({ feed: null, items: [], fetchedAt: null, maxAgeMs, reason });
  if ((deps.env.EBAY_LISTINGS ?? "").trim().toLowerCase() === "off") return empty("off");
  try {
    const product = ctx.kind === "item" ? await deps.product(ctx.slug!) : undefined;
    if (ctx.kind === "item" && !product) return empty("empty"); // an unknown product: no error text, no hint
    const cascade = cascadeFor(ctx, region, product);
    const now = deps.now();
    const cutoff = new Date(now - maxAgeMs);
    const rows = await deps.rows(cascade.map((c) => c.key), cutoff, cascade.map((c) => minRowsFor(c.kind)));
    // The database already picked the winning feed; pick again here so a reader that returns more is still right.
    for (const c of cascade) {
      const type = feedType(c.kind, ctx, product);
      const mine = rows.filter((r) => r.feed === c.key && r.fetchedAt.getTime() >= cutoff.getTime() && rowIsSafe(r, type)).sort((a, b) => a.rank - b.rank).slice(0, MAX_FEED_ROWS);
      if (mine.length < minRowsFor(c.kind)) continue;
      const oldest = Math.min(...mine.map((r) => r.fetchedAt.getTime()));
      return { feed: c.kind, items: mine.map(rowToItem), fetchedAt: new Date(oldest).toISOString(), maxAgeMs };
    }
    return empty("empty");
  } catch {
    return empty("empty"); // a missing table (before the first import) or a database blip: nothing to show, nothing to say
  }
}

// ─── Prisma reader ─────────────────────────────────────────────────────────────

type Db = {
  $queryRaw: <T = unknown>(q: TemplateStringsArray | Prisma.Sql, ...v: unknown[]) => Promise<T>;
};

export function prismaReadDeps(prisma: Db, env: ReadDeps["env"]): ReadDeps {
  return {
    env,
    now: () => Date.now(),
    // Each read is routeRaw(files, sql): the public data files (src/lib/public-data/) in "files" mode, the SQL in "db" mode.
    async product(slug) {
      const rows = await routeRaw(
        () => publicRowsBy("Product", "slug", [slug]).slice(0, 1).map((p) => ({ id: String(p.id), productType: String(p.productType) })),
        () => prisma.$queryRaw<{ id: string; productType: string }[]>(Prisma.sql`SELECT "id", "productType" FROM "Product" WHERE "slug" = ${slug} LIMIT 1`),
      );
      return rows[0] ?? null;
    },
    // One query: the rows of every feed in `feeds` that is fresh, the feeds' row counts as a window, and only the
    // best-priority feed with enough rows. Reads at most MAX_FEED_ROWS rows (db.ts rules 1 and 2).
    async rows(feeds, cutoff, mins) {
      const list = [...feeds];
      const need = list.map((_, i) => Math.max(1, Math.floor(mins[i] ?? 2)));
      const fromFiles = (): ListingRow[] => {
        for (let i = 0; i < list.length; i++) {
          const fresh = publicRowsBy("EbayListing", "feed", [list[i]]).filter((r) => (r.fetchedAt as Date).getTime() >= cutoff.getTime());
          if (fresh.length >= need[i]) {
            return [...fresh]
              .sort((a, b) => (a.rank as number) - (b.rank as number))
              .slice(0, MAX_FEED_ROWS)
              .map((r) => ({ ...(r as unknown as ListingRow), fetchedAt: new Date((r.fetchedAt as Date).getTime()) }));
          }
        }
        return [];
      };
      return routeRaw(fromFiles, () => prisma.$queryRaw<ListingRow[]>(Prisma.sql`
        WITH f AS (
          SELECT e.*, array_position(${list}::text[], e."feed") AS pos, count(*) OVER (PARTITION BY e."feed") AS n,
                 (${need}::int[])[array_position(${list}::text[], e."feed")] AS m
          FROM "EbayListing" e
          WHERE e."feed" = ANY(${list}::text[]) AND e."fetchedAt" >= ${utcTimestamp(cutoff)}
        )
        SELECT "feed", "rank", "itemId", "title", "imageUrl", "priceValue", "currency", "shipValue", "shipFree", "condition", "url", "fetchedAt"
        FROM f
        WHERE n >= m AND pos = (SELECT min(pos) FROM f WHERE n >= m)
        ORDER BY "rank"
        LIMIT ${MAX_FEED_ROWS}`));
    },
  };
}
