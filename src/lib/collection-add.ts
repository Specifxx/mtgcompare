// Type-only: the pure addCopies below loads (and is tested) without a database client.
import type { prisma } from "./db";
import { costAfterAdd, QUANTITY_CAP, type CostAdd } from "./collection-cost";

/**
 * Adding copies to a collection row without losing any of them.
 *
 * Both add paths (POST /api/collection and the paste import) have to read the
 * row before writing it: a row that records a TOTAL rescales with its count
 * (lib/collection-cost.ts, costAfterAdd), and the 999 cap is a property of the
 * row. A read followed by an absolute write (`quantity: existing.quantity + n`)
 * is a lost update: two adds that overlap (a second tab, QuickView's "+1" next
 * to My Collection, a POST landing mid-import) both read N and both write N+1.
 * Flagged in review, 2026-09-25; the routes used to write a plain
 * `{ increment }` and had never lost a copy.
 *
 * So every write here is ONE guarded UPDATE that increments the count and only
 * lands if the row is still the one the cost was computed from:
 *
 *   • the cost does not depend on the count (a per-copy price, no cost at all,
 *     or an add that leaves them as they are — every UI add): the guard is the
 *     cost columns plus `quantity <= 999 - added`, so concurrent adds of such
 *     rows never conflict and simply both increment;
 *   • the cost does depend on it (a total being rescaled, or a price sent with
 *     the add): the guard also pins the exact quantity it was derived from.
 *
 * A guard that misses (someone else wrote first, or the row was deleted) means
 * re-read and recompute. No interactive transaction and no row lock: the
 * common path is the same two statements it always was (one narrow read, one
 * write), and nothing holds a pooled Neon connection open between them.
 */

/** A row's count and cost columns — what an add is computed from. */
export interface StoredRow {
  quantity: number;
  costBasisCents: number | null;
  costBasisIsTotal: boolean;
}

/** What a write requires of the row it lands on. */
export interface RowGuard {
  /** The exact count the cost was derived from, or a ceiling that keeps the row within the cap. */
  quantity: number | { lte: number };
  costBasisCents: number | null;
  costBasisIsTotal: boolean;
}

export interface AddCopiesStore {
  /** The row as it is now, or null when there is none. */
  read(): Promise<StoredRow | null>;
  /** Insert the row. Resolves false when it already exists (another request created it first). */
  create(row: StoredRow): Promise<boolean>;
  /**
   * One UPDATE … WHERE <guard>: `quantity += increment`, plus the cost columns
   * when `cost` is given. Resolves whether a row matched.
   */
  update(guard: RowGuard, increment: number, cost: Pick<StoredRow, "costBasisCents" | "costBasisIsTotal"> | null): Promise<boolean>;
}

export type AddCopiesResult =
  /** `added` copies landed (fewer than asked when the row reached the cap). */
  | { status: "added"; added: number }
  /** The row already holds QUANTITY_CAP copies; nothing was written. */
  | { status: "full"; quantity: number }
  /** Every attempt lost a race. Nothing was written; the caller can ask for a retry. */
  | { status: "busy" };

const ATTEMPTS = 4;

/**
 * Add `add.quantity` copies (and optionally what they cost) to one row.
 * `existing`, when given, is a read the caller already made (the import reads
 * every row it lands on in one query) and saves the first read here.
 */
export async function addCopies(
  store: AddCopiesStore,
  add: CostAdd,
  opts: { existing?: StoredRow | null; attempts?: number } = {},
): Promise<AddCopiesResult> {
  const attempts = opts.attempts ?? ATTEMPTS;
  let existing = opts.existing !== undefined ? opts.existing : await store.read();
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) existing = await store.read();

    if (!existing) {
      const quantity = Math.min(QUANTITY_CAP, add.quantity);
      if (await store.create({ quantity, ...costAfterAdd(null, { ...add, quantity }) })) {
        return { status: "added", added: quantity };
      }
      continue; // created by a concurrent request: add onto that row instead
    }

    const added = Math.max(0, Math.min(add.quantity, QUANTITY_CAP - existing.quantity));
    if (added === 0) return { status: "full", quantity: existing.quantity };

    const cost = costAfterAdd(existing, { ...add, quantity: added });
    const costChanges = cost.costBasisCents !== existing.costBasisCents || cost.costBasisIsTotal !== existing.costBasisIsTotal;
    // A total's rescale rounds against the count even when it happens to come
    // out unchanged, so a total pins the count too.
    const dependsOnCount = costChanges || (existing.costBasisIsTotal && existing.costBasisCents != null);
    const guard: RowGuard = {
      quantity: dependsOnCount ? existing.quantity : { lte: QUANTITY_CAP - added },
      costBasisCents: existing.costBasisCents,
      costBasisIsTotal: existing.costBasisIsTotal,
    };
    if (await store.update(guard, added, costChanges ? cost : null)) return { status: "added", added };
  }
  return { status: "busy" };
}

/** The (user, card, condition, foil) unique key a collection row lives at. */
export interface CollectionRowKey {
  userId: string;
  cardId: number;
  condition: string;
  isFoil: boolean;
}

/**
 * The Prisma-backed store for one row. `note`, when given, is written with the add. `setId` is the set of the card
 * in the published data at the time of the write (the per-set views filter on the column; there is no foreign key).
 */
export function collectionRowStore(db: typeof prisma, key: CollectionRowKey, note?: string | null, setId?: number | null): AddCopiesStore {
  return {
    read: () =>
      db.collectionCard.findUnique({
        where: { userId_cardId_condition_isFoil: key },
        select: { quantity: true, costBasisCents: true, costBasisIsTotal: true },
      }),
    // ON CONFLICT DO NOTHING rather than catching P2002: losing the race to
    // create the row is an expected outcome here, not an error to log.
    async create(row) {
      const { count } = await db.collectionCard.createMany({
        data: [{ ...key, ...row, note: note ?? null, setId: setId ?? null }],
        skipDuplicates: true,
      });
      return count > 0;
    },
    async update(guard, increment, cost) {
      const { count } = await db.collectionCard.updateMany({
        where: { ...key, ...guard },
        data: { quantity: { increment }, ...(cost ?? {}), ...(note ? { note } : {}), ...(setId != null ? { setId } : {}) },
      });
      return count > 0;
    },
  };
}
