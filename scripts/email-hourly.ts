// THE HOURLY OUTBOX — RiftCompare's welcome-email cron, the alert-confirmation
// drain and the newsletter-welcome send, run script-side in GitHub Actions
// (.github/workflows/email.yml, minute 23) for OP Compare (wave 2, 2026-10-03).
// Nothing is sent from a request: a signup writes a row, and this run sends.
//
// OFF UNTIL CONFIGURED: without both mail secrets (lib/email.ts
// isEmailEnabled) the run records Meta "email" = off and exits 0, claiming and
// stamping nothing, so the first run with email on still finds every pending
// row. A key that is set but REFUSED by the provider records "off" again and
// exits 1 (red), as the eBay pass does for a refused keyset.
import { prisma } from "../src/lib/db";
import { getLastEmailError, isEmailEnabled, providerRefused, sendNewsletterWelcomeEmail } from "../src/lib/email";
import { recordEmailRefused, recordEmailStatus } from "../src/lib/email-status";
import { drainConfirmations } from "../src/lib/alert-confirmations";
import { drainNewsletterWelcomes } from "../src/lib/newsletter";
import { runWelcomeEmails } from "../src/lib/welcome-email";

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function main() {
  const emailOn = isEmailEnabled();
  await recordEmailStatus(prisma, emailOn);
  if (!emailOn) {
    log("Email is OFF (the mail secrets are not both set): nothing to send.");
    return;
  }
  const summary: Record<string, unknown> = {};
  const attempt = async (name: string, fn: () => Promise<unknown>) => {
    try {
      summary[name] = await fn();
    } catch (e) {
      summary[name] = { error: e instanceof Error ? e.message : String(e) };
    }
  };
  await attempt("welcome", () => runWelcomeEmails());
  await attempt("confirmations", () => drainConfirmations());
  await attempt("newsletterWelcomes", () => drainNewsletterWelcomes(new Date(), sendNewsletterWelcomeEmail));
  log("Outbox:", JSON.stringify(summary));
  if (providerRefused()) {
    await recordEmailRefused(prisma);
    throw new Error(`The mail provider refused the key: ${getLastEmailError()}`);
  }
  const failed = Object.entries(summary).filter(([, v]) => v && typeof v === "object" && "error" in (v as object));
  if (failed.length) log(`${failed.map(([k]) => k).join(", ")} failed; the next hour retries (nothing is stamped on a failure).`);
}

if (require.main === module) {
  main()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
