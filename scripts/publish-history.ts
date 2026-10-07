// After the import workflow has pushed the history to the `data` branch: record
// the commit the site should read (Meta "historyRef") and purge the site's
// cache. Pinning the commit makes every history URL immutable, so GitHub's raw
// CDN (which caches a branch name for a few minutes) can never serve the site
// yesterday's file under today's cache entry.
//
//   HISTORY_REF=<sha> npx tsx scripts/publish-history.ts
import { prisma } from "../src/lib/db";
import { revalidateSite } from "../src/lib/import";

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function main() {
  const ref = (process.env.HISTORY_REF ?? "").trim();
  if (!/^[0-9a-f]{40}$/.test(ref)) throw new Error(`HISTORY_REF must be a full commit sha, got "${ref}"`);
  await prisma.meta.upsert({ where: { key: "historyRef" }, create: { key: "historyRef", value: ref }, update: { value: ref } });
  log(`History ref → ${ref}`);
  await revalidateSite(log);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
