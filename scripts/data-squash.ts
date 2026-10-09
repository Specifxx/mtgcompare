// The weekly squash (Sunday 23:50 UTC): the branch `data` becomes ONE parentless commit with the current tree, and the d-* tags older than 7 days are deleted EXCEPT the tags of latest.json's `ref` and `prev`; the job refuses to run when the pointer is older than
// 5 days (plane/publish-protocol.ts planSquash, critique DP-11). It prefers the commit created on the server (POST git/commits with parents [] and PATCH refs: no objects are uploaded) and falls back to a plain force push (one extra tree upload a week).
//   npx tsx scripts/data-squash.ts
import fs from "node:fs";
import path from "node:path";
import { listTags, squash, gitIn } from "../src/lib/data/plane/publisher";
import { planSquash } from "../src/lib/data/plane/publish-protocol";
import type { PointerFile } from "../src/lib/data/plane/formats";
import { authenticateGit, log, remoteOf, workRoot } from "./import";
import { planeBackend } from "../src/lib/data/plane/backend";
import { checkoutHead, pushStatus } from "./data-watchdog";

/** The API-created parentless commit: needs the tree sha only, so nothing is uploaded. Returns the new head sha, or null when the API refuses (the caller falls back to the plain push). */
export async function apiSquash(repo: string, branch: string, token: string, f: typeof fetch, message: string): Promise<string | null> {
  const api = (p: string, init?: RequestInit): Promise<Response> => f(`https://api.github.com/repos/${repo}/${p}`, { ...init, headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  try {
    const ref = await api(`git/ref/heads/${branch}`); if (!ref.ok) return null; const sha = ((await ref.json()) as { object: { sha: string } }).object.sha;
    const com = await api(`git/commits/${sha}`); if (!com.ok) return null; const tree = ((await com.json()) as { tree: { sha: string } }).tree.sha;
    const created = await api("git/commits", { method: "POST", body: JSON.stringify({ message, tree, parents: [] }) }); if (!created.ok) return null; const root = ((await created.json()) as { sha: string }).sha;
    const moved = await api(`git/refs/heads/${branch}`, { method: "PATCH", body: JSON.stringify({ sha: root, force: true }) }); return moved.ok ? root : null;
  } catch { return null; }
}
export interface SquashRun { skipped: string | null; deleted: string[]; mode: "api" | "push" | "skipped" }
export async function runSquash(env: NodeJS.ProcessEnv = process.env, o: { f?: typeof fetch; now?: () => Date; workdir?: string } = {}): Promise<SquashRun> {
  if (planeBackend(env) === "neon") { const m = "the Neon-backed plane stores only the current tree (changed files are upserted, removed paths deleted): there is no history to squash (PLANE_BACKEND=github keeps this job)"; log(`squash: skipped: ${m}`); return { skipped: m, deleted: [], mode: "skipped" }; }
  const { remote, repo, github } = remoteOf(env); const branch = env.PLANE_BRANCH || "data"; const now = o.now ?? (() => new Date()); const f = o.f ?? fetch;
  const work = o.workdir ?? path.join(workRoot(env), "squash");
  // the plan first (the same fetch squash() does), so the API path can be tried before any push
  fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
  const g = gitIn(work); g.run(["init", "-q"]); g.run(["remote", "add", "origin", remote]); g.run(["fetch", "-q", "origin", branch]); const head = g.run(["rev-parse", "FETCH_HEAD"]);
  g.run(["fetch", "-q", "origin", "+refs/tags/*:refs/tags/*"], { allowFail: true }); g.run(["checkout", "-q", "-B", branch, head]);
  const pointer = fs.existsSync(path.join(work, "latest.json")) ? (JSON.parse(fs.readFileSync(path.join(work, "latest.json"), "utf8")) as PointerFile) : null;
  const plan = planSquash({ now: now(), tags: listTags(g), pointer });
  if (plan.skip) { log(`squash: skipped: ${plan.skip}`); return { skipped: plan.skip, deleted: [], mode: "skipped" }; }
  let mode: SquashRun["mode"] = "push"; let deleted = plan.deleteTags;
  const via = github && env.DATA_REPO_TOKEN ? await apiSquash(repo, branch, env.DATA_REPO_TOKEN, f, `data squash ${now().toISOString().slice(0, 10)}`) : null;
  if (via) { mode = "api"; for (const t of plan.deleteTags) g.run(["push", "-q", "origin", `:refs/tags/${t}`], { allowFail: true }); }
  else { const r = squash({ remote, workdir: `${work}-push`, branch, now }); deleted = r.deleted; }
  log(`squash: ${mode === "api" ? "created on the server (nothing uploaded)" : "force-pushed a parentless commit"}; ${deleted.length} tag(s) deleted, ${plan.keepTags.length} kept`);
  const co = checkoutHead(remote, `${work}-status`, branch);
  pushStatus(co.g, `${work}-status`, branch, (s) => { s.at = now().toISOString(); s.by = "squash"; s.repo = { ...(s.repo ?? { kb: null, at: now().toISOString(), trend: [], isPrivate: null }), lastSquashAt: now().toISOString() } as never; s.runs = [{ at: now().toISOString(), kind: "squash" as const, ok: true, seconds: 0, note: `${deleted.length} tag(s) deleted via ${mode}` }, ...(s.runs ?? [])].slice(0, 30); }, `status squash ${now().toISOString().slice(0, 10)}`);
  return { skipped: null, deleted, mode };
}
if (process.argv[1] && /scripts[\\/]data-squash\.ts$/.test(process.argv[1])) { if (planeBackend() === "github") authenticateGit(); runSquash().catch((e) => { console.error(e); process.exitCode = 1; }); }
