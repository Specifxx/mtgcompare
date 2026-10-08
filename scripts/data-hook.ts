// Re-send the warm call after a publish, or after rotating PLANE_TOKEN (the token is part of the Data Cache key, so a rotation makes every cached entry cold). Reads and writes nothing in the data repository but the pointer it reads:
// POST /api/data-warm { ref } loads the hot set (about 60 files, 14 MB) into the regional Data Cache, then GET /api/data-status is polled until the site serves the ref. Tag purges are NOT used for plane data (pinned URLs need none).
//   npx tsx scripts/data-hook.ts          # REVALIDATE_URL, CRON_SECRET, PLANE_REPO, DATA_REPO_TOKEN
import { revalidateSite } from "../src/lib/import";
import { log, readRemotePointer } from "./import";

export async function hook(env: NodeJS.ProcessEnv = process.env, f: typeof fetch = fetch): Promise<boolean> {
  const pointer = await readRemotePointer(env, f);
  if (!pointer) { log("hook: the pointer could not be read (PLANE_REPO, DATA_REPO_TOKEN); nothing to announce"); return false; }
  await revalidateSite(log, { pointer, fetch: f });
  return true;
}
if (process.argv[1] && /scripts[\\/]data-hook\.ts$/.test(process.argv[1])) hook().then((ok) => { if (!ok) process.exitCode = 1; }).catch((e) => { console.error(e); process.exitCode = 1; });
