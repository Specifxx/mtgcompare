// THE ALERT RUN — RiftCompare's /api/cron/price-alerts{,/paid,/baseline}
// routes, run script-side in GitHub Actions for MTG Compare. The daily publish
// workflow calls it after the data is out, with PLANE_DIR naming the checkout
// of the published files (default .data, where the import leaves the verified
// tree) and DATABASE_URL for the user rows:
//
//   npx tsx scripts/alerts.ts                   # the daily run (no --mode): every watch, then deck and sealed watches and release alerts
//   npx tsx scripts/alerts.ts --mode=free       # every watch only (the weekly free digest)
//   npx tsx scripts/alerts.ts --mode=paid       # Plus/Premium triggers, deck and sealed watches, release alerts
//   npx tsx scripts/alerts.ts --mode=baseline   # a manual re-import after a matcher change: baselines only, nothing sent
//
// EMAIL IS OFF UNTIL CONFIGURED (lib/email.ts isEmailEnabled: both mail secrets
// set, as GitHub Actions secrets). Off, the run is a green
// no-op for mail that still does its work: baselines advance and every trigger
// for an account is delivered in-app (a Notification, lastFlaggedAt). It
// records Meta "email" = on/off first (lib/email-status.ts), so /admin/mail
// shows what the run found. A key that is set but REFUSED by the provider exits
// 1 (red), as the eBay pass does for a refused keyset. Anything else that fails
// is recorded in the ImportRun row (ok: false) and logged, but exits 0: a missed
// alert pass is caught by the next day's, and must never red a successful
// import (RiftCompare's alert steps are non-fatal for the same reason).
import { prisma } from "../src/lib/db";
import { getLastEmailError, isEmailEnabled, providerRefused } from "../src/lib/email";
import { recordEmailRefused, recordEmailStatus } from "../src/lib/email-status";
import { PAID_SEND_CAP, runPriceAlerts } from "../src/lib/price-alerts";
import { runSealedWatches } from "../src/lib/sealed-watch-run";
import { runReleaseAlerts } from "../src/lib/release-alerts-run";
import { runDeckWatches } from "../src/lib/deck-watch";
import { notify } from "../src/lib/notifications";
import { sendDeckWatchEmail } from "../src/lib/watch-emails";

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

export type AlertMode = "daily" | "free" | "paid" | "baseline";

export function parseMode(argv: readonly string[]): AlertMode | null {
  const named = argv.some((a) => a === "--mode" || a.startsWith("--mode="));
  if (!named) return "daily";
  const arg = argv.find((a) => a.startsWith("--mode="))?.slice("--mode=".length) ?? argv[argv.indexOf("--mode") + 1];
  return arg === "free" || arg === "paid" || arg === "baseline" ? arg : null;
}

async function main() {
  process.env.PLANE_DIR ||= ".data";
  const mode = parseMode(process.argv.slice(2));
  if (!mode) throw new Error("usage: tsx scripts/alerts.ts --mode=free|paid|baseline");
  const emailOn = isEmailEnabled();
  await recordEmailStatus(prisma, emailOn);
  log(`Alerts (${mode}): email is ${emailOn ? "ON" : "OFF — delivering in-app only"}`);
  const run = await prisma.importRun.create({ data: { kind: "alerts" } });
  const summary: Record<string, unknown> = { mode, email: emailOn ? "on" : "off" };
  let ok = true;
  const failed = (name: string) => (e: unknown) => {
    ok = false;
    log(`${name}: failed`, e instanceof Error ? e.message : String(e));
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  };
  try {
    if (mode === "baseline") {
      summary.cards = await runPriceAlerts({}, { baselineOnly: true }).catch(failed("cards"));
    } else if (mode === "free") {
      summary.cards = await runPriceAlerts({}, { scope: "all" }).catch(failed("cards"));
    } else {
      // "daily" (the publish workflow) walks every watch once; "paid" is the narrower scope for a re-run.
      const cards = await runPriceAlerts({}, { scope: mode === "daily" ? "all" : "paid" }).catch(failed("cards"));
      summary.cards = cards;
      const afterCards = Math.max(0, PAID_SEND_CAP - ("emails" in cards && typeof cards.emails === "number" ? cards.emails : 0));
      // The deck run prices each list over the published files PLANE_DIR names; it has no per-address cap of its own, so each deck email is counted against the shared one.
      const decks = (await runDeckWatches({ emailEnabled: emailOn, notify, send: sendDeckWatchEmail }).catch(failed("decks"))) as Record<string, unknown>;
      summary.decks = decks;
      const afterDecks = Math.max(0, afterCards - (typeof decks.emails === "number" ? decks.emails : 0));
      summary.sealed = await runSealedWatches({ sendCap: afterDecks }).catch(failed("sealed"));
      summary.release = await runReleaseAlerts().catch(failed("release"));
    }
    if (providerRefused()) {
      ok = false;
      summary.refused = getLastEmailError();
      await recordEmailRefused(prisma);
    }
    log("Alerts:", JSON.stringify(summary));
  } finally {
    await prisma.importRun.update({ where: { id: run.id }, data: { ok, finishedAt: new Date(), summary: summary as object } });
  }
  if (providerRefused()) throw new Error(`The mail provider refused the key: ${getLastEmailError()}`);
  if (!ok) log("An alert pass failed (recorded in the ImportRun row); the next import's run will catch up.");
}

if (require.main === module) {
  main()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
