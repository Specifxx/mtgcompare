import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { investedCents, unitCostCents, costAfterQuantityChange, costAfterAdd, QUANTITY_CAP } from "../src/lib/collection-cost";
import { addCopies, type AddCopiesStore, type RowGuard, type StoredRow } from "../src/lib/collection-add";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const readCode = (p: string) =>
  read(p).replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");

// ─────────────────────────────────────────────────────────────────────────────
// The cost-basis arithmetic and the source-reading checks (the routes' logic
// lives in src/lib/collection-server.ts).
//
// Reported 2026-09-10 through a sister site's /portfolio feedback form:
//
//   "Added $770 paid to a card - pulled one, paid for the other… Same issue
//    with another where I paid 20 each for two and 25 for the third"
//
// A CollectionCard is unique per (user, card, condition, foil), so every copy of
// one card in one condition shared ONE cost figure, and that figure could only
// mean "per copy". $770 against two copies was therefore read as $770 EACH and
// the portfolio reported $1,540 invested; three copies bought at 20/20/25 had no
// single per-copy number to type at all. Both produced a profit-and-loss figure
// the owner could see was wrong.
//
// A row now says what its number MEANS. The total is the average cost basis,
// which is what an unrealised P&L is computed from.
// ─────────────────────────────────────────────────────────────────────────────

const row = (quantity: number, costBasisCents: number | null, costBasisIsTotal = false) =>
  ({ quantity, costBasisCents, costBasisIsTotal });

test("the reported cases produce the right invested figure", () => {
  // Two copies, $770 paid for the pair (the other was pulled).
  assert.equal(investedCents(row(2, 77_000, true)), 77_000);
  // …which is exactly what the old per-unit-only reading got wrong.
  assert.equal(investedCents(row(2, 77_000, false)), 154_000);
  // Three copies, 20 + 20 + 25 = 65.
  assert.equal(investedCents(row(3, 6_500, true)), 6_500);
});

test("per-copy stays per-copy — no existing row changes meaning", () => {
  // Every row that predates the flag defaults to false and must keep behaving
  // exactly as it did, or every user's recorded P&L silently moves.
  assert.equal(investedCents(row(4, 250)), 1_000);
  assert.equal(investedCents({ quantity: 4, costBasisCents: 250 }), 1_000);
  assert.equal(investedCents({ quantity: 4, costBasisCents: 250, costBasisIsTotal: null }), 1_000);
});

test("no recorded cost stays null — never zero", () => {
  // A missing cost is not a cost of zero. Treating it as one would report a
  // 100% profit on every holding the owner never priced.
  assert.equal(investedCents(row(3, null)), null);
  assert.equal(investedCents(row(3, null, true)), null);
  assert.equal(unitCostCents(row(3, null, true)), null);
  // Zero, by contrast, is a real answer — a card that was pulled, not bought.
  assert.equal(investedCents(row(3, 0, true)), 0);
});

test("unitCostCents averages a total across the row", () => {
  assert.equal(unitCostCents(row(2, 77_000, true)), 38_500);
  // 65 across three copies is 21.67 — the third cent belongs to no copy.
  assert.equal(unitCostCents(row(3, 6_500, true)), 2_167);
  // Per-copy rows report their own figure untouched, never a re-derived one.
  assert.equal(unitCostCents(row(3, 2_000)), 2_000);
  // A zero quantity must not divide by zero.
  assert.equal(unitCostCents(row(0, 6_500, true)), null);
});

test("changing the quantity rescales a total but never a per-copy price", () => {
  // One copy still cost what it cost.
  assert.equal(costAfterQuantityChange(row(2, 2_000), 5), 2_000);
  // A total is an outlay for a specific count — hold it fixed while copies are
  // added and the portfolio claims the same money bought twice the cards.
  assert.equal(costAfterQuantityChange(row(2, 4_000, true), 4), 8_000);
  assert.equal(costAfterQuantityChange(row(4, 8_000, true), 2), 4_000);
  // Nothing recorded stays nothing recorded.
  assert.equal(costAfterQuantityChange(row(2, null, true), 4), null);
});

test("nothing multiplies cost by quantity outside collection-cost.ts", () => {
  // The multiply is the step that goes wrong — one definition, imported everywhere.
  for (const file of ["src/lib/collection-server.ts", "src/lib/collection-share.ts", "src/app/api/collection/route.ts", "src/app/api/collection/[id]/route.ts"]) {
    const src = readCode(file);
    assert.ok(
      !/costBasisCents[^\n]*\*\s*\w*[Qq]uantity|[Qq]uantity\s*\*\s*[^\n]*costBasisCents/.test(src),
      `${file} must call investedCents(), not multiply costBasisCents by quantity itself`,
    );
  }
});

test("the portfolio sums what was PAID, not a re-derived per-unit product", () => {
  const src = readCode("src/lib/collection-server.ts");
  assert.match(src, /import \{ costAfterQuantityChange, investedCents, QUANTITY_CAP, unitCostCents \} from "\.\/collection-cost"/);
  assert.match(
    src,
    /costed\.reduce\(\(s, h\) => s \+ \(h\.investedCents \?\? 0\), 0\)/,
    "the P&L total must sum holdings' investedCents",
  );
  assert.match(src, /holdings\.some\(\(h\) => h\.investedCents != null\)/);
});

// ── Adding copies (2026-09-25) ───────────────────────────────────────────────
// Every "add to my cards" path (QuickView, My Collection's search, the welcome
// checklist, the paste import) sends no cost and used to bump the quantity with
// the cost untouched. For a row that records a TOTAL, that made the new copies
// free and the P&L reported a gain nobody made. PATCH already rescaled; the add
// paths now go through costAfterAdd and agree with it. Behavioural, replacing a
// regex that pinned `(priorPaid ?? 0) + d.costBasisCents!`, which itself turned
// an unknown earlier cost into a cost of zero.

test("adding copies with no cost rescales a total — the new copies are not free", () => {
  // Two copies for $40 total; add one with no price → $60 for three (the average).
  assert.deepEqual(costAfterAdd(row(2, 4_000, true), { quantity: 1 }), { costBasisCents: 6_000, costBasisIsTotal: true });
  // It is exactly what PATCH does when the quantity is edited in place.
  assert.equal(costAfterAdd(row(2, 4_000, true), { quantity: 2 }).costBasisCents, costAfterQuantityChange(row(2, 4_000, true), 4));
  // A per-copy price is unchanged: one copy still cost what it cost.
  assert.deepEqual(costAfterAdd(row(2, 2_000), { quantity: 3 }), { costBasisCents: 2_000, costBasisIsTotal: false });
  // And the invested figure the P&L reads grows with the copies in both cases.
  const after = { quantity: 3, ...costAfterAdd(row(2, 4_000, true), { quantity: 1 }) };
  assert.equal(investedCents(after), 6_000);
});

test("a row with no recorded cost stays unknown — never a cost of zero", () => {
  // No cost on either side.
  assert.deepEqual(costAfterAdd(row(2, null, true), { quantity: 1 }), { costBasisCents: null, costBasisIsTotal: true });
  assert.deepEqual(costAfterAdd(row(2, null), { quantity: 1 }), { costBasisCents: null, costBasisIsTotal: false });
  // A cost for the NEW copies only: the row's total is still unknown, so it
  // must not become "what the new copies cost" (the old `priorPaid ?? 0`).
  assert.equal(costAfterAdd(row(2, null, true), { quantity: 1, costBasisCents: 2_500, costBasisIsTotal: true }).costBasisCents, null);
  assert.equal(costAfterAdd(row(2, null), { quantity: 1, costBasisCents: 2_500 }).costBasisCents, null);
});

test("a total sent with the add is summed with what was already paid, never written over it", () => {
  // $40 for the first two, then a third for $25 → $65 across three.
  assert.deepEqual(
    costAfterAdd(row(2, 4_000, true), { quantity: 1, costBasisCents: 2_500, costBasisIsTotal: true }),
    { costBasisCents: 6_500, costBasisIsTotal: true },
  );
  // A per-copy row absorbing a total becomes a total of both outlays.
  assert.deepEqual(
    costAfterAdd(row(2, 2_000), { quantity: 1, costBasisCents: 2_500, costBasisIsTotal: true }),
    { costBasisCents: 6_500, costBasisIsTotal: true },
  );
  // Same per-copy price on both sides stays per-copy; a different one sums.
  assert.deepEqual(costAfterAdd(row(2, 2_000), { quantity: 1, costBasisCents: 2_000 }), { costBasisCents: 2_000, costBasisIsTotal: false });
  assert.deepEqual(costAfterAdd(row(2, 2_000), { quantity: 1, costBasisCents: 2_500 }), { costBasisCents: 6_500, costBasisIsTotal: true });
});

test("a brand-new row takes the add's own cost, or none", () => {
  assert.deepEqual(costAfterAdd(null, { quantity: 1 }), { costBasisCents: null, costBasisIsTotal: false });
  assert.deepEqual(costAfterAdd(null, { quantity: 2, costBasisCents: 5_000, costBasisIsTotal: true }), { costBasisCents: 5_000, costBasisIsTotal: true });
  assert.deepEqual(costAfterAdd(null, { quantity: 2, costBasisCents: 2_500 }), { costBasisCents: 2_500, costBasisIsTotal: false });
});

test("both add paths go through addCopies, reading the row with one narrow capped query", () => {
  const lib = readCode("src/lib/collection-server.ts");
  const post = lib.slice(lib.indexOf("export async function addToCollection"), lib.indexOf("export interface PatchBody"));
  assert.match(post, /addCopies\(store,/, "POST must add through the guarded writer");
  assert.doesNotMatch(post, /priorPaid \?\? 0/, "an unknown earlier cost is not zero");
  const imp = lib.slice(lib.indexOf("async function writeWants"), lib.indexOf("const csvData"));
  assert.match(imp, /addCopies\(collectionRowStore\(prisma, key, undefined, m\.setId\), \{ quantity: m\.qty \}, \{ existing:/, "the import must rescale too, from its batch read");
  // One read for the whole import, not one per line.
  assert.match(imp, /collectionCard\.findMany\(\{[\s\S]*?take: ids\.length \* ROWS_PER_PORTFOLIO_CARD/);
  for (const src of [post, imp]) {
    assert.doesNotMatch(src, /quantity: existing\.quantity \+/, "a read-then-absolute-write loses concurrent copies");
    assert.doesNotMatch(src, /\.upsert\(/, "the add goes through addCopies' guarded increment");
  }
  const add = readCode("src/lib/collection-add.ts");
  assert.match(add, /updateMany\(\{\s*where: \{ \.\.\.key, \.\.\.guard \},\s*data: \{ quantity: \{ increment \}/);
  assert.match(add, /createMany\(\{[\s\S]*?skipDuplicates: true/);
});

// ── Overlapping adds (review, 2026-09-25) ────────────────────────────────────
// The add paths read the row (the cost rescale and the cap need it) and then
// wrote an absolute `existing.quantity + added`. Two adds that overlap — a second
// tab, QuickView's "+1", a POST landing mid-import — both read N and both wrote
// N+1, losing a copy. addCopies writes one guarded increment instead and re-reads
// when the guard misses. This fake store is a single row with the same
// semantics as the Prisma one (UPDATE … WHERE guard; INSERT … ON CONFLICT DO
// NOTHING), and every call yields, so two adds started together really do both
// read before either writes.

function memoryRow(initial: StoredRow | null) {
  const state = { row: initial ? { ...initial } : null as StoredRow | null, writes: 0 };
  const tick = () => new Promise<void>((r) => setImmediate(r));
  const matches = (row: StoredRow, g: RowGuard) =>
    (typeof g.quantity === "number" ? row.quantity === g.quantity : row.quantity <= g.quantity.lte) &&
    row.costBasisCents === g.costBasisCents &&
    row.costBasisIsTotal === g.costBasisIsTotal;
  const store: AddCopiesStore = {
    async read() {
      await tick();
      return state.row ? { ...state.row } : null;
    },
    async create(row) {
      await tick();
      if (state.row) return false;
      state.row = { ...row };
      state.writes++;
      return true;
    },
    async update(guard, increment, cost) {
      await tick();
      if (!state.row || !matches(state.row, guard)) return false;
      state.row = { ...state.row, quantity: state.row.quantity + increment, ...(cost ?? {}) };
      state.writes++;
      return true;
    },
  };
  return { state, store };
}

test("two overlapping adds to a per-copy row both count", async () => {
  const { state, store } = memoryRow({ quantity: 1, costBasisCents: 2_000, costBasisIsTotal: false });
  const results = await Promise.all([addCopies(store, { quantity: 1 }), addCopies(store, { quantity: 1 })]);
  assert.deepEqual(results, [{ status: "added", added: 1 }, { status: "added", added: 1 }]);
  assert.equal(state.row!.quantity, 3, "the old read-then-write ended at 2");
  assert.equal(state.row!.costBasisCents, 2_000, "a per-copy price is untouched");
});

test("two overlapping adds to a TOTAL row both count and both rescale the cost", async () => {
  // Two copies for $40 total. Two concurrent no-cost adds of one copy each must
  // end at four copies and $80 (the average carried to both new copies) — not
  // three copies, and not $60 for four.
  const { state, store } = memoryRow({ quantity: 2, costBasisCents: 4_000, costBasisIsTotal: true });
  await Promise.all([addCopies(store, { quantity: 1 }), addCopies(store, { quantity: 1 })]);
  assert.deepEqual(state.row, { quantity: 4, costBasisCents: 8_000, costBasisIsTotal: true });
});

test("an add racing a paid add sums both outlays", async () => {
  // $40 for two; one tab adds a copy for $25 (total), another adds one with no
  // price. Either order is honest; neither may drop the $25 or a copy.
  const { state, store } = memoryRow({ quantity: 2, costBasisCents: 4_000, costBasisIsTotal: true });
  await Promise.all([
    addCopies(store, { quantity: 1, costBasisCents: 2_500, costBasisIsTotal: true }),
    addCopies(store, { quantity: 1 }),
  ]);
  assert.equal(state.row!.quantity, 4);
  assert.ok(
    state.row!.costBasisCents === 8_667 || state.row!.costBasisCents === 8_500,
    `$65 for three then the average, or $60 for three then +$25 — got ${state.row!.costBasisCents}`,
  );
});

test("two overlapping first adds create one row holding both copies", async () => {
  const { state, store } = memoryRow(null);
  await Promise.all([addCopies(store, { quantity: 1 }), addCopies(store, { quantity: 2 })]);
  assert.equal(state.row!.quantity, 3);
  assert.equal(state.row!.costBasisCents, null, "no cost recorded is still no cost recorded");
});

test("the 999 cap holds for the row, and a full row reports that nothing was added", async () => {
  const full = memoryRow({ quantity: QUANTITY_CAP, costBasisCents: null, costBasisIsTotal: false });
  assert.deepEqual(await addCopies(full.store, { quantity: 3 }), { status: "full", quantity: QUANTITY_CAP });
  assert.equal(full.state.writes, 0, "nothing is written, so nothing may be reported as added");

  const nearly = memoryRow({ quantity: QUANTITY_CAP - 2, costBasisCents: 1_000, costBasisIsTotal: false });
  const both = await Promise.all([addCopies(nearly.store, { quantity: 2 }), addCopies(nearly.store, { quantity: 2 })]);
  assert.equal(nearly.state.row!.quantity, QUANTITY_CAP, "overlapping adds cannot push the row past the cap");
  assert.deepEqual(both.map((r) => r.status).sort(), ["added", "full"]);
});

test("a caller's own earlier read is used first, and a stale one is corrected", async () => {
  // The import reads every row in one query before its loop. If a POST lands in
  // between, that read is stale; the guard misses and addCopies re-reads.
  const { state, store } = memoryRow({ quantity: 3, costBasisCents: 6_000, costBasisIsTotal: true });
  const stale: StoredRow = { quantity: 2, costBasisCents: 4_000, costBasisIsTotal: true };
  assert.deepEqual(await addCopies(store, { quantity: 1 }, { existing: stale }), { status: "added", added: 1 });
  assert.deepEqual(state.row, { quantity: 4, costBasisCents: 8_000, costBasisIsTotal: true });
});

test("an add that keeps losing the race gives up without writing", async () => {
  const store: AddCopiesStore = {
    read: async () => ({ quantity: 1, costBasisCents: 1_000, costBasisIsTotal: true }),
    create: async () => false,
    update: async () => false,
  };
  assert.deepEqual(await addCopies(store, { quantity: 1 }), { status: "busy" });
});

test("merging two rows merges what was paid for them", () => {
  // The surviving row otherwise keeps its own cost while absorbing the other's
  // copies, which reads as "these extra cards were free".
  const src = readCode("src/lib/collection-server.ts");
  assert.match(src, /const clashPaid = investedCents\(clash\)/);
  assert.match(src, /costBasisCents: clashPaid \+ itemPaid, costBasisIsTotal: true/);
  // With one side unknown there is no honest sum, so nothing is invented.
  assert.match(src, /clashPaid != null && itemPaid != null/);
});

test("both write paths accept the flag, and the schema defaults it to false", () => {
  const lib = readCode("src/lib/collection-server.ts");
  for (const fn of ["export function parseAddBody", "export function parsePatchBody"]) {
    const body = lib.slice(lib.indexOf(fn), lib.indexOf("\n}\n", lib.indexOf(fn)));
    assert.match(body, /costBasisIsTotal/, `${fn} must accept costBasisIsTotal`);
  }
  assert.match(
    read("prisma/schema.prisma"),
    /costBasisIsTotal\s+Boolean\s+@default\(false\)/,
    "additive with a default, so every existing row keeps its per-unit meaning",
  );
});

test("the public share view still exposes no cost figure at all", () => {
  // The each/total work touches the same rows a shared collection reads. That
  // view selects fields explicitly for exactly this reason — it must not have
  // picked up either cost column along the way.
  const src = readCode("src/lib/collection-share.ts");
  const at = src.indexOf("collectionCard.findMany");
  assert.ok(at >= 0);
  const body = src.slice(at, src.indexOf("});", at));
  assert.ok(!/costBasis/.test(body), "a shared collection must never carry what the owner paid");
});
