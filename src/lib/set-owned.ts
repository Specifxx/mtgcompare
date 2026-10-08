// WHAT ONE ACCOUNT OWNS OF A SET.
//
// The user-scoped, UNCACHED half of the set tracker: lib/data/sets.ts
// getSetChecklist holds the published checklist every reader shares; this is
// the one narrow read of the caller's own rows, made per request by GET
// /api/collection/owned (the overlay on a public /sets/[slug] page) and by the
// /portfolio/sets pages (CLAUDE.md, the accounts exception).
//
// ONE groupBy in Postgres, not a row pull: a collection row is per (card,
// condition, foil), and the tracker only wants "how many copies of this card",
// whatever the finish and the condition (a Foil copy fills the slot too).
// The result is one {cardId, quantity} per OWNED card, capped (OWNED_TAKE),
// scoped by userId first (the (userId) index), so it can never return another
// account's rows and its size follows the set, not the account. 
import type { OwnedMap } from "./set-scope";

/** Rows one whole-binder read may return: the binder holds at most 2,000 rows (collection-server COLLECTION_TAKE), so a distinct (set, card) list is never longer. */
export const OWNED_ALL_TAKE = 2000;

/** Distinct owned cards returned for ONE set. A set is a few hundred; this is a backstop. */
export const OWNED_TAKE = 1500;

/**
 * The cap for a read across several sets: one set's backstop for each listed
 * set's card count, so the index is not cut at 1,500 cards shared between them.
 */
export function ownedTakeFor(cardCounts: readonly number[]): number {
  return Math.max(OWNED_TAKE, cardCounts.reduce((n, c) => n + Math.max(0, c), 0));
}

type Grouped = { cardId: number; _sum: { quantity: number | null } };
export type OwnedDb = {
  collectionCard: {
    groupBy: (args: {
      by: ["cardId"];
      where: { userId: string; setId: number | { in: number[] } };
      _sum: { quantity: true };
      orderBy: { cardId: "asc" };
      take: number;
    }) => PromiseLike<Grouped[]>;
  };
};

/** {cardId: copies} for the account's cards in one set (or several sets, for the index). */
export async function ownedBySet(db: OwnedDb, userId: string, setIds: number | number[], take: number = OWNED_TAKE): Promise<OwnedMap> {
  const rows = await db.collectionCard.groupBy({
    by: ["cardId"],
    where: { userId, setId: Array.isArray(setIds) ? { in: setIds } : setIds },
    _sum: { quantity: true },
    orderBy: { cardId: "asc" },
    take,
  });
  const out: Record<string, number> = {};
  for (const r of rows) {
    const q = r._sum.quantity ?? 0;
    if (q > 0) out[String(r.cardId)] = q;
  }
  return out;
}

type GroupedBySet = { setId: number | null; cardId: number };
export type OwnedAllDb = {
  collectionCard: {
    groupBy: (args: {
      by: ["setId", "cardId"];
      where: { userId: string; setId: { not: null } };
      orderBy: [{ setId: "asc" }, { cardId: "asc" }];
      take: number;
    }) => PromiseLike<GroupedBySet[]>;
  };
};

/** Distinct owned cards across the whole binder, by set: one groupBy on (setId, cardId), scoped by userId, capped at the binder's own row cap. A card counts once whatever its finishes and conditions. */
export async function ownedCardsBySet(db: OwnedAllDb, userId: string, take: number = OWNED_ALL_TAKE): Promise<Map<number, number[]>> {
  const rows = await db.collectionCard.groupBy({ by: ["setId", "cardId"], where: { userId, setId: { not: null } }, orderBy: [{ setId: "asc" }, { cardId: "asc" }], take });
  const out = new Map<number, number[]>();
  for (const r of rows) if (r.setId != null) (out.get(r.setId) ?? out.set(r.setId, []).get(r.setId)!).push(r.cardId);
  return out;
}

/** The Prisma client as an OwnedDb (lazy, so the pure half loads without a database). */
export async function ownedDb(): Promise<OwnedDb & OwnedAllDb> {
  const { prisma } = await import("./db");
  return prisma as unknown as OwnedDb & OwnedAllDb;
}
