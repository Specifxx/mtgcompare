// Rebuild the importer's PrevState from the append-only branch `state` when the branch `data` is lost (critique DP-17): the slugs, the oracle ordinals and slugs and the set tokens and slugs, so no URL changes. The hysteresis masks and the group-hold memory
// are not saved: one day of hysteresis is lost, never a URL. The importer calls restoreState() itself when it finds an empty branch and a `state` branch (scripts/import.ts); this command checks that the backup is readable and prints what it holds.
//   npx tsx scripts/restore-state.ts [--json out.json]
import fs from "node:fs";
import path from "node:path";
import { restoreState } from "../src/lib/data/plane/publisher";
import { authenticateGit, log, remoteOf, workRoot } from "./import";
import { planeBackend } from "../src/lib/data/plane/backend";
import { openWriterStore } from "../src/lib/data/plane/neon-store";
import { restoreStateNeon } from "../src/lib/data/plane/publisher-neon";

export function describeState(remote: string, workdir: string): { slugs: number; oracles: number; sets: number } | null {
  const s = restoreState(remote, workdir); if (!s) return null;
  return { slugs: s.slugById.size, oracles: s.slugByOracleNo.size, sets: s.tokBySetId.size };
}
if (process.argv[1] && /scripts[\\/]restore-state\.ts$/.test(process.argv[1])) main().catch((e) => { console.error(e); process.exit(1); });
async function main(): Promise<void> {
  let d: ReturnType<typeof describeState>;
  if (planeBackend() === "neon") { const store = await openWriterStore(); try { const s = await restoreStateNeon(store); d = s ? { slugs: s.slugById.size, oracles: s.slugByOracleNo.size, sets: s.tokBySetId.size } : null; } finally { await store.close().catch(() => undefined); } }
  else { authenticateGit(); const { remote } = remoteOf(); d = describeState(remote, path.join(workRoot(), "state")); }
  if (!d) { console.error("restore-state: no write-once state backup was found (no `state` rows in the Neon plane, or no `state` branch)"); process.exit(1); }
  log(`restore-state: ${d.slugs} product slugs, ${d.oracles} oracles, ${d.sets} sets are recoverable from the state backup`);
  const out = process.argv.indexOf("--json") >= 0 ? process.argv[process.argv.indexOf("--json") + 1] : undefined; if (out) fs.writeFileSync(out, JSON.stringify(d));
}
