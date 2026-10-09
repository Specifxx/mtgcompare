// src/lib/data/plane/publisher.ts (owner WP01b, FROZEN). THE GIT SIDE of the publish protocol, written once and exercised against a LOCAL BARE REPOSITORY by tests/plane-publish.test.ts (the same code pushes to the private data repository
// from Actions, with DATA_REPO_TOKEN in the remote URL or an http extraheader). Protocol (section 6.4):
//   1. clone depth 1 (the previous published state)        2. build into v1/ (byte-compare writes; membership reconciled for phase `catalog`)
//   3. validate (phase-aware, fail closed)                  4. commit A + tag d-<day>-<seq>, push FAST-FORWARD ONLY (a second writer is rejected)
//   5. verify through the site's own door (injected)        6. pointer commit B, pushed LAST: THE atomic switch
// A refusal pushes ONLY a status commit and leaves latest.json untouched. A crash anywhere before step 6 changes nothing for readers.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { PointerFile } from "./formats";
import { PLANE_PREFIX } from "./formats";
import { loadPrevState, writeOnceProblems, type PrevState } from "./prevstate";
import { STATE_BRANCH, exportState, parseState, type StateFiles } from "./state-backup";
import { deltaPath, historyDelta } from "./history-delta";
import { isCutDay, nextPointer, planSquash, rollbackTarget, seqOfTag, tagName, TAG_PREFIX, type TagInfo } from "./publish-protocol";
import { fsTree, type MutableTree, type TreeView } from "./tree";
import { validateOverlay, validateTree, type Phase, type Problem } from "./validate";
import { buildAndValidate, manifestOf, readPointer, readStatus, refusalStatus, sha256, type PublishOutcome } from "./publish-common";
import type { NeonStore } from "./neon-store";
import type { StatusFile } from "./status";

export class GitError extends Error { constructor(public args: string[], public code: number | null, public stderr: string) { super(`git ${args.join(" ")} -> ${code}: ${stderr.slice(0, 300)}`); } }
export interface Git { run(args: string[], o?: { allowFail?: boolean }): string }
export function gitIn(cwd: string, env: Record<string, string> = {}): Git {
  const base = { GIT_AUTHOR_NAME: "mtgcompare-data", GIT_AUTHOR_EMAIL: "data@invalid", GIT_COMMITTER_NAME: "mtgcompare-data", GIT_COMMITTER_EMAIL: "data@invalid", GIT_TERMINAL_PROMPT: "0", ...env };
  return { run(args, o) { const r = spawnSync("git", args, { cwd, env: { ...process.env, ...base }, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }); if (r.status !== 0 && !o?.allowFail) throw new GitError(args, r.status, r.stderr); return r.stdout.trim(); } };
}

export interface PublishInput {
  remote: string; workdir: string; branch?: string; phase: Phase | "overlay"; priceDay: string; tcgcsv: string; scryfall: string; repo: string; now?: () => Date;
  /** Writes today's files into the tree. For `catalog` it must call reconcileStoreFamilies first; for `overlay` it may touch pv/ only. Returns the pieces of the pointer and status that only the builder knows. */
  build(tree: MutableTree, ctx: { prev: PointerFile | null; prevStatus: StatusFile | null; cutDay: boolean }): Promise<{ counts: PointerFile["counts"]; histCut: string; status: Partial<StatusFile>; prevCounts?: { cards: number; listed: number; tracked: number; oracles: number } | null }>;
  verify?(ref: string): Promise<void>;
  /** Test hooks: a thrown error simulates a crash at that point. */
  hooks?: { afterCommitA?(ref: string): void; beforePush?(): void; /** Neon only: after each committed batch of staged rows (the crash tests throw from it). */ afterBatch?(n: number): void };
  /** The second copy of the write-once state on the append-only branch `state` (state-backup.ts). On by default. */
  stateBackup?: boolean; onStateBackupError?(e: Error): void;
  /** The Neon transport (DECISIONS.md, 2026-10-09): when set, `remote` and the git steps are not used at all and the publish goes through publisher-neon.ts. `workdir` is still the scratch directory the tree is materialised into. */
  store?: NeonStore;
}
export type { PublishOutcome } from "./publish-common";

function clone(i: { remote: string; workdir: string; branch: string }): Git {
  fs.rmSync(i.workdir, { recursive: true, force: true }); fs.mkdirSync(i.workdir, { recursive: true });
  const g = gitIn(i.workdir);
  const probe = gitIn(i.workdir).run(["ls-remote", "--heads", i.remote, i.branch], { allowFail: true });
  if (probe) { g.run(["clone", "--depth", "1", "--single-branch", "--branch", i.branch, i.remote, "."]); g.run(["fetch", "--tags", "--depth", "1", "origin"], { allowFail: true }); }
  else { g.run(["init", "-q"]); g.run(["checkout", "-q", "--orphan", i.branch]); g.run(["remote", "add", "origin", i.remote]); }
  return g;
}
/** One publish (phase catalog or full) or one overlay. */
export async function publish(i: PublishInput): Promise<PublishOutcome> {
  if (i.store) return (await import("./publisher-neon")).publishNeon(i, i.store);
  const branch = i.branch ?? "data", now = i.now ?? (() => new Date());
  const g = clone({ remote: i.remote, workdir: i.workdir, branch });
  const prev = readPointer(i.workdir), prevStatus = readStatus(i.workdir);
  const { tree, seq, built, problems, prevState, cutDay } = await buildAndValidate(i, i.workdir, prev, prevStatus);
  if (problems.length) {                                                           // REFUSAL: discard the tree, push a status-only commit, leave latest.json alone
    g.run(["checkout", "--", "."], { allowFail: true }); g.run(["clean", "-fdq", "--", PLANE_PREFIX], { allowFail: true });
    const st = refusalStatus(prevStatus, problems, seq, i.priceDay, now());
    fs.writeFileSync(path.join(i.workdir, "status.json"), JSON.stringify(st)); g.run(["add", "-A"]); g.run(["commit", "-q", "-m", `data refusal ${i.priceDay} ${seq}`]); g.run(["push", "-q", "origin", `HEAD:refs/heads/${branch}`]);
    return { kind: "refused", problems, seq };
  }
  const man = manifestOf(tree); tree.write("manifest.json", man.text);
  const phase: "catalog" | "full" = i.phase === "overlay" ? (prev?.phase ?? "full") : i.phase;
  const publishedAt = i.phase === "overlay" ? (prev?.publishedAt ?? now().toISOString()) : now().toISOString();
  const pre = { seq, ref: "" /* the sha of THIS commit cannot be inside it */, prev: prev?.ref ?? null, publishedAt, priceDay: i.phase === "overlay" ? (prev?.priceDay ?? i.priceDay) : i.priceDay, phase, tcgcsv: i.phase === "overlay" ? (prev?.tcgcsv ?? i.tcgcsv) : i.tcgcsv, scryfall: i.phase === "overlay" ? (prev?.scryfall ?? i.scryfall) : i.scryfall, format: "v1" as const, manifestSha256: sha256(man.text), repo: i.repo, histCut: built.histCut, pvAt: i.phase === "overlay" ? now().toISOString() : (prev?.pvAt ?? null) };
  const status: StatusFile = { ...(prevStatus ?? ({} as StatusFile)), ...built.status, v: 1, at: now().toISOString(), by: i.phase === "overlay" ? "overlay" : "publish", pointer: pre } as StatusFile;
  tree.write("status.json", JSON.stringify(status));
  g.run(["add", "-A"]); g.run(["commit", "-q", "--allow-empty", "-m", `data ${i.priceDay} ${seq} ${i.phase}`]);
  const ref = g.run(["rev-parse", "HEAD"]); g.run(["tag", "-f", tagName(i.priceDay, seq), ref]);
  i.hooks?.beforePush?.();
  g.run(["push", "-q", "origin", `${ref}:refs/heads/${branch}`]);                  // fast-forward only: a second writer is REJECTED (no --force)
  g.run(["push", "-q", "--force", "origin", `refs/tags/${tagName(i.priceDay, seq)}`]);       // a tag left by a crashed run of this seq names an unpointed commit: moving it is safe
  i.hooks?.afterCommitA?.(ref);
  await i.verify?.(ref);
  const pointer = nextPointer({ prev, ref, phase, priceDay: pre.priceDay, tcgcsv: pre.tcgcsv, scryfall: pre.scryfall, publishedAt, counts: built.counts, manifestSha256: pre.manifestSha256, repo: i.repo, histCut: built.histCut, pvAt: pre.pvAt });
  fs.writeFileSync(path.join(i.workdir, "latest.json"), JSON.stringify(pointer)); fs.writeFileSync(path.join(i.workdir, "status.json"), JSON.stringify({ ...status, pointer: { ...pre, ref } }));
  g.run(["add", "-A"]); g.run(["commit", "-q", "-m", `pointer ${pointer.seq} ${ref.slice(0, 7)}`]); g.run(["push", "-q", "origin", `HEAD:refs/heads/${branch}`]);
  if (i.phase !== "overlay" && i.stateBackup !== false) { try { pushState(i.remote, `${i.workdir}-state`, { ...exportState(loadPrevState(tree)), [deltaPath(Number(i.priceDay.replace(/-/g, "")))]: JSON.stringify(historyDelta(tree, Number(i.priceDay.replace(/-/g, "")), cutDay || !prev)) + "\n" }, `state ${i.priceDay} ${pointer.seq}`); } catch (e) { i.onStateBackupError?.(e as Error); } }   // best effort: a failed backup never fails or delays a publish (the watchdog's alarm is the net)
  return { kind: "published", ref, seq: pointer.seq, pointer };
}
export function listTags(g: Git): TagInfo[] {
  const out = g.run(["for-each-ref", "--format=%(refname:short)|%(objectname)|%(creatordate:iso-strict)", `refs/tags/${TAG_PREFIX}*`], { allowFail: true });
  return out ? out.split("\n").map((l) => { const [name, sha, at] = l.split("|"); return { name: name!, sha: sha!, at: new Date(at!) }; }) : [];
}
export interface SquashOutcome { skipped: string | null; deleted: string[]; newHead?: string }
/** The weekly squash: a parentless commit with the current tree, force-updated onto the branch; the tags of pointer.ref and pointer.prev survive (planSquash). The API-created variant (POST /git/commits with parents [] then PATCH the ref) uploads no objects and is
 *  preferred in Actions; this plain-push form is the fallback and costs one extra tree upload a week (measured +53 MB on the S3 tree). */
export function squash(i: { remote: string; workdir: string; branch?: string; now?: () => Date }): SquashOutcome {
  const branch = i.branch ?? "data", now = i.now ?? (() => new Date());
  fs.rmSync(i.workdir, { recursive: true, force: true }); fs.mkdirSync(i.workdir, { recursive: true });
  const g = gitIn(i.workdir); g.run(["init", "-q"]); g.run(["remote", "add", "origin", i.remote]);
  g.run(["fetch", "-q", "origin", branch]); const headSha = g.run(["rev-parse", "FETCH_HEAD"]);                      // FETCH_HEAD is overwritten by every later fetch: take the sha now
  g.run(["fetch", "-q", "origin", "+refs/tags/*:refs/tags/*"], { allowFail: true });
  g.run(["checkout", "-q", "-B", branch, headSha]);
  const pointer = readPointer(i.workdir); const tags = listTags(g);
  const plan = planSquash({ now: now(), tags, pointer });
  if (plan.skip) return { skipped: plan.skip, deleted: [] };
  const tree = g.run(["rev-parse", "HEAD^{tree}"]);
  const root = g.run(["commit-tree", tree, "-m", `data squash ${now().toISOString().slice(0, 10)}`]);
  for (const t of plan.deleteTags) g.run(["push", "-q", "origin", `:refs/tags/${t}`], { allowFail: true });
  g.run(["push", "-q", "--force", "origin", `${root}:refs/heads/${branch}`]);
  return { skipped: null, deleted: plan.deleteTags, newHead: root };
}
/** Rollback = ONE new pointer commit that names an older data commit. Needs the old commit to be fetchable by sha (a retained tag). */
export function rollback(i: { remote: string; workdir: string; to: string | number; branch?: string; now?: () => Date }): PointerFile {
  const branch = i.branch ?? "data", now = i.now ?? (() => new Date());
  fs.rmSync(i.workdir, { recursive: true, force: true }); fs.mkdirSync(i.workdir, { recursive: true });
  const g = gitIn(i.workdir); g.run(["init", "-q"]); g.run(["remote", "add", "origin", i.remote]); g.run(["fetch", "-q", "origin", branch]); const headSha = g.run(["rev-parse", "FETCH_HEAD"]); g.run(["fetch", "-q", "origin", "+refs/tags/*:refs/tags/*"], { allowFail: true }); g.run(["checkout", "-q", "-B", branch, headSha]);
  const cur = readPointer(i.workdir); if (!cur) throw new Error("no pointer to roll back from");
  const t = rollbackTarget({ to: i.to, tags: listTags(g) }); if (!t) throw new Error(`no retained data commit for ${String(i.to)}`);
  const oldStatus = JSON.parse(g.run(["show", `${t.sha}:${PLANE_PREFIX}/status.json`])) as StatusFile;
  const manifest = g.run(["show", `${t.sha}:${PLANE_PREFIX}/manifest.json`]);
  const p: PointerFile = { ...cur, seq: cur.seq + 1, ref: t.sha, prev: cur.ref, publishedAt: now().toISOString(), phase: oldStatus.pointer?.phase ?? cur.phase, priceDay: oldStatus.pointer?.priceDay ?? cur.priceDay, tcgcsv: oldStatus.pointer?.tcgcsv ?? cur.tcgcsv, scryfall: oldStatus.pointer?.scryfall ?? cur.scryfall, manifestSha256: sha256(manifest), histCut: oldStatus.pointer?.histCut ?? cur.histCut, counts: { cards: oldStatus.counts?.cards ?? cur.counts.cards, units: oldStatus.counts?.tracked ?? cur.counts.units, files: oldStatus.counts?.files ?? cur.counts.files } };
  fs.writeFileSync(path.join(i.workdir, "latest.json"), JSON.stringify(p)); g.run(["add", "-A"]); g.run(["commit", "-q", "-m", `pointer ${p.seq} rollback to ${seqOfTag(t.name) ?? t.sha.slice(0, 7)}`]); g.run(["push", "-q", "origin", `HEAD:refs/heads/${branch}`]);
  return p;
}

/** Append the state to branch `state` of `remote` (orphan on first use; fast-forward only; a commit only when a byte changed). Returns whether a commit was pushed. */
export function pushState(remote: string, workdir: string, files: Record<string, string>, message: string): boolean {
  fs.rmSync(workdir, { recursive: true, force: true }); fs.mkdirSync(workdir, { recursive: true });
  const g = gitIn(workdir); const has = g.run(["ls-remote", "--heads", remote, STATE_BRANCH], { allowFail: true });
  if (has) g.run(["clone", "-q", "--depth", "1", "--single-branch", "--branch", STATE_BRANCH, remote, "."]); else { g.run(["init", "-q"]); g.run(["checkout", "-q", "--orphan", STATE_BRANCH]); g.run(["remote", "add", "origin", remote]); }
  for (const [name, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(workdir, name)), { recursive: true }); fs.writeFileSync(path.join(workdir, name), text); }
  g.run(["add", "-A"]); if (!g.run(["status", "--porcelain"])) return false;
  g.run(["commit", "-q", "-m", message]); g.run(["push", "-q", "origin", `HEAD:refs/heads/${STATE_BRANCH}`]); return true;
}
/** Restore the write-once state when branch `data` is lost: the importer starts from this PrevState (hysteresis restarts from scratch; no URL changes). null when the repository has no `state` branch. */
export function restoreState(remote: string, workdir: string): PrevState | null {
  fs.rmSync(workdir, { recursive: true, force: true }); fs.mkdirSync(workdir, { recursive: true });
  const g = gitIn(workdir); if (!g.run(["ls-remote", "--heads", remote, STATE_BRANCH], { allowFail: true })) return null;
  g.run(["clone", "-q", "--depth", "1", "--single-branch", "--branch", STATE_BRANCH, remote, "."]);
  const read = (n: keyof StateFiles): string => fs.readFileSync(path.join(workdir, n), "utf8");
  return parseState({ "slugs.tsv": read("slugs.tsv"), "oracles.tsv": read("oracles.tsv"), "sets.tsv": read("sets.tsv")});
}

/** Every daily delta file on the `state` branch, for scripts/history-rebuild.ts. */
export function readDeltas(remote: string, workdir: string): import("./history-delta").DeltaFile[] {
  fs.rmSync(workdir, { recursive: true, force: true }); fs.mkdirSync(workdir, { recursive: true });
  const g = gitIn(workdir); if (!g.run(["ls-remote", "--heads", remote, STATE_BRANCH], { allowFail: true })) return [];
  g.run(["clone", "-q", "--depth", "1", "--single-branch", "--branch", STATE_BRANCH, remote, "."]);
  const out: import("./history-delta").DeltaFile[] = []; const walk = (d: string): void => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== ".git") walk(f); } else if (/^\d{4}-\d{2}-\d{2}\.json$/.test(e.name)) out.push(JSON.parse(fs.readFileSync(f, "utf8"))); } };
  walk(path.join(workdir, "d")); return out.sort((a, b) => a.day - b.day);
}
