// Rebuild the importer's PrevState from the append-only branch `state` when the branch `data` is lost (critique DP-17): the slugs, the oracle ordinals and slugs and the set tokens and slugs, so no URL changes. The hysteresis masks and the group-hold memory
// are not saved: one day of hysteresis is lost, never a URL. The importer calls restoreState() itself when it finds an empty branch and a `state` branch (scripts/import.ts); this command checks that the backup is readable and prints what it holds.
//   npx tsx scripts/restore-state.ts [--json out.json]
import fs from "node:fs";
import path from "node:path";
import { restoreState } from "../src/lib/data/plane/publisher";
import { authenticateGit, log, remoteOf, workRoot } from "./import";

export function describeState(remote: string, workdir: string): { slugs: number; oracles: number; sets: number } | null {
  const s = restoreState(remote, workdir); if (!s) return null;
  return { slugs: s.slugById.size, oracles: s.slugByOracleNo.size, sets: s.tokBySetId.size };
}
if (process.argv[1] && /scripts[\\/]restore-state\.ts$/.test(process.argv[1])) {
  authenticateGit(); const { remote } = remoteOf();
  const d = describeState(remote, path.join(workRoot(), "state"));
  if (!d) { console.error("restore-state: the repository has no `state` branch"); process.exit(1); }
  log(`restore-state: ${d.slugs} product slugs, ${d.oracles} oracles, ${d.sets} sets are recoverable from branch state`);
  const out = process.argv.indexOf("--json") >= 0 ? process.argv[process.argv.indexOf("--json") + 1] : undefined; if (out) fs.writeFileSync(out, JSON.stringify(d));
}
