// Fakes for the eBay import tests: an in-memory ImportDb, a scripted fetch, and product rows. No network, no database.
import { identify, isIdentity, TYPE_BY_KEY, type TypeKey } from "../../src/lib/sealed-title";
import type { Deps, EbayEnv } from "../../src/lib/ebay-api";
import type { FeedItem } from "../../src/lib/ebay-context";
import type { FeedSummary, ImportDb, PlanRow } from "../../src/lib/ebay-store";

export const NOW = Date.parse("2026-10-07T06:37:00Z");
export const SECRET = "SECRET-s3cr3t-value-ZZZ";
export const CLIENT_ID = "DexComp-DexComp-PRD-1234567890-abcdef12";
export const KEYS: EbayEnv = { EBAY_CLIENT_ID: CLIENT_ID, EBAY_CLIENT_SECRET: SECRET };

// ─── an in-memory ImportDb with the same contract as the SQL ────────────────────

export interface FakeDb extends ImportDb {
  feeds: Map<string, { items: FeedItem[]; fetchedAt: Date }>;
  days: Map<string, number>;
  replaced: string[];
  ensured: number;
  purges: Date[];
}

export function fakeDb(rows: PlanRow[] = [], opts: { failReplace?: (feed: string) => boolean } = {}): FakeDb {
  const db: FakeDb = {
    feeds: new Map(),
    days: new Map(),
    replaced: [],
    ensured: 0,
    purges: [],
    async ensureTables() {
      db.ensured++;
    },
    // The same contract as the one SQL statement: refuse anything that would pass the cap; first use of a day only if n <= cap.
    // No await between the check and the increment, exactly as the database does it in one statement.
    async reserve(day, n, cap) {
      await Promise.resolve();
      if (!Number.isInteger(n) || n <= 0 || n > cap) return null;
      const cur = db.days.get(day) ?? 0;
      if (cur + n > cap) return null;
      db.days.set(day, cur + n);
      return cur + n;
    },
    async used(day) {
      return db.days.get(day) ?? 0;
    },
    async replaceFeed(feed, items, fetchedAt) {
      if (opts.failReplace?.(feed)) throw new Error("db down");
      if (!items.length) return;
      db.feeds.set(feed, { items: [...items], fetchedAt });
      db.replaced.push(feed);
    },
    async replaceFeeds(feeds, fetchedAt) {
      for (const f of feeds) {
        if (opts.failReplace?.(f.feed)) throw new Error("db down");
      }
      for (const f of feeds) {
        if (!f.items.length) continue;
        db.feeds.set(f.feed, { items: [...f.items], fetchedAt });
        db.replaced.push(f.feed);
      }
    },
    async purge(cutoff) {
      db.purges.push(cutoff);
      let n = 0;
      for (const [k, v] of db.feeds) {
        if (v.fetchedAt < cutoff) {
          db.feeds.delete(k);
          n++;
        }
      }
      return n;
    },
    async planRows() {
      return rows;
    },
    async feedAges() {
      return new Map([...db.feeds].map(([k, v]) => [k, v.fetchedAt]));
    },
    async summary(): Promise<FeedSummary> {
      const all = [...db.feeds];
      return {
        feeds: all.length,
        rows: all.reduce((a, [, v]) => a + v.items.length, 0),
        itemFeeds: all.filter(([k]) => k.includes("|item:")).length,
        oldest: all.length ? new Date(Math.min(...all.map(([, v]) => v.fetchedAt.getTime()))) : null,
      };
    },
  };
  return db;
}

// ─── a scripted fetch ───────────────────────────────────────────────────────────

export type Handler = (url: string, init: RequestInit | undefined, n: number) => Response | Promise<Response>;

export function harness(handler: Handler, env: EbayEnv = KEYS) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const clock = { t: NOW };
  const deps: Deps = {
    now: () => clock.t,
    env,
    fetch: async (url, init) => {
      calls.push({ url, init });
      return handler(url, init, calls.length);
    },
  };
  return {
    deps,
    calls,
    clock,
    searches: () => calls.filter((c) => c.url.includes("/item_summary/search")),
    tokens: () => calls.filter((c) => c.url.includes("/oauth2/token")),
  };
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
export const okToken = (n = 1) => json({ access_token: `tok-${n}-` + "x".repeat(20), expires_in: 7200, token_type: "Application Access Token" });

// ─── eBay-shaped items ──────────────────────────────────────────────────────────

const CURRENCY: Record<string, string> = { EBAY_US: "USD", EBAY_AU: "AUD", EBAY_GB: "GBP", EBAY_CA: "CAD", EBAY_DE: "EUR" };

/** A realistic ItemSummary. `price` is in the marketplace's currency. */
export function summary(id: string, title: string, price: number, marketplace = "EBAY_US", extra: Record<string, unknown> = {}) {
  // eBay item pages are /itm/<digits>: a fixture id like "a0" gets a numeric page id (the importer refuses any other path).
  const page = /^\d{1,15}$/.test(id) ? id : String([...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 1_000_000_007, 7));
  return {
    itemId: `v1|${id}|0`,
    title,
    image: { imageUrl: `https://i.ebayimg.com/images/g/img${id}/s-l225.jpg` },
    price: { value: price.toFixed(2), currency: CURRENCY[marketplace] },
    itemWebUrl: `https://www.ebay.com/itm/${page}`,
    itemAffiliateWebUrl: `https://www.ebay.com/itm/${page}?mkevt=1&mkcid=1&mkrid=711-53200-19255-0&campid=5339155912&customid=dex-listings&toolid=10001`,
    condition: "Brand New",
    buyingOptions: ["FIXED_PRICE"],
    shippingOptions: [{ shippingCostType: "FIXED", shippingCost: { value: "0.00", currency: CURRENCY[marketplace] } }],
    ...extra,
  };
}

/** The affiliateReferenceId a search asked for (X-EBAY-C-ENDUSERCTX), which a real eBay copies into each item's customid. */
export function requestedReference(init: RequestInit | undefined): string | null {
  const hd = (init?.headers ?? {}) as Record<string, string>;
  return /affiliateReferenceId=([^,]+)/.exec(hd["X-EBAY-C-ENDUSERCTX"] ?? "")?.[1] ?? null;
}

/** Items as eBay would return them for a search that asked for `ref`: the affiliate URL's customid is that reference. */
export function withReference<T extends { itemAffiliateWebUrl?: string }>(items: T[], ref: string | null): T[] {
  return ref ? items.map((it) => ({ ...it, itemAffiliateWebUrl: it.itemAffiliateWebUrl?.replace(/customid=[^&]*/, `customid=${ref}`) })) : items;
}

// ─── product rows for the planner ───────────────────────────────────────────────

const SETS_FOR_KEY: Record<string, string> = { "booster-box": "Surging Sparks Booster Box", etb: "Surging Sparks Elite Trainer Box" };

let seq = 0;
/** A PlanRow for a product of `type` priced `cents` in `market` (open unless `soldOut`). The group key is the real classifier's for `name`. */
export function planRow(type: TypeKey, market: string, cents: number, o: { name?: string; id?: string; soldOut?: boolean; productId?: string } = {}): PlanRow {
  const label = TYPE_BY_KEY.get(type)!.label;
  const name = o.name ?? SETS_FOR_KEY[type] ?? `Test ${label} ${++seq}`;
  const idn = identify(name);
  const groupKey = isIdentity(idn) ? idn.groupKey : `${type}|-|${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return {
    productId: o.productId ?? o.id ?? `p-${type}-${seq++}`,
    name,
    typeLabel: label,
    setCode: isIdentity(idn) ? idn.set?.code ?? null : null,
    groupKey,
    market,
    openCents: o.soldOut ? null : cents,
    anyCents: cents,
  };
}
