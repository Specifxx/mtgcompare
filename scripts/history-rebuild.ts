// Rebuild every price series day for day from the daily delta files of the append-only branch `state` (d/<yyyy>/<mm>/<yyyy-mm-dd>.json, plane/history-delta.ts), for the day the live history (hist/p, hist/t) is lost or damaged. The result is a v4 base:
// hist/p/<d>/<b>.json under --out, every series trimmed to the 730 days that end on its last day; copy it into the checkout of branch data and let the next publish continue from it. Nothing is pushed.
//   npx tsx scripts/history-rebuild.ts --out .rebuild
import fs from "node:fs";
import path from "node:path";
import { readDeltas } from "../src/lib/data/plane/publisher";
import { rebuildSeries, type DeltaFile } from "../src/lib/data/plane/history-delta";
import { decodeDense, encodeRuns, endDayOf } from "../src/lib/data/plane/history-codec";
import { bucketPath, histBucket } from "../src/lib/data/plane/shards";
import { addDays } from "../src/lib/history";
import { authenticateGit, log, remoteOf, workRoot } from "./import";

/** The base files of the rebuilt series: { relative path -> text }. A series is trimmed to 730 days ending on the last delta day; one that ended before that window is dropped. */
export function rebuildFiles(deltas: readonly DeltaFile[]): Map<string, string> {
  const series = rebuildSeries(deltas); const last = deltas.length ? Math.max(...deltas.map((d) => d.day)) : 0; const first = addDays(last, -729);
  const by = new Map<number, Record<string, (number | null)[]>>();
  for (const [uid, s] of [...series].sort((a, b) => a[0] - b[0])) {
    if (endDayOf(s) < first) continue; let out = s;
    if (s[0] < first) { const dense = decodeDense(s).filter((p) => p.day >= first); out = encodeRuns(dense[0]!.day, dense.map((p) => p.cents)); }
    const b = histBucket(Math.floor(uid / 2)); let m = by.get(b); if (!m) by.set(b, (m = {})); m[`${Math.floor(uid / 2)}.${uid % 2}`] = out as (number | null)[];
  }
  return new Map([...by].sort((a, b) => a[0] - b[0]).map(([b, p]) => [bucketPath("hist/p", b), `{"v":4,"p":${JSON.stringify(p)}}`] as [string, string]));
}
if (process.argv[1] && /scripts[\\/]history-rebuild\.ts$/.test(process.argv[1])) {
  authenticateGit(); const { remote } = remoteOf(); const outArg = process.argv.indexOf("--out"); const out = path.resolve(outArg >= 0 ? process.argv[outArg + 1]! : ".rebuild");
  const deltas = readDeltas(remote, path.join(workRoot(), "deltas"));
  if (!deltas.length) { console.error("history-rebuild: the repository has no daily delta files on branch state"); process.exit(1); }
  const files = rebuildFiles(deltas); for (const [rel, text] of files) { const f = path.join(out, "v1", rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); }
  log(`history-rebuild: ${deltas.length} daily files (${deltas[0]!.day} to ${deltas[deltas.length - 1]!.day}) -> ${files.size} base files in ${out}/v1/hist/p`);
}
