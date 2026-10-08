// MANUAL and read-only by design: the catalogue is never pruned by a publish (C4, C17). A product that TCGCSV stopped listing is flagged GONEP, then GONE after the second complete day, and its row, slug and history stay for ever so no stored id or URL breaks.
// This report lists the GONE rows (and GONE sealed products) of a published tree with their prices and the share of the catalogue, to help an operator decide whether anything should ever be removed. Removing a row is NOT possible through publish:
// writeOnceProblems refuses a publish that drops one (ROW_DELETED), on purpose; a real removal is a reviewed rewrite of the data branch, which this tool does not do.
//   npx tsx scripts/prune-catalog.ts [dir]       # dir = PLANE_DIR (default .data)
import path from "node:path";
import { PRICE_MASK } from "../src/lib/constants";
import { fsTree, type TreeView } from "../src/lib/data/plane/tree";
import type { PxRow, SealedListFile } from "../src/lib/data/plane/formats";

export function goneReport(t: TreeView): { rows: number; gone: number; gonep: number; goneIds: number[]; sealed: number; goneSealed: number; goneWithPrice: number } {
  let rows = 0, gone = 0, gonep = 0, withPrice = 0; const ids: number[] = [];
  for (const f of t.files()) if (f.startsWith("px/")) for (const r of (JSON.parse(t.read(f)) as { p: PxRow[] }).p) {
    rows++; if (r[5] & PRICE_MASK.GONE) { gone++; ids.push(r[0]); if (r[1] != null || r[2] != null) withPrice++; } else if (r[5] & PRICE_MASK.GONEP) gonep++;
  }
  let sealed = 0, goneSealed = 0; for (const f of t.files()) if (/^sl\/list-\d+\.json$/.test(f)) for (const r of (JSON.parse(t.read(f)) as SealedListFile).s) { sealed++; if (r[7] & 2) goneSealed++; }
  return { rows, gone, gonep, goneIds: ids.sort((a, b) => a - b), sealed, goneSealed, goneWithPrice: withPrice };
}
if (process.argv[1] && /scripts[\\/]prune-catalog\.ts$/.test(process.argv[1])) {
  const dir = path.resolve(process.argv[2] ?? process.env.PLANE_DIR ?? ".data"); const t = fsTree(path.join(dir, "v1")); const r = goneReport(t);
  console.log(`prune-catalog (report only): ${r.rows} card rows, ${r.gone} GONE (${r.goneWithPrice} with a last price), ${r.gonep} absent one day (GONEP); ${r.sealed} sealed products, ${r.goneSealed} GONE`);
  if (r.goneIds.length) console.log(`first GONE ids: ${r.goneIds.slice(0, 20).join(", ")}${r.goneIds.length > 20 ? " ..." : ""}`);
  console.log("Nothing was changed: rows are flagged, never deleted (ROW_DELETED refuses a publish that drops one).");
}
