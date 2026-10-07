// THE WEEKLY NEWSLETTER — RiftCompare's /api/cron/newsletter, run script-side
// in GitHub Actions for OP Compare (.github/workflows/email-weekly.yml, Fridays
// 21:00 UTC; wave 2, 2026-10-03). One edition per ISO week (lib/newsletter.ts
// editionKey), stamped per subscriber only after a successful send, so a rerun
// resumes rather than double-sends.
//
// OFF UNTIL CONFIGURED, like every sender: without both mail secrets it records Meta "email" = off and exits 0 having sent nothing. A
// key that is set but REFUSED records "off" again and exits 1.
import { prisma } from "../src/lib/db";
import { getLastEmailError, isEmailEnabled, providerRefused } from "../src/lib/email";
import { recordEmailRefused, recordEmailStatus } from "../src/lib/email-status";
import { runNewsletterDigest } from "../src/lib/newsletter";

async function main() {
  const emailOn = isEmailEnabled();
  await recordEmailStatus(prisma, emailOn);
  if (!emailOn) {
    console.log("Email is OFF (the mail secrets are not both set): no newsletter sent.");
    return;
  }
  const summary = await runNewsletterDigest();
  console.log("Newsletter:", JSON.stringify(summary));
  if (providerRefused()) {
    await recordEmailRefused(prisma);
    throw new Error(`The mail provider refused the key: ${getLastEmailError()}`);
  }
}

if (require.main === module) {
  main()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
