// Materialise the CURRENT published tree of the Neon-backed plane into a directory, the same layout a depth-1 checkout of the data repository had (DECISIONS.md, 2026-10-09):
//   <dir>/v1/**  <dir>/latest.json  <dir>/status.json        (default dir: .data, or PLANE_DIR)
// For every job that reads the published data as files (the alerts step after the import, the eBay passes, the audits, the slug seed, the store-health report). One repeatable-read transaction, so a publish that flips meanwhile cannot mix two trees; the pointer in <dir>/latest.json
// is the one that goes with the files. Needs DATABASE_URL only: no token, no secret of its own. scripts/plane-checkout.sh calls this when PLANE_BACKEND is not github.
//   npx tsx scripts/plane-pull.ts [dir]
import path from "node:path";
import { NeonStore, openWriterStore } from "../src/lib/data/plane/neon-store";
import type { PointerFile } from "../src/lib/data/plane/formats";

export async function pullPlane(store: NeonStore, dir: string): Promise<{ files: number; pointer: PointerFile | null }> {
  const t = await store.pullTo(dir, { clean: true });
  return { files: [...t.files.keys()].filter((p) => p.startsWith("v1/")).length, pointer: t.pointer ? (JSON.parse(t.pointer) as PointerFile) : null };
}
async function main(): Promise<void> {
  const dir = path.resolve(process.argv[2] ?? process.env.PLANE_DIR ?? ".data");
  const store = await openWriterStore(process.env);
  try {
    if (!(await store.tableExists())) { console.error("plane-pull: the PlaneFile table does not exist yet: nothing has been published into this database (run the import first)"); process.exitCode = 1; return; }
    const r = await pullPlane(store, dir);
    if (!r.pointer) { console.error("plane-pull: the table has no pointer row yet: nothing has been published"); process.exitCode = 1; return; }
    console.log(`plane pull: seq ${r.pointer.seq}, priceDay ${r.pointer.priceDay}, phase ${r.pointer.phase}, ${r.files} files in ${dir}`);
  } finally { await store.close().catch(() => undefined); }
}
if (process.argv[1] && /scripts[\\/]plane-pull\.ts$/.test(process.argv[1])) main().catch((e) => { console.error(e); process.exitCode = 1; });
