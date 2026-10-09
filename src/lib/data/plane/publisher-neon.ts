// src/lib/data/plane/publisher-neon.ts (owner WP01b). THE NEON SIDE of the publish protocol (DECISIONS.md, 2026-10-09). The same six steps as publisher.ts with a different transport; everything that decides (build, phase-aware validation, write-once rules, the refusal, the manifest,
// the pointer, the state backup) is the same code (publish-common.ts, publish-protocol.ts):
//   1. pull the current tree into the scratch directory (one repeatable-read transaction)     2. build into v1/ (byte-compare writes; membership reconciled for phase `catalog`)
//   3. validate (phase-aware, fail closed)        4. "commit A": upload ONLY the files whose sha changed under stage/<path> (batches of 150 rows / 6 MB, one transaction each)
//   5. verify: read the staged shas back and compare (plus the injected `verify`, none for Neon)       6. "commit B": ONE transaction that deletes the superseded and removed rows, renames the staged ones into place and writes status.json, then latest.json LAST.
// A refusal writes ONLY the status row. A crash or a failed batch anywhere before step 6 leaves the previous tree serving whole (the stage/ rows are garbage that the next publish clears). Unchanged files are never rewritten.
import type { PointerFile } from "./formats";
import { PLANE_PREFIX } from "./formats";
import { loadPrevState } from "./prevstate";
import { STATE_PREFIX, NEON_REPO, POINTER_ROW, STATUS_ROW, TREE_PREFIX, sha256Hex, type NeonStore } from "./neon-store";
import { exportState, parseState } from "./state-backup";
import type { PrevState } from "./prevstate";
import type { DeltaFile } from "./history-delta";
import { deltaPath, historyDelta } from "./history-delta";
import { nextPointer } from "./publish-protocol";
import { buildAndValidate, manifestOf, readPointer, readStatus, refusalStatus, sha256, type PublishOutcome } from "./publish-common";
import type { PublishInput } from "./publisher";
import type { StatusFile } from "./status";

export const DELTA_KEEP_DAYS = 400;
/** The ref of a Neon-backed publish: a 40-hex digest of the manifest and the sequence (a git sha names a commit; here nothing is a commit, but the pointer format and the memo keys want the same shape). */
export const neonRef = (manifestText: string, seq: number): string => sha256(`${manifestText}:${seq}`).slice(0, 40);

export async function publishNeon(i: PublishInput, store: NeonStore): Promise<PublishOutcome> {
  const now = i.now ?? (() => new Date());
  await store.ensureSchema(); await store.clearStage();
  const pulled = await store.pullTo(i.workdir, { clean: true });
  const current = new Map([...pulled.files].filter(([p]) => p.startsWith(TREE_PREFIX)));
  const prev = readPointer(i.workdir), prevStatus = readStatus(i.workdir);
  const { tree, seq, built, problems, cutDay } = await buildAndValidate(i, i.workdir, prev, prevStatus);
  if (problems.length) {                                                             // REFUSAL: nothing is staged, the pointer row stays, only the status row records it
    await store.put(STATUS_ROW, JSON.stringify(refusalStatus(prevStatus, problems, seq, i.priceDay, now())));
    return { kind: "refused", problems, seq };
  }
  const man = manifestOf(tree); tree.write("manifest.json", man.text);
  const phase: "catalog" | "full" = i.phase === "overlay" ? (prev?.phase ?? "full") : i.phase;
  const publishedAt = i.phase === "overlay" ? (prev?.publishedAt ?? now().toISOString()) : now().toISOString();
  const pre = { seq, ref: "" as string, prev: prev?.ref ?? null, publishedAt, priceDay: i.phase === "overlay" ? (prev?.priceDay ?? i.priceDay) : i.priceDay, phase, tcgcsv: i.phase === "overlay" ? (prev?.tcgcsv ?? i.tcgcsv) : i.tcgcsv, scryfall: i.phase === "overlay" ? (prev?.scryfall ?? i.scryfall) : i.scryfall, format: "v1" as const, manifestSha256: sha256(man.text), repo: NEON_REPO, histCut: built.histCut, pvAt: i.phase === "overlay" ? now().toISOString() : (prev?.pvAt ?? null) };
  const status: StatusFile = { ...(prevStatus ?? ({} as StatusFile)), ...built.status, v: 1, at: now().toISOString(), by: i.phase === "overlay" ? "overlay" : "publish", pointer: pre } as StatusFile;
  tree.write("status.json", JSON.stringify(status));
  // what changed: by sha, so an unchanged file is never rewritten and a removed one is deleted
  const uploads: [string, string][] = [], expect = new Map<string, string>(), live = new Set<string>();
  for (const f of tree.files()) { const p = `${PLANE_PREFIX}/${f}`; live.add(p); const text = tree.read(f), sha = sha256Hex(text); if (current.get(p) !== sha) { uploads.push([p, text]); expect.set(p, sha); } }
  const removed = [...current.keys()].filter((p) => !live.has(p));
  const drop = [...uploads.map(([p]) => p).filter((p) => current.has(p)), ...removed];
  const ref = neonRef(man.text, seq);
  i.hooks?.beforePush?.();
  await store.stage(uploads, (n) => i.hooks?.afterBatch?.(n));                       // a failure here leaves stage/ rows and the old tree
  const staged = await store.staged();
  const bad = [...expect].filter(([p, sha]) => staged.get(p) !== sha).map(([p]) => p);
  if (bad.length || staged.size !== expect.size) throw new Error(`verification of the staged rows failed: ${bad.length} differ (${bad.slice(0, 3).join(", ")}), ${staged.size} staged of ${expect.size}`);
  i.hooks?.afterCommitA?.(ref);
  await i.verify?.(ref);
  const pointer: PointerFile = nextPointer({ prev, ref, phase, priceDay: pre.priceDay, tcgcsv: pre.tcgcsv, scryfall: pre.scryfall, publishedAt, counts: built.counts, manifestSha256: pre.manifestSha256, repo: NEON_REPO, histCut: built.histCut, pvAt: pre.pvAt });
  await store.flip({ drop, small: [[STATUS_ROW, JSON.stringify({ ...status, pointer: { ...pre, ref } })], [POINTER_ROW, JSON.stringify(pointer)]] });   // the pointer row is the LAST statement of the transaction
  if (i.phase !== "overlay" && i.stateBackup !== false) {
    try {
      const day = Number(i.priceDay.replace(/-/g, ""));
      await store.writeState({ ...exportState(loadPrevState(tree)), [deltaPath(day)]: JSON.stringify(historyDelta(tree, day, cutDay || !prev)) + "\n" });
      await pruneDeltas(store, i.priceDay);
    } catch (e) { i.onStateBackupError?.(e as Error); }                              // best effort: a failed backup never fails or delays a publish
  }
  return { kind: "published", ref, seq: pointer.seq, pointer };
}
/** Deltas older than DELTA_KEEP_DAYS go (a rebuild starts at the latest full file, written every 28 days). */
async function pruneDeltas(store: NeonStore, priceDay: string): Promise<void> {
  const cutoff = Date.parse(`${priceDay}T00:00:00Z`) - DELTA_KEEP_DAYS * 86_400_000; const old: string[] = [];
  for (const p of (await store.shas(`${STATE_PREFIX}d/`)).keys()) { const m = /(\d{4}-\d{2}-\d{2})\.json$/.exec(p); if (m && Date.parse(`${m[1]}T00:00:00Z`) < cutoff) old.push(p); }
  await store.delete(old);
}

/** Neon twin of restoreState (publisher.ts): the write-once state when the tree is lost. null when no state was ever backed up. */
export async function restoreStateNeon(store: NeonStore): Promise<PrevState | null> {
  const s = await store.readState(); if (!s["slugs.tsv"] || !s["oracles.tsv"] || !s["sets.tsv"]) return null;
  return parseState({ "slugs.tsv": s["slugs.tsv"], "oracles.tsv": s["oracles.tsv"], "sets.tsv": s["sets.tsv"] });
}
/** Neon twin of readDeltas (publisher.ts), for scripts/history-rebuild.ts. */
export async function readDeltasNeon(store: NeonStore): Promise<DeltaFile[]> {
  const s = await store.readState();
  return Object.entries(s).filter(([n]) => /^d\/.*\d{4}-\d{2}-\d{2}\.json$/.test(n)).map(([, t]) => JSON.parse(t) as DeltaFile).sort((a, b) => a.day - b.day);
}
