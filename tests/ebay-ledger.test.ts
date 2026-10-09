// The quota ledger (src/lib/ebay-ledger.ts): one row per quota window, an atomic claim, a frozen cap, a 429 block, and the claimer the search loop uses. The in-memory store and the Prisma
// store obey the same rule (claimAllowed); the Prisma half runs against a scratch Postgres when TEST_DATABASE_URL is set and is skipped otherwise.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLAIM_CHUNK, Claimer, RUNS_KEPT, SAMPLES_KEPT, addBreakdown, appendCapped, claimAllowed, memoryLedger, prismaLedger, windowKeyOf, type LedgerStore, type RunRecord,
} from "../src/lib/ebay-ledger";
import { hasTestDb, testDb } from "./helpers/pg";

const T0 = new Date("2026-10-08T23:37:00Z");

test("the window key is the UTC date the quota window STARTED", () => {
  assert.equal(windowKeyOf(new Date("2026-10-09T07:00:00Z"), 86_400), "2026-10-08");
  assert.equal(windowKeyOf(new Date("2026-11-01T08:00:00Z"), 86_400), "2026-10-31", "the reset moves to 08:00Z in winter; the key follows the window, not the clock");
  assert.equal(windowKeyOf(new Date("2026-10-09T07:00:00Z"), 0), "2026-10-08", "an unreadable window length is a whole day");
});

test("a claim needs room under the frozen cap and an unblocked window", () => {
  const row = { cap: 1000, claimed: 970, blockedUntil: null };
  assert.equal(claimAllowed(row, 25, T0), true);
  assert.equal(claimAllowed(row, 30, T0), true);
  assert.equal(claimAllowed(row, 31, T0), false);
  assert.equal(claimAllowed(row, 0, T0), false);
  assert.equal(claimAllowed({ ...row, blockedUntil: new Date(T0.getTime() + 1) }, 1, T0), false);
  assert.equal(claimAllowed({ ...row, blockedUntil: T0 }, 1, T0), true, "a block that has just expired no longer blocks");
});

test("small helpers: capped lists and the breakdown", () => {
  assert.deepEqual(appendCapped([1, 2, 3], 4, 3), [2, 3, 4]);
  assert.deepEqual(appendCapped(null, 1, 3), [1]);
  assert.deepEqual(addBreakdown({ A: 10 }, { A: 5, banner: 2 }), { A: 15, banner: 2 });
  assert.deepEqual(addBreakdown(null, {}), {});
});

async function suite(name: string, make: () => Promise<{ store: LedgerStore; done?: () => Promise<void> } | null>) {
  test(`${name}: the cap is frozen when the window opens, whatever a later run configures`, async (t) => {
    const m = await make();
    if (!m) return t.skip("TEST_DATABASE_URL is not set");
    const { store, done } = m;
    const a = await store.open("2026-10-08", 1000, { limit: 5000, resetAt: new Date("2026-10-09T07:00:00Z") });
    assert.equal(a.cap, 1000);
    const b = await store.open("2026-10-08", 400, { limit: 5000, resetAt: new Date("2026-10-09T07:00:00Z") });
    assert.equal(b.cap, 1000, "the second open keeps the first cap");
    await done?.();
  });
  test(`${name}: claims add up to the cap and not one call past it`, async (t) => {
    const m = await make();
    if (!m) return t.skip("TEST_DATABASE_URL is not set");
    const { store, done } = m;
    await store.open("w", 100, { limit: 5000, resetAt: null });
    assert.equal(await store.claim("w", 25, T0), 75);
    assert.equal(await store.claim("w", 25, T0), 50);
    assert.equal(await store.claim("w", 50, T0), 0, "exactly the cap is allowed");
    assert.equal(await store.claim("w", 1, T0), null, "one more is refused");
    await store.settle("w", 60, 40, { A: 60 });
    const row = (await store.read("w"))!;
    assert.deepEqual([row.claimed, row.spent, row.breakdown], [60, 60, { A: 60 }]);
    assert.equal(await store.claim("w", 40, T0), 0, "what a run did not use is given back");
    await done?.();
  });
  test(`${name}: a concurrent burst of claims can never exceed the cap`, async (t) => {
    const m = await make();
    if (!m) return t.skip("TEST_DATABASE_URL is not set");
    const { store, done } = m;
    await store.open("w", 100, { limit: 5000, resetAt: null });
    const got = await Promise.all(Array.from({ length: 12 }, () => store.claim("w", 25, T0)));
    assert.equal(got.filter((x) => x != null).length, 4, "4 x 25 = 100; the other 8 are refused");
    assert.equal((await store.read("w"))!.claimed, 100);
    await done?.();
  });
  test(`${name}: a 429 blocks the window until it resets; the next window is free`, async (t) => {
    const m = await make();
    if (!m) return t.skip("TEST_DATABASE_URL is not set");
    const { store, done } = m;
    await store.open("w1", 100, { limit: 5000, resetAt: null });
    await store.block("w1", new Date(T0.getTime() + 3_600_000));
    assert.equal(await store.claim("w1", 1, T0), null);
    assert.equal(await store.claim("w1", 1, new Date(T0.getTime() + 3_600_001)), 99);
    await store.open("w2", 100, { limit: 5000, resetAt: null });
    assert.equal(await store.claim("w2", 25, T0), 75);
    await done?.();
  });
  test(`${name}: samples and runs are capped, the config is the last run's`, async (t) => {
    const m = await make();
    if (!m) return t.skip("TEST_DATABASE_URL is not set");
    const { store, done } = m;
    await store.open("w", 100, { limit: 5000, resetAt: null });
    for (let i = 0; i < SAMPLES_KEPT + 6; i++) await store.sample("w", { t: new Date(T0.getTime() + i * 1000).toISOString(), remaining: 3000 - i });
    const run = (i: number): RunRecord => ({ at: `r${i}`, mode: "shared", purpose: "main", claimed: i, spent: i, remainingStart: 3000, remainingEnd: 2900, foreignDelta: 0, stop: null });
    for (let i = 0; i < RUNS_KEPT + 3; i++) await store.record("w", run(i), { dailyBudget: 1000, i });
    const row = (await store.read("w"))!;
    assert.equal(row.samples.length, SAMPLES_KEPT);
    assert.equal(row.samples.at(-1)!.remaining, 3000 - (SAMPLES_KEPT + 5));
    assert.equal(row.runs.length, RUNS_KEPT);
    assert.equal(row.runs.at(-1)!.at, `r${RUNS_KEPT + 2}`);
    assert.deepEqual(row.config, { dailyBudget: 1000, i: RUNS_KEPT + 2 });
    await done?.();
  });
  test(`${name}: the claimer takes chunks of 25, never above the ceiling, and gives back the unused rest`, async (t) => {
    const m = await make();
    if (!m) return t.skip("TEST_DATABASE_URL is not set");
    const { store, done } = m;
    await store.open("w", 100, { limit: 5000, resetAt: null });
    const c = new Claimer(store, "w", () => T0);
    let n = 0;
    while (await c.next(60)) n++;
    assert.equal(n, 60, "a ceiling of 60 calls");
    assert.equal(c.used, 60);
    assert.equal(c.unused, 0, "25 + 25 + 10: the last chunk is cut to the ceiling, so a run never claims past what it may spend");
    assert.equal((await store.read("w"))!.claimed, 60);
    await c.settle({ A: 40, banner: 20 });
    const row = (await store.read("w"))!;
    assert.deepEqual([row.claimed, row.spent, row.breakdown], [60, 60, { A: 40, banner: 20 }]);
    // a run that stops early gives back the claimed rest
    const d = new Claimer(store, "w", () => T0);
    for (let i = 0; i < 20; i++) assert.equal(await d.next(500), true);
    assert.equal(d.unused, 5, "one chunk of 25 was claimed for 20 calls");
    assert.equal((await store.read("w"))!.claimed, 85);
    await d.settle({ B: 20 });
    assert.deepEqual([(await store.read("w"))!.claimed, (await store.read("w"))!.spent], [80, 80]);
    await done?.();
  });
  test(`${name}: a claimer stops when the ledger refuses, with the reason`, async (t) => {
    const m = await make();
    if (!m) return t.skip("TEST_DATABASE_URL is not set");
    const { store, done } = m;
    await store.open("w", 30, { limit: 5000, resetAt: null });
    const c = new Claimer(store, "w", () => T0);
    let n = 0;
    while (await c.next(500)) n++;
    assert.equal(n, 25, "the first chunk fits, the second (25 more over a cap of 30) does not");
    assert.equal(c.stop, "cap");
    await done?.();
  });
}

void suite("memory", async () => ({ store: memoryLedger() }));
void suite("postgres", async () => {
  const db = await testDb();
  if (!db) return null;
  await db.ebayLedger.deleteMany({});
  return { store: prismaLedger(db), done: async () => void (await db.$disconnect()) };
});

test("the Prisma half is exercised whenever a scratch database is configured", { skip: !hasTestDb() && "TEST_DATABASE_URL is not set" }, () => {
  assert.equal(hasTestDb(), true);
});

test("the chunk is 25 (a killed run strands at most 24 calls of the day)", () => {
  assert.equal(CLAIM_CHUNK, 25);
});
