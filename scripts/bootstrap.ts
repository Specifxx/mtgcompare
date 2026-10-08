// npm run import:bootstrap: the first dataset, WITHOUT git and without the store stage (contract 6.11). Runs S1..S7 and S10..S12 into a local directory (PLANE_DIR, default .data) that holds the same files the data repository holds:
//
//   <PLANE_DIR>/v1/**      the published tree          <PLANE_DIR>/latest.json   the pointer (ref = a stand-in 40-hex id)       <PLANE_DIR>/status.json   the admin panel's record
//
// The reader serves it with PLANE_DIR=.data (src/lib/data/plane/runtime.ts), the Actions jobs read it as a checkout. Nothing is pushed anywhere. Re-running it over the same directory is the idempotent re-run of Annex C check 15: the same price day
// writes byte-identical shards and moves only the same-day history point.
//
//   TCGCSV_CACHE_DIR=<dir> SCRYFALL_CACHE_DIR=<dir> npm run import:bootstrap     # no network: the downloaded files (see src/lib/import.ts loadTcgcsv / loadScryfall for the layouts)
//   BOOTSTRAP_GROUPS=24 npm run import:bootstrap                                # the three biggest bucket groups and the newest sets: about 20 seconds, for development and CI
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { scryfallStamp, tcgcsvStamp } from "../src/lib/import";
import { loadPrevState } from "../src/lib/data/plane/prevstate";
import { writeOnceProblems } from "../src/lib/data/plane/prevstate";
import { fsTree } from "../src/lib/data/plane/tree";
import { validateTree } from "../src/lib/data/plane/validate";
import { isCutDay, nextPointer } from "../src/lib/data/plane/publish-protocol";
import type { PointerFile } from "../src/lib/data/plane/formats";
import type { StatusFile } from "../src/lib/data/plane/status";
import { buildPhase, log } from "./import";

const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");
const readJson = <T,>(f: string): T | null => { try { return JSON.parse(fs.readFileSync(f, "utf8")) as T; } catch { return null; } };

export interface BootstrapReport { dir: string; files: number; bytes: number; cards: number; listed: number; thin: number; tracked: number; oracles: number; sets: number; sealed: number; problems: string[]; summary: unknown; written: number; unchanged: number; seq: number; ref: string }
export async function bootstrap(env: NodeJS.ProcessEnv = process.env, now: () => Date = () => new Date()): Promise<BootstrapReport> {
  const dir = path.resolve(env.PLANE_DIR || ".data"); const root = path.join(dir, "v1"); fs.mkdirSync(root, { recursive: true });
  const e = { ...env, IMPORT_FORCE: "1" };
  const tcgcsv = await tcgcsvStamp({ cacheDir: env.TCGCSV_CACHE_DIR || undefined }); const scryfall = await scryfallStamp({ pinnedDir: env.SCRYFALL_CACHE_DIR || undefined, mode: env.SCRYFALL_MODE === "off" ? "off" : "auto" });
  const priceDay = tcgcsv.slice(0, 10);
  const prev = readJson<PointerFile>(path.join(dir, "latest.json")), prevStatus = readJson<StatusFile>(path.join(dir, "status.json"));
  const tree = fsTree(root); const prevState = loadPrevState(tree);
  const cutDay = !prev || isCutDay(priceDay, prev.histCut);
  const before = new Map(tree.files().map((f) => [f, sha256(tree.read(f))] as const));
  const r = await buildPhase(tree, { prev, prevStatus, cutDay }, { phase: "catalog", priceDay, tcgcsv, scryfall, env: e });
  // validate like the publisher does: the phase-aware validator and the write-once rules
  const v = validateTree(tree, { phase: "catalog", prev: prevStatus?.counts ? { cards: prevStatus.counts.cards, listed: prevStatus.counts.listed, tracked: prevStatus.counts.tracked, oracles: prevStatus.counts.oracles } : null, histCut: Number(r.built.histCut.replace(/-/g, "")) });
  const problems = [...v.problems.map((p) => `${p.code}: ${p.message}`), ...writeOnceProblems(prevState, tree).map((p) => `${p.code}: ${p.message}`)];
  // the manifest, the status and the pointer (the order of publisher.ts: the pointer is the last file written)
  const files = tree.files().filter((f) => f !== "manifest.json" && f !== "status.json").map((f) => [f, tree.size(f), sha256(tree.read(f)).slice(0, 16)] as [string, number, string]);
  const manifest = JSON.stringify({ v: 1, files }); tree.write("manifest.json", manifest);
  const seq = (prev?.seq ?? 0) + 1; const at = now().toISOString();
  const ref = createHash("sha1").update(manifest).digest("hex");
  const pointer: PointerFile = nextPointer({ prev, ref, phase: "catalog", priceDay, tcgcsv, scryfall, publishedAt: at, counts: r.built.counts, manifestSha256: sha256(manifest), repo: "local/dir", histCut: r.built.histCut });
  pointer.seq = seq;
  const status: StatusFile = { ...(prevStatus ?? ({} as StatusFile)), ...r.built.status, v: 1, at, by: "publish", pointer: { seq, ref, prev: prev?.ref ?? null, publishedAt: at, priceDay, phase: "catalog", tcgcsv, scryfall, format: "v1", manifestSha256: sha256(manifest), repo: "local/dir", histCut: r.built.histCut, pvAt: prev?.pvAt ?? null } } as StatusFile;
  tree.write("status.json", JSON.stringify(status));
  fs.writeFileSync(path.join(dir, "status.json"), JSON.stringify(status));
  fs.writeFileSync(path.join(dir, "latest.json"), JSON.stringify(pointer));
  const after = tree.files(); let written = 0, unchanged = 0; for (const f of after) { if (before.get(f) === sha256(tree.read(f))) unchanged++; else written++; }
  const c = status.counts;
  return { dir, files: after.length, bytes: after.reduce((a, f) => a + tree.size(f), 0), cards: c.cards, listed: c.listed, thin: c.thin, tracked: c.tracked, oracles: c.oracles, sets: c.sets, sealed: c.sealed, problems, summary: r.summary, written, unchanged, seq, ref };
}
async function main(): Promise<void> {
  const t0 = Date.now(); const rep = await bootstrap();
  log(`bootstrap: ${rep.files} files, ${(rep.bytes / 1e6).toFixed(1)} MB in ${rep.dir} (${Math.round((Date.now() - t0) / 1000)} s); written ${rep.written}, unchanged ${rep.unchanged}`);
  log(`bootstrap: ${rep.cards} cards (${rep.listed} listed, ${rep.thin} thin), ${rep.tracked} tracked units, ${rep.oracles} oracles, ${rep.sets} sets, ${rep.sealed} sealed products`);
  const s = rep.summary as { magic?: { join: Record<string, number>; unjoinedCatalogue: number; sharedPairs: number; sharedOdd: number; etchedAnomalies: number; finishConflicts: number } };
  if (s.magic) log(`bootstrap: join ${JSON.stringify(s.magic.join)}, unjoined catalogue ${s.magic.unjoinedCatalogue}, shared pairs ${s.magic.sharedPairs}/${s.magic.sharedOdd}, etched anomalies ${s.magic.etchedAnomalies}, finish conflicts ${s.magic.finishConflicts}`);
  if (rep.problems.length) { for (const p of rep.problems.slice(0, 20)) console.error(`PROBLEM ${p}`); process.exitCode = 1; return; }
  log(`bootstrap: validated (0 problems). Serve it with PLANE_DIR=${rep.dir} npm run dev; first pages: /, /browse, /sets, /card/<slug> (slug/ shards list them)`);
}
if (process.argv[1] && /scripts[\\/]bootstrap\.ts$/.test(process.argv[1])) main().catch((e) => { console.error(e); process.exitCode = 1; });
