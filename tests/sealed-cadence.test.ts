import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SEALED_RESTOCK_COOLDOWN_MS, SEALED_RESTOCK_MIN_SOLDOUT_MS, SEALED_WATCH_COOLDOWN_MS, inSealedCooldown, sealedCooldownMs } from "../src/lib/sealed-watch-run";
import { SEALED_CHECK_CADENCE, SEALED_CHECK_SENTENCE, SEALED_RRP_MARKETS, sealedRrpAvailable } from "../src/lib/alert-limits";
import { buildSealedWatchEmail, type SealedWatchItem } from "../src/lib/watch-emails";
import { NOW, hoursAgo, offer, plus, sealedHarness, sealedRow } from "./helpers/watch-harness";

// ─────────────────────────────────────────────────────────────────────────────
// SEALED WATCH CADENCE. RiftCompare checks sealed products about every six
// hours; MTG Compare's import publishes once a day (IMPORT_CRONS in
// lib/schedule.ts), so its watches are honestly "checked once a day", and the
// restock rule is RiftCompare's with the same 5h floor: a sell-out seen at one
// run and a restock at the next is a day apart, well past it. The copy quotes
// the one constant (lib/alert-limits.ts SEALED_CHECK_CADENCE, read from
// schedule.ts), never a typed number.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("the thresholds: a five-hour sold-out floor, a six-hour restock cooldown, 24h for the rest", () => {
  assert.equal(SEALED_RESTOCK_MIN_SOLDOUT_MS, 5 * 3_600_000);
  assert.equal(SEALED_RESTOCK_COOLDOWN_MS, 6 * 3_600_000);
  assert.equal(SEALED_WATCH_COOLDOWN_MS, 24 * 3_600_000);
  assert.equal(sealedCooldownMs("sealed_restock"), SEALED_RESTOCK_COOLDOWN_MS);
  for (const k of ["sealed_target", "sealed_rrp", "sealed_drop"] as const) assert.equal(sealedCooldownMs(k), SEALED_WATCH_COOLDOWN_MS, k);
  assert.equal(sealedCooldownMs(), SEALED_WATCH_COOLDOWN_MS);
  assert.equal(inSealedCooldown(hoursAgo(7), NOW, "sealed_restock"), false);
  assert.equal(inSealedCooldown(hoursAgo(5), NOW, "sealed_restock"), true);
  assert.equal(inSealedCooldown(hoursAgo(7), NOW, "sealed_drop"), true);
  assert.equal(inSealedCooldown(null, NOW, "sealed_restock"), false);
});

test("two runs 5h or more apart are enough for a restock, a short blip is not", async () => {
  for (const [hours, fires] of [[12, true], [11.5, true], [5, true], [4.9, false], [3, false]] as const) {
    const h = sealedHarness([sealedRow("s1", plus, { lastPriceCents: 15000, lastInStock: false, soldOutAt: hoursAgo(hours) })], { offers: [offer(15000)] });
    const s = await h.run();
    assert.equal(s.restocks, fires ? 1 : 0, `${hours}h`);
    assert.equal(h.sent.length, fires ? 1 : 0, `${hours}h`);
  }
});

test("the cadence is one constant, once a day, read from the schedule, quoted in the email and the footer", () => {
  assert.equal(SEALED_CHECK_CADENCE, "once a day");
  assert.match(read("src/lib/alert-limits.ts"), /IMPORT_CRONS\.every/, "derived from the schedule, not typed");
  assert.match(SEALED_CHECK_SENTENCE, /checked once a day/);
  assert.match(SEALED_CHECK_SENTENCE, /Discord stock bot may be faster/, "never pretends to be instant");
  const item: SealedWatchItem = {
    kind: "sealed_restock", watchId: "w1", sealedId: 5001, slug: "modern-horizons-3-play-booster-box", name: "Modern Horizons 3 Play Booster Box", productType: "booster-box", setCode: "MH3",
    market: "US", currency: "USD", priceCents: 15500, rrpCents: null, store: { name: "Shop X", url: "https://shopx.example/box", retailer: "store:shopx" }, storeCount: 2,
    targetCents: null, referenceCents: null, referenceBasis: null, soldOutAt: hoursAgo(30), checkedAt: hoursAgo(2), actions: null,
  };
  const e = buildSealedWatchEmail(item);
  assert.match(e.html, /checked once a day/);
  assert.match(e.text, /checked once a day/);
  assert.match(e.html, /Checked .* at Shop X\./, "when the store's page was last read, in the body");
  assert.match(e.html, /Stock can sell out again before you get there/);
  assert.doesNotMatch(`${e.html} ${e.text}`, /every six hours|instant/i);
  const src = read("src/lib/watch-emails.ts");
  assert.match(src, /SEALED_CHECK_CADENCE/);
  assert.doesNotMatch(src.replace(/\/\/.*$/gm, ""), /once a day|six hours/, "the number is never typed in the template");
});

test("RRP alerts are off: no market is enabled, so none is promised or sent", () => {
  assert.deepEqual(SEALED_RRP_MARKETS, []);
  for (const m of ["US", "AU", "UK", "SG", "CA", "EU"] as const) assert.equal(sealedRrpAvailable(m), false, m);
});

test("the sealed pass runs in the daily and paid modes, after the card and deck passes, from the import workflow", () => {
  const script = read("scripts/alerts.ts");
  const paid = script.slice(script.indexOf("} else {"));
  assert.match(paid, /runPriceAlerts\(\{\}, \{ scope: mode === "daily" \? "all" : "paid" \}\)/);
  assert.ok(paid.indexOf("runPriceAlerts") < paid.indexOf("runSealedWatches") && paid.indexOf("runSealedWatches") < paid.indexOf("runReleaseAlerts"));
  assert.match(paid, /runSealedWatches\(\{ sendCap: afterDecks \}\)/, "one send cap shared across the passes");
  const wf = read(".github/workflows/import-prices.yml");
  assert.match(wf, /- name: Alerts[\s\S]*scripts\/alerts\.ts/);
});
