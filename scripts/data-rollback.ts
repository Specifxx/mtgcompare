// A rollback is ONE pointer commit that names an older retained data commit (a seq number or a sha), then the warm call. No deploy, no purge. The old tree must still be fetchable: tags d-<priceDay>-<seq> are kept 7 days across squashes, and the tags of
// the pointed commit and its predecessor always (plane/publish-protocol.ts planSquash). The root status.json is updated in a second commit so /admin/data shows the rollback.
//   npx tsx scripts/data-rollback.ts 41            # to seq 41
//   npx tsx scripts/data-rollback.ts 3f9c2ab       # to a data commit sha (prefix)
import path from "node:path";
import { rollback } from "../src/lib/data/plane/publisher";
import { revalidateSite } from "../src/lib/import";
import { authenticateGit, log, remoteOf, workRoot } from "./import";
import { planeBackend } from "../src/lib/data/plane/backend";
import { checkoutHead, pushStatus } from "./data-watchdog";

export async function runRollback(to: string | number, env: NodeJS.ProcessEnv = process.env, o: { skipHook?: boolean; now?: () => Date; workdir?: string } = {}): Promise<{ seq: number; ref: string }> {
  if (planeBackend(env) === "neon") throw new Error("rollback is a GitHub-backend operation (a pointer commit naming an older data commit). The Neon-backed plane keeps only the current tree, so there is no older tree to point at: to undo a bad publish, fix the cause and run the import again with IMPORT_FORCE=1 (the validator refuses a bad tree before it is ever visible). Set PLANE_BACKEND=github to use this job.");
  const { remote } = remoteOf(env); const branch = env.PLANE_BRANCH || "data"; const now = o.now ?? (() => new Date());
  const base = o.workdir ?? path.join(workRoot(env), "rollback");
  const p = rollback({ remote, workdir: base, to, branch, now });
  const co = checkoutHead(remote, `${base}-status`, branch);
  pushStatus(co.g, `${base}-status`, branch, (s) => {
    s.at = now().toISOString(); s.by = "publish"; s.pointer = { ...(s.pointer ?? ({} as StatusPointer)), seq: p.seq, ref: p.ref, prev: p.prev, publishedAt: p.publishedAt, priceDay: p.priceDay, phase: p.phase, tcgcsv: p.tcgcsv, scryfall: p.scryfall, format: "v1", manifestSha256: p.manifestSha256, repo: p.repo, histCut: p.histCut, pvAt: p.pvAt };
    s.runs = [{ at: now().toISOString(), kind: "rollback" as const, ok: true, seconds: 0, note: `pointer ${p.seq} rolled back to ${String(to)}` }, ...(s.runs ?? [])].slice(0, 30);
  }, `status rollback ${p.seq}`);
  log(`rollback: pointer ${p.seq} now names ${p.ref.slice(0, 7)} (priceDay ${p.priceDay}, phase ${p.phase})`);
  if (!o.skipHook) await revalidateSite(log, { pointer: p });
  return { seq: p.seq, ref: p.ref };
}
type StatusPointer = import("../src/lib/data/plane/status").StatusFile["pointer"];
if (process.argv[1] && /scripts[\\/]data-rollback\.ts$/.test(process.argv[1])) {
  const arg = process.argv[2]; if (!arg) { console.error("usage: data-rollback.ts <seq|sha>"); process.exit(2); }
  if (planeBackend() === "github") authenticateGit(); runRollback(/^\d+$/.test(arg) ? Number(arg) : arg).catch((e) => { console.error(e); process.exitCode = 1; });
}
