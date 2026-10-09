/**
 * Release-day email blast: the script-side entry point (parity P36), run by .github/workflows/release-day-email.yml or by hand.
 *
 * Mail is sent only from here and the other scripts (never from a request), and only once both mail secrets exist. Safety: it refuses to
 * run without RELEASE_DAY_SEND=1; DRY_RUN=1 reports the audience and sends nothing; it is idempotent per campaign (each subscriber is
 * stamped on success), so a partial run is safe to repeat; and lib/release-day.ts refuses a set that is not out or came out over a week ago.
 * It reads the set's figures from the published files: PLANE_DIR (a pulled tree), else the Neon-backed plane (DATABASE_URL), else with PLANE_BACKEND=github PLANE_REPO and PLANE_TOKEN.
 *
 * Usage:
 *   RELEASE_DAY_SEND=1 DRY_RUN=1 SET_SLUG=modern-horizons-3 npx tsx scripts/send-release-day.ts
 *   RELEASE_DAY_SEND=1 SET_SLUG=modern-horizons-3 npx tsx scripts/send-release-day.ts
 */
import { prisma } from "../src/lib/db";
import { getLastEmailError, providerRefused } from "../src/lib/email";
import { runReleaseDayBlast } from "../src/lib/release-day";

async function main() {
  if (process.env.RELEASE_DAY_SEND !== "1") {
    console.log("release-day: RELEASE_DAY_SEND is not 1 - refusing to send. Set it to actually blast.");
    return;
  }
  const setSlug = process.env.SET_SLUG?.trim() ?? "";
  if (!setSlug) throw new Error("SET_SLUG is required (the set's slug, e.g. modern-horizons-3)");
  if (process.env.PLANE_BACKEND === "github" && !process.env.PLANE_REPO) process.env.PLANE_DIR ||= ".data";
  const res = await runReleaseDayBlast({ setSlug, dryRun: process.env.DRY_RUN === "1", limit: Number(process.env.LIMIT) || undefined });
  console.log("release-day:", JSON.stringify(res, null, 2));
  if (!res.ok) process.exitCode = 1;
  if (providerRefused()) throw new Error(`The mail provider refused the key: ${getLastEmailError()}`);
}

main()
  .catch((e) => {
    console.error("send-release-day failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
