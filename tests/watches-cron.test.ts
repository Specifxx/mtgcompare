import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseMode } from "../scripts/alerts";
import { PAID_SEND_CAP, FIRST_PRICE_SEND_CAP, FIRST_CONTACT_SEND_CAP, ALERT_DAILY_BUDGET, ALL_RUN_SHARE, ALERT_BUDGET_WINDOW_MS } from "../src/lib/price-alerts";

// ─────────────────────────────────────────────────────────────────────────────
// The alert run's wiring (RiftCompare's /api/cron/price-alerts routes, run
// script-side as scripts/alerts.ts after each import): the modes, which passes
// the paid run chains and in what order, one shared send cap, what is recorded,
// and when the run goes red. tests/alerts-correctness pins the workflow's gates.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("modes: free, paid, baseline — anything else is refused", () => {
  assert.equal(parseMode(["--mode=free"]), "free");
  assert.equal(parseMode(["--mode=paid"]), "paid");
  assert.equal(parseMode(["--mode=baseline"]), "baseline");
  assert.equal(parseMode(["--mode", "paid"]), "paid");
  assert.equal(parseMode([]), null);
  assert.equal(parseMode(["--mode=all"]), null);
  assert.equal(parseMode(["--mode="]), null);
});

test("the budget numbers: 50 addresses per rolling 20h, the free run at most 35 of them, caps per pass", () => {
  assert.equal(ALERT_DAILY_BUDGET, 50);
  assert.equal(ALL_RUN_SHARE, 35);
  assert.equal(ALERT_BUDGET_WINDOW_MS, 20 * 3600_000);
  assert.equal(PAID_SEND_CAP, 30);
  assert.equal(FIRST_PRICE_SEND_CAP, 25);
  assert.equal(FIRST_CONTACT_SEND_CAP, 20);
});

test("the paid run: cards, then decks (when the tools track's module exists), then sealed, then release — one shared send cap", () => {
  const src = read("scripts/alerts.ts");
  const paid = src.slice(src.indexOf("} else {"));
  const order = ["runPriceAlerts", "runDecks", "runSealedWatches", "runReleaseAlerts"].map((n) => paid.indexOf(n));
  assert.ok(order.every((i) => i >= 0) && [...order].sort((a, b) => a - b).join() === order.join(), "in that order");
  assert.match(paid, /sendCap: afterCards/);
  assert.match(paid, /sendCap: afterDecks/);
  assert.match(paid, /PAID_SEND_CAP - /);
  // The deck pass is loaded by name so this script runs before the tools track merges, and is still skipped, never fatal, if absent.
  assert.match(src, /loadDeckWatches/);
  assert.match(src, /lib\/deck-watch\.ts is not on this branch yet/);
});

test("each pass is independent: a failed pass is recorded, never fatal to the others or to the import", () => {
  const src = read("scripts/alerts.ts");
  assert.match(src, /\.catch\(failed\("cards"\)\)/);
  assert.match(src, /\.catch\(failed\("sealed"\)\)/);
  assert.match(src, /\.catch\(failed\("release"\)\)/);
  assert.match(src, /finally \{\s*await prisma\.importRun\.update\(\{ where: \{ id: run\.id \}, data: \{ ok, finishedAt: new Date\(\), summary/, "the ImportRun row is written even when the run throws");
  // Red only for a refused key.
  const exits = src.match(/process\.exitCode = 1/g) ?? [];
  assert.equal(exits.length, 1);
  assert.match(src, /if \(providerRefused\(\)\) throw new Error/);
});

test("the baseline mode moves baselines and sends nothing; free and paid scope the same run differently", () => {
  const src = read("scripts/alerts.ts");
  assert.match(src, /mode === "baseline"[\s\S]*?baselineOnly: true/);
  assert.match(src, /mode === "free"[\s\S]*?scope: "all"/);
  assert.match(src, /scope: "paid"/);
  // Baseline mode never touches decks, sealed watches or release alerts.
  const baselineBranch = src.slice(src.indexOf('if (mode === "baseline")'), src.indexOf('} else if (mode === "free")'));
  assert.doesNotMatch(baselineBranch, /runSealedWatches|runReleaseAlerts|runDecks/);
});

test("the script reads and writes the database directly: no HTTP, no cron secret, no revalidate", () => {
  const src = read("scripts/alerts.ts");
  assert.doesNotMatch(src, /CRON_SECRET|fetch\(|https?:\/\//);
  const wf = read(".github/workflows/import-prices.yml");
  const alertSteps = wf.slice(wf.indexOf("- name: Free price alerts"));
  assert.doesNotMatch(alertSteps, /CRON_SECRET|curl /);
  assert.match(alertSteps, /EMAIL_LINK_SECRET: \$\{\{ secrets\.EMAIL_LINK_SECRET \}\}/);
  assert.doesNotMatch(wf, /EBAY_CLIENT/, "the store import never holds the eBay keyset");
  assert.doesNotMatch(wf, /\[deploy\]/);
});
