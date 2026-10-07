// Race-safe sequential numbers for anything that needs a human-facing identifier
// (support tickets; RiftCompare's order-number.ts). Backed by the `Counter` table
// rather than a Postgres SEQUENCE, because this repo pushes schema additively via
// `prisma db push` with no raw-DDL migration channel. Each key's row is seeded
// lazily by `upsert`, then incremented by ONE atomic `UPDATE ... RETURNING`, so
// two concurrent requests can never be handed the same number.
import { prisma } from "./db";

/** Starting values leave headroom below the first real number. */
export const SEED: Record<string, number> = {
  support: 10_000,
};

// A structural type covering just what nextNumber calls: lib/db.ts's `prisma` is a
// `$extends()`-wrapped client whose real type does not match the plain generated
// types inside a `$transaction` callback; both satisfy this shape.
export type CounterClient = {
  counter: {
    upsert(args: { where: { key: string }; create: { key: string; value: number }; update: Record<string, never> }): Promise<unknown>;
  };
  $queryRaw<T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};

/** The NEXT value for `key` (already incremented). Pass the transaction client to commit it with the write. */
export async function nextNumber(key: keyof typeof SEED, client: CounterClient = prisma as unknown as CounterClient): Promise<number> {
  await client.counter.upsert({ where: { key }, create: { key, value: SEED[key] }, update: {} });
  const rows = await client.$queryRaw<{ value: number }[]>`UPDATE "Counter" SET value = value + 1 WHERE key = ${key} RETURNING value`;
  return rows[0]!.value;
}

/** "OC-10001": the prefix lives in one place. */
export function formatTicketNumber(n: number | null | undefined): string | null {
  return n == null ? null : `OC-${n}`;
}
