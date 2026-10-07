// Stubs for the deck price watch run (lib/deck-watch.ts) — OP Compare's
// version of RiftCompare's tests/helpers/watch-harness.ts. Not a test file.
import { indexCards } from "../../src/lib/deck";
import { runDeckWatches, type DeckSource, type DeckWatchCard, type DeckWatchDb, type DeckWatchItem } from "../../src/lib/deck-watch";
import type { BasketListingTuple } from "../../src/lib/data";
import type { EntitlementFields } from "../../src/lib/premium";

export const NOW = new Date("2026-10-03T12:00:00Z");
export const DAY = 86_400_000;
const future = new Date(NOW.getTime() + 30 * DAY);
export type User = EntitlementFields;
export const premium: User = { isAdmin: false, premiumUntil: future, premiumTier: "premium" };
export const plus: User = { isAdmin: false, premiumUntil: future, premiumTier: "plus" };
export const lapsed: User = { isAdmin: false, premiumUntil: new Date(NOW.getTime() - DAY), premiumTier: "premium" };
export const free: User = { isAdmin: false, premiumUntil: null, premiumTier: "premium" };

// Two cards: Alpha (OP01-016, id 101) and Beta (OP01-024, id 102).
export const CARDS: DeckWatchCard[] = [
  { id: 101, slug: "alpha-op01-016", name: "Alpha", number: "OP01-016", printing: "standard", variant: null, cardType: "Character", setCode: "OP01" },
  { id: 102, slug: "beta-op01-024", name: "Beta", number: "OP01-024", printing: "standard", variant: null, cardType: "Character", setCode: "OP01" },
];

export interface StoreRow {
  cardId: number;
  source: string; // "store:<key>" or "tcgplayer"
  priceCents: number;
  condition?: string | null;
}

/** A DeckSource over fixture cards and listing rows; counts the listing reads. */
export function fixtureSource(rows: StoreRow[], cards: DeckWatchCard[] = CARDS, opts: { fail?: boolean } = {}): DeckSource & { reads: number[][] } {
  const reads: number[][] = [];
  return {
    reads,
    index: async () => indexCards(cards),
    listings: async (_country, ids) => {
      reads.push(ids);
      if (opts.fail) throw new Error("listing read failed");
      return rows
        .filter((r) => ids.includes(r.cardId))
        .map((r): BasketListingTuple => [r.cardId, r.source, r.priceCents, r.condition ?? null, `https://x.example/${r.cardId}`]);
    },
  };
}

export interface DeckRow {
  id: string;
  userId: string;
  market: string;
  name: string;
  listText: string;
  region: string | null;
  trackedOnly: boolean | null;
  minCondition: string | null;
  targetCents: number | null;
  lastTotalCents: number | null;
  lastEmailedCents: number | null;
  lastNotifiedAt: Date | null;
  lastFlaggedAt: Date | null;
  snoozedUntil: Date | null;
  createdAt: Date;
  user: User & { email: string };
}

export function deckRow(id: string, user: User, over: Partial<DeckRow> = {}): DeckRow {
  return {
    id,
    userId: over.userId ?? `u-${id}`,
    market: "US",
    name: `Deck ${id}`,
    listText: "3xOP01-016\n1xOP01-024",
    region: null,
    trackedOnly: null,
    minCondition: null,
    targetCents: null,
    lastTotalCents: null,
    lastEmailedCents: null,
    lastNotifiedAt: null,
    lastFlaggedAt: null,
    snoozedUntil: null,
    createdAt: new Date(NOW.getTime() - 30 * DAY),
    ...over,
    user: { ...user, email: over.user?.email ?? `${id}@example.com` },
  };
}

/** A run over fixture rows: what was written, notified and sent. */
export function deckHarness(rows: DeckRow[], listings: StoreRow[], opts: { emailEnabled?: boolean; sendOk?: boolean; notifyFails?: boolean; now?: Date } = {}) {
  const writes: { id: string; data: Record<string, unknown> }[] = [];
  const notified: { userId: string; type: string; title: string; href: string | null }[] = [];
  const sent: { to: string; item: DeckWatchItem }[] = [];
  const db = {
    deckWatch: {
      findMany: async () => rows,
      update: (args: { where: { id: string }; data: Record<string, unknown> }) => {
        writes.push({ id: args.where.id, data: args.data });
        return args;
      },
    },
    $transaction: async (ops: unknown[]) => ops,
  } as unknown as DeckWatchDb;
  const source = fixtureSource(listings);
  return {
    writes,
    notified,
    sent,
    source,
    writeFor: (id: string) => writes.find((w) => w.id === id)?.data,
    run: () =>
      runDeckWatches({
        db,
        source,
        now: opts.now ?? NOW,
        emailEnabled: opts.emailEnabled ?? false,
        notify: async (userId, type, title, _body, href) => {
          if (opts.notifyFails) throw new Error("notify failed");
          notified.push({ userId, type, title, href });
        },
        send: async (to, item) => {
          sent.push({ to, item });
          return opts.sendOk ?? true;
        },
      }),
  };
}
