import { test } from "node:test";
import assert from "node:assert/strict";
import { applyWrites, harness, row } from "./helpers/alert-harness";

// ─────────────────────────────────────────────────────────────────────────────
// A price move the subscriber was never told about must stay pending.
// ─────────────────────────────────────────────────────────────────────────────
// runPriceAlerts() emails first and advances the baseline after. A bounced or
// rate-limited digest used to lose the drop for good: the baseline was already
// the new, lower price, the next run compared it against itself and found no
// drop. Only the alerts that were IN a failed digest are held; a rise, or any
// row that sent nothing, still advances — one bad address must not freeze
// baselines it has nothing to do with. (Behavioural since the 2026-09-25
// rework; these used to be regexes over the source.)

test("a failed digest holds its alerts' baselines and claims no notification", async () => {
  const rows = [
    row("bad", { lastPriceCents: 1000, price: 800 }),
    row("rise", { email: "bad@example.com", lastPriceCents: 500, price: 700 }), // same address, a rise: not in the digest
    row("good", { lastPriceCents: 1000, price: 800 }),
  ];
  const h = harness(rows, { sendOk: (to) => to !== "bad@example.com" });
  const s = await h.run();
  assert.equal(s.emails, 1);
  assert.equal(h.writeFor("bad"), undefined, "no baseline, no lastNotifiedAt, no watermark");
  assert.equal(h.writeFor("rise")!.lastPriceCents, 700, "a row with no item still advances");
  assert.equal(h.writeFor("rise")!.lastNotifiedAt, undefined);
  assert.equal(h.writeFor("good")!.lastPriceCents, 800);
  assert.equal(h.writeFor("good")!.lowestEmailedCents, 800);
  assert.equal(s.held, 1, "the run reports what it deliberately did not write");
  // The retry: the next run still sees 1000 → 800 and sends it.
  const retry = harness(applyWrites(rows, h.writes).map((r) => ({ ...r, _price: r.id === "rise" ? 700 : 800 })));
  await retry.run();
  assert.ok(retry.sent.some((m) => m.to === "bad@example.com" && m.items[0]!.kind === "drop"));
});
