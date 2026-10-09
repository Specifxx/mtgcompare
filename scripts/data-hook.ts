// Re-send the warm call after a publish. Reads nothing but the pointer: the "latest.json" row of the Neon-backed plane (DATABASE_URL; the default) or, with PLANE_BACKEND=github, latest.json of the data repository (and, after rotating PLANE_TOKEN, which is part of the Data Cache key there).
// POST /api/data-warm { ref } makes the instance look at the pointer again and loads the hot set (about 60 files, 14 MB) into its memory, then GET /api/data-status is polled until the site serves the ref. Tag purges are NOT used for plane data.
//   npx tsx scripts/data-hook.ts          # REVALIDATE_URL, CRON_SECRET, DATABASE_URL (or PLANE_REPO, DATA_REPO_TOKEN with PLANE_BACKEND=github)
import { revalidateSite } from "../src/lib/import";
import { log, readRemotePointer, readStorePointer } from "./import";
import { planeBackend } from "../src/lib/data/plane/backend";
import { openWriterStore } from "../src/lib/data/plane/neon-store";

export async function hook(env: NodeJS.ProcessEnv = process.env, f: typeof fetch = fetch): Promise<boolean> {
  let pointer: Awaited<ReturnType<typeof readRemotePointer>>;
  if (planeBackend(env) === "neon") { if (!env.DATABASE_URL) { log("hook: DATABASE_URL is not set; nothing to announce"); return false; } const store = await openWriterStore(env); try { pointer = await readStorePointer(store); } finally { await store.close().catch(() => undefined); } }
  else pointer = await readRemotePointer(env, f);
  if (!pointer) { log("hook: the pointer could not be read (nothing published yet, or DATABASE_URL / PLANE_REPO + DATA_REPO_TOKEN are wrong); nothing to announce"); return false; }
  await revalidateSite(log, { pointer, fetch: f });
  return true;
}
if (process.argv[1] && /scripts[\\/]data-hook\.ts$/.test(process.argv[1])) hook().then((ok) => { if (!ok) process.exitCode = 1; }).catch((e) => { console.error(e); process.exitCode = 1; });
