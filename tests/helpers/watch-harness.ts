// A stub of everything runSealedWatches() touches, for the sealed watch tests
// (RiftCompare's helper, rebuilt for MTG Compare: SealedWatch rows, sealed offers
// keyed by (productId, market), integer Sealed ids, the catalogue stood in for). Not a test file itself.
import { runSealedWatches, type SealedWatchDb, type SealedWatchRunDeps } from "../../src/lib/sealed-watch-run";
import type { SealedWatchItem } from "../../src/lib/watch-emails";
import { NOW, daysAgo, hoursAgo, free, lapsed, plus, premium, type User } from "./alert-harness";

export { NOW, daysAgo, hoursAgo, free, lapsed, plus, premium };

export interface OfferRow {
  productId: number;
  market: string;
  source: string;
  priceCents: number;
  url: string;
  inStock: boolean;
  updatedAt: Date;
}

/** A real-store Offer row for a sealed product, fresh and in stock unless told otherwise. */
export function offer(priceCents: number, over: Partial<OfferRow> = {}): OfferRow {
  return { productId: 5001, market: "US", source: "store:shopx", priceCents, url: "https://shopx.example/box", inStock: true, updatedAt: hoursAgo(2), ...over };
}

export interface SealedRowT {
  id: string;
  userId: string;
  email: string;
  market: string;
  sealedId: number;
  targetCents: number | null;
  lastPriceCents: number | null;
  lastInStock: boolean | null;
  soldOutAt: Date | null;
  lastEmailedCents: number | null;
  lastNotifiedAt: Date | null;
  lastFlaggedAt: Date | null;
  lastAtRrp: boolean | null;
  snoozedUntil: Date | null;
  createdAt: Date;
  user: User & { email: string };
  sealed: { id: number; slug: string; name: string; kind: string; releasedOn: Date | null; set: { code: string } | null };
}

export function sealedRow(id: string, user: User, over: Partial<Omit<SealedRowT, "user">> & { productId?: number; releasedOn?: Date | null } = {}): SealedRowT {
  const { productId = 5001, releasedOn = new Date("2025-01-01T00:00:00Z"), ...rest } = over;
  return {
    id,
    userId: `u-${id}`,
    email: `${id}@example.com`,
    market: "US",
    sealedId: productId,
    targetCents: null,
    lastPriceCents: null,
    lastInStock: null,
    soldOutAt: null,
    lastEmailedCents: null,
    lastNotifiedAt: null,
    lastFlaggedAt: null,
    lastAtRrp: null,
    snoozedUntil: null,
    createdAt: daysAgo(10),
    user: { ...user, email: user.email ?? `${id}@example.com` },
    sealed: { id: productId, slug: `box-${productId}`, name: "Modern Horizons 3 Play Booster Box", kind: "booster-box", releasedOn, set: { code: "MH3" } },
    ...rest,
  };
}

export interface SealedHarnessOpts {
  offers?: OfferRow[];
  sendOk?: boolean | ((to: string) => boolean);
  now?: Date;
  emailEnabled?: boolean;
  notifyUsers?: boolean;
  mutes?: string[];
  recent?: string[]; // addresses already emailed in the budget window
  dailyBudget?: number;
  sendCap?: number;
  readFails?: boolean;
  notifyFails?: boolean;
}

export function sealedHarness(rows: SealedRowT[], opts: SealedHarnessOpts = {}) {
  const now = opts.now ?? NOW;
  const sent: { to: string; item: SealedWatchItem }[] = [];
  const notified: { userId: string; type: string; title: string; href?: string | null }[] = [];
  const writes: { id: string; data: Record<string, unknown> }[] = [];
  const offerQueries: Record<string, unknown>[] = [];
  const offers = opts.offers ?? [];
  const db = {
    sealedWatch: {
      findMany: async () => rows,
      groupBy: async () => [] as { email: string }[],
      update: (args: { where: { id: string }; data: Record<string, unknown> }) => {
        writes.push({ id: args.where.id, data: args.data });
        return args;
      },
    },
    priceAlert: { groupBy: async () => (opts.recent ?? []).map((email) => ({ email })) },
    deckWatch: { findMany: async () => [] as { user: { email: string } }[] },
    alertMute: { findMany: async (a: { where: { email: { in: string[] } } }) => (opts.mutes ?? []).filter((e) => a.where.email.in.includes(e)).map((email) => ({ email })) },
    // The published sealed detail files, stood in for (REQ-WP09-2): the watched product's offers, store rows and the TCGplayer row alike.
    sealedOffers: async (sealedId: number) => {
      offerQueries.push({ sealedId });
      if (opts.readFails) throw new Error("data host down");
      return offers.filter((o) => o.productId === sealedId).map((o) => ({ source: o.source, market: o.market, priceCents: o.priceCents, url: o.url, inStock: o.inStock, updatedAt: o.updatedAt.toISOString() }));
    },
    $transaction: async (ops: unknown[]) => ops,
  };
  const emailEnabled = opts.emailEnabled ?? true;
  const deps: SealedWatchRunDeps = {
    db: db as unknown as SealedWatchDb,
    sealedInfo: async (ids) => new Map(rows.filter((r) => ids.includes(r.sealedId)).map((r) => [r.sealedId, { slug: r.sealed.slug, name: r.sealed.name, kind: r.sealed.kind as never, releasedOn: r.sealed.releasedOn, setCode: r.sealed.set?.code ?? null }] as const)),
    now,
    emailEnabled,
    notifyUsers: opts.notifyUsers ?? !emailEnabled,
    dailyBudget: opts.dailyBudget ?? 50,
    sendCap: opts.sendCap,
    sendSealedWatchEmail: async (to, item) => {
      sent.push({ to, item });
      const ok = opts.sendOk ?? true;
      return typeof ok === "function" ? ok(to) : ok;
    },
    notify: async (userId, type, title, _body, href) => {
      if (opts.notifyFails) throw new Error("notifications down");
      notified.push({ userId, type, title, href });
    },
  };
  return {
    sent,
    notified,
    writes,
    offerQueries,
    writeFor: (id: string) => writes.find((w) => w.id === id)?.data,
    run: () => runSealedWatches(deps),
  };
}
