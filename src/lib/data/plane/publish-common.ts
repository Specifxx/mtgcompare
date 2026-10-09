// src/lib/data/plane/publish-common.ts (owner WP01b). The parts of the publish protocol that do not depend on the transport (git: publisher.ts, Neon: publisher-neon.ts): the checkout readers, the manifest, the build + phase-aware validation + write-once check, the refusal status.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { PointerFile } from "./formats";
import { PLANE_PREFIX } from "./formats";
import { loadPrevState, writeOnceProblems, type PrevState } from "./prevstate";
import { isCutDay } from "./publish-protocol";
import { fsTree, type MutableTree, type TreeView } from "./tree";
import { validateOverlay, validateTree, type Problem } from "./validate";
import type { StatusFile } from "./status";
import type { PublishInput } from "./publisher";

export type PublishOutcome = { kind: "published"; ref: string; seq: number; pointer: PointerFile } | { kind: "refused"; problems: Problem[]; seq: number };
export const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");
export function readPointer(dir: string): PointerFile | null { const f = path.join(dir, "latest.json"); return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, "utf8")) as PointerFile) : null; }
export function readStatus(dir: string): StatusFile | null { const f = path.join(dir, "status.json"); return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, "utf8")) as StatusFile) : null; }
/** The manifest lists the data files. status.json is written AFTER it (it carries the manifest's own hash) and the checkout still holds the previous commit's copy, so listing it would pin a stale hash that the verification step (a random sample of the manifest) and the watchdog would flag. */
export function manifestOf(tree: TreeView): { text: string; files: number; bytes: number } {
  const files = tree.files().filter((f) => f !== "manifest.json" && f !== "status.json").map((f) => [f, tree.size(f), sha256(tree.read(f)).slice(0, 16)] as [string, number, string]);
  const text = JSON.stringify({ v: 1, files }); return { text, files: files.length + 2, bytes: files.reduce((a, f) => a + f[1], 0) };
}

/** Steps 2 and 3 of the protocol, identical on every transport: build into <workdir>/v1 (the previous published tree is already there), validate (phase-aware, fail closed), check the write-once rules against the importer's memory. A non-empty `problems` is a refusal. */
export async function buildAndValidate(i: PublishInput, workdir: string, prev: PointerFile | null, prevStatus: StatusFile | null): Promise<{ tree: MutableTree; seq: number; built: Awaited<ReturnType<PublishInput["build"]>>; problems: Problem[]; prevState: PrevState | null; cutDay: boolean }> {
  const seq = (prev?.seq ?? 0) + 1;
  const root = path.join(workdir, PLANE_PREFIX); fs.mkdirSync(root, { recursive: true });
  const tree = fsTree(root);
  const before = i.phase === "overlay" ? new Map(tree.files().map((f) => [f, tree.read(f)] as const)) : null;
  const prevState = i.phase === "overlay" ? null : loadPrevState(tree);                                  // the importer's memory, from the checkout (6.2); the write-once rules are checked against it below
  const cutDay = i.phase !== "overlay" && isCutDay(i.priceDay, prev?.histCut ?? null);
  const built = await i.build(tree, { prev, prevStatus, cutDay });
  // the manifest and the v1/status.json copy are bookkeeping of THIS commit
  const problems: Problem[] = i.phase === "overlay"
    ? validateOverlay({ files: () => [...before!.keys()], read: (f) => before!.get(f)!, size: (f) => Buffer.byteLength(before!.get(f)!), has: (f) => before!.has(f) }, tree)
    : validateTree(tree, { phase: i.phase, prev: built.prevCounts ?? (prevStatus?.counts ? { cards: prevStatus.counts.cards, listed: prevStatus.counts.listed, tracked: prevStatus.counts.tracked, oracles: prevStatus.counts.oracles } : null), histCut: Number(built.histCut.replace(/-/g, "")) }).problems;
  if (prevState) for (const w of writeOnceProblems(prevState, tree)) problems.push({ code: w.code, message: w.message });
  return { tree, seq, built, problems, prevState, cutDay };
}
/** The status-only record of a refusal; the pointer is untouched. */
export function refusalStatus(prevStatus: StatusFile | null, problems: Problem[], seq: number, priceDay: string, at: Date): StatusFile {
  const iso = at.toISOString();
  void priceDay;
  return { ...(prevStatus ?? ({} as StatusFile)), v: 1, at: iso, by: "refusal", refusals: [{ at: iso, seq, code: problems[0]!.code, message: problems[0]!.message.slice(0, 240) }, ...(prevStatus?.refusals ?? [])].slice(0, 20), runs: [{ at: iso, kind: "refused" as const, ok: false, seconds: 0, note: problems[0]!.message.slice(0, 200), errors: problems.slice(0, 5).map((p) => p.message) }, ...(prevStatus?.runs ?? [])].slice(0, 30) };
}
export type { TreeView };
