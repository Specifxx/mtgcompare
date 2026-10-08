// The hourly watchdog of the data repository (contract 6.6, 12.10.3). Reads the pointer, the head of the branch, the host probes, the repository size, the token's expiry, the live site's served ref and a sample of the pointed manifest, runs every alarm rule (plane/status.ts
// computeAlarms) and writes the root status.json ONLY when an alarm changed or the day changed, so the hourly run is normally a no-op. It is a writer of the data repository, so it runs in the same concurrency group as the import (queue: max) and can neither cancel nor be cancelled by one.
// It also owns the small helpers the other data jobs (squash, rollback) use to land a status-only commit.
//   npx tsx scripts/data-watchdog.ts                 # the hourly run (PLANE_REPO, DATA_REPO_TOKEN, SITE_URL, GITHUB_REPOSITORY/GITHUB_TOKEN for the keepalive age)
import fs from "node:fs";
import path from "node:path";
import { createHash, randomInt } from "node:crypto";
import { PLANE_PREFIX, type PointerFile } from "../src/lib/data/plane/formats";
import { TAG_PREFIX, seqOfTag } from "../src/lib/data/plane/publish-protocol";
import { gitIn, type Git } from "../src/lib/data/plane/publisher";
import { computeAlarms, type Alarm, type StatusFile, type WatchInput } from "../src/lib/data/plane/status";
import { authenticateGit, log, remoteOf, workRoot } from "./import";

const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");
export interface WatchDeps { fetch: typeof fetch; now: () => Date; env: NodeJS.ProcessEnv; workdir: string }

/** Check out the head of `branch` (depth 1) into `workdir` and return a git handle; the status.json and latest.json of the head. */
export function checkoutHead(remote: string, workdir: string, branch = "data"): { g: Git; pointer: PointerFile | null; status: StatusFile | null; head: string; subject: string; headAt: Date } {
  fs.rmSync(workdir, { recursive: true, force: true }); fs.mkdirSync(workdir, { recursive: true });
  const g = gitIn(workdir); g.run(["init", "-q"]); g.run(["remote", "add", "origin", remote]); g.run(["fetch", "-q", "--depth", "1", "origin", branch]); g.run(["checkout", "-q", "-B", branch, "FETCH_HEAD"]);
  const rd = <T,>(f: string): T | null => { const p = path.join(workdir, f); return fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, "utf8")) as T) : null; };
  return { g, pointer: rd<PointerFile>("latest.json"), status: rd<StatusFile>("status.json"), head: g.run(["rev-parse", "HEAD"]), subject: g.run(["log", "-1", "--format=%s"]), headAt: new Date(g.run(["log", "-1", "--format=%cI"])) };
}
/** Land a status-only commit (fast-forward only): `mutate` edits the status object in place. */
export function pushStatus(g: Git, workdir: string, branch: string, mutate: (s: StatusFile) => void, message: string): void {
  const f = path.join(workdir, "status.json"); const s = (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {}) as StatusFile; mutate(s);
  fs.writeFileSync(f, JSON.stringify(s)); g.run(["add", "-A"]); if (!g.run(["status", "--porcelain"])) return;
  g.run(["commit", "-q", "-m", message]); g.run(["push", "-q", "origin", `HEAD:refs/heads/${branch}`]);
}
const alarmKey = (a: readonly Alarm[]): string => a.map((x) => `${x.code}:${x.level}`).sort().join(",");
const ago = (d: Date, now: Date): number => (now.getTime() - d.getTime()) / 60_000;

/** The newest data commit whose seq is past the pointer's (its tag exists: publish pushes the tag with commit A), with its age; null when there is none. Only that one commit is fetched, and only then. */
export function unpointedOf(g: Git, p: PointerFile, now: Date): { sha: string; ageMinutes: number } | null {
  const out = g.run(["ls-remote", "--tags", "origin", `refs/tags/${TAG_PREFIX}*`], { allowFail: true }); let best: { name: string; sha: string; seq: number } | null = null;
  for (const l of out.split("\n").filter(Boolean)) { const [sha, ref] = l.split("\t"); if (!ref || ref.endsWith("^{}")) continue; const name = ref.replace("refs/tags/", ""); const seq = seqOfTag(name); if (seq != null && seq > p.seq && (!best || seq > best.seq)) best = { name, sha: sha!, seq }; }
  if (!best) return null;
  g.run(["fetch", "-q", "--depth", "1", "origin", `+refs/tags/${best.name}:refs/tags/${best.name}`], { allowFail: true });
  const at = g.run(["log", "-1", "--format=%cI", best.name], { allowFail: true });
  return { sha: best.sha, ageMinutes: at ? ago(new Date(at), now) : 0 };
}
async function probe(f: typeof fetch, url: string, headers: Record<string, string>, ms = 5000): Promise<{ ok: boolean; ms: number; res?: Response }> {
  const t0 = Date.now();
  for (let i = 0; i < 2; i++) { try { const res = await f(url, { headers, cache: "no-store", signal: AbortSignal.timeout(ms) } as RequestInit); if (res.ok) return { ok: true, ms: Date.now() - t0, res }; } catch { /* second attempt */ } }
  return { ok: false, ms: Date.now() - t0 };
}
/** One run of the watchdog. Returns whether a status commit was written and the alarms it computed (the tests read these). */
export async function runWatchdog(d: WatchDeps): Promise<{ wrote: boolean; alarms: Alarm[]; head: string }> {
  const { remote, repo, github } = remoteOf(d.env); const token = d.env.DATA_REPO_TOKEN; const now = d.now(); const branch = d.env.PLANE_BRANCH || "data";
  const co = checkoutHead(remote, d.workdir, branch); const p = co.pointer; const prevStatus = co.status;
  // probes: raw (the pointer file) and the contents API (the repository record: size, visibility; and the token's expiry header)
  const auth: Record<string, string> = token ? { Authorization: `token ${token}` } : {};
  let hosts: StatusFile["hosts"] = null; let repoKb: number | null = prevStatus?.repo?.kb ?? null; let isPrivate: boolean | null = prevStatus?.repo?.isPrivate ?? null; let tokenInfo: StatusFile["token"] = prevStatus?.token ?? null;
  if (github) {
    const rawP = await probe(d.fetch, `https://raw.githubusercontent.com/${repo}/${branch}/latest.json`, auth), apiP = await probe(d.fetch, `https://api.github.com/repos/${repo}`, { ...auth, Accept: "application/vnd.github+json" });
    hosts = { at: now.toISOString(), raw: { ok: rawP.ok, ms: rawP.ms }, api: { ok: apiP.ok, ms: apiP.ms } };
    if (apiP.res) {
      const body = (await apiP.res.json()) as { size?: number; private?: boolean }; repoKb = typeof body.size === "number" ? body.size : repoKb; isPrivate = typeof body.private === "boolean" ? body.private : isPrivate;
      const exp = apiP.res.headers.get("github-authentication-token-expiration"); const expiresAt = exp ? new Date(exp.replace(" UTC", "Z").replace(" ", "T")).toISOString() : tokenInfo?.expiresAt ?? null;
      tokenInfo = { expiresAt, daysLeft: expiresAt ? Math.floor((Date.parse(expiresAt) - now.getTime()) / 86_400_000) : null, checkedAt: now.toISOString() };
    }
  }
  // a data commit NEWER than the pointer that no pointer names is a crashed publish (harmless, reported after 30 minutes). Its tag d-<day>-<seq> is pushed with it, so the tags say so with no object downloaded, even when the watchdog's own status commit has since landed on top of it
  const unpointed = p ? unpointedOf(co.g, p, now) : null;
  // the live site's served ref
  let servedRef: string | null = null; let minutesSincePush: number | null = null;
  if (d.env.SITE_URL && p) { try { const origin = new URL(d.env.SITE_URL).origin; const r = await d.fetch(`${origin}/api/data-status`, { cache: "no-store", signal: AbortSignal.timeout(8000) } as RequestInit); servedRef = ((await r.json()) as { ref?: string }).ref ?? null; minutesSincePush = ago(new Date(p.publishedAt), now); } catch { /* the site is its own alarm */ } }
  // a sample of the manifest at the pointed commit (20 files)
  let manifestMismatch = false;
  if (github && p) {
    try {
      const get = async (rel: string): Promise<string> => { const r = await d.fetch(`https://raw.githubusercontent.com/${repo}/${p.ref}/${PLANE_PREFIX}/${rel}`, { headers: auth, cache: "no-store", signal: AbortSignal.timeout(8000) } as RequestInit); if (!r.ok) throw new Error(String(r.status)); return r.text(); };
      const man = JSON.parse(await get("manifest.json")) as { files: [string, number, string][] };
      const want = Math.min(20, man.files.length); const pick = new Set<number>(); while (pick.size < want) pick.add(randomInt(man.files.length));
      for (const i of pick) { const [rel, , prefix] = man.files[i]!; if (sha256(await get(rel)).slice(0, prefix.length) !== prefix) { manifestMismatch = true; break; } }
    } catch { manifestMismatch = false; }                                   // an unreadable sample is the host alarm's business, not a mismatch
  }
  // the code repository's age (the keepalive alarm)
  let mainAge: number | null = null;
  if (d.env.GITHUB_REPOSITORY && d.env.GITHUB_TOKEN) { const r = await probe(d.fetch, `https://api.github.com/repos/${d.env.GITHUB_REPOSITORY}/commits/main`, { Authorization: `Bearer ${d.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json" }); if (r.res) { const c = (await r.res.json()) as { commit?: { committer?: { date?: string } } }; const dt = c.commit?.committer?.date; if (dt) mainAge = (now.getTime() - Date.parse(dt)) / 86_400_000; } }
  const draft: StatusFile | null = prevStatus ? { ...prevStatus, hosts, token: tokenInfo, repo: { kb: repoKb, at: now.toISOString(), trend: prevStatus.repo?.trend ?? [], isPrivate, lastSquashAt: prevStatus.repo?.lastSquashAt ?? null } } : null;
  const input: WatchInput = { now, pointer: p, status: draft, headIsUnpointedDataCommit: unpointed, servedRef, minutesSincePointerPush: minutesSincePush, manifestMismatch, allowPublic: d.env.PLANE_ALLOW_PUBLIC === "1", mainLastCommitAgeDays: mainAge };
  const alarms = computeAlarms(input);
  const dayChanged = !prevStatus || prevStatus.at.slice(0, 10) !== now.toISOString().slice(0, 10);
  const changed = alarmKey(alarms) !== alarmKey(prevStatus?.alarms ?? []);
  if (!prevStatus || (!changed && !dayChanged)) return { wrote: false, alarms, head: co.head };
  pushStatus(co.g, d.workdir, branch, (s) => {
    s.at = now.toISOString(); s.by = "watchdog"; s.alarms = alarms; s.hosts = hosts ?? s.hosts ?? null; s.token = tokenInfo;
    const trend = s.repo?.trend ?? []; const day = now.toISOString().slice(0, 10);
    if (repoKb != null && trend[trend.length - 1]?.[0] !== day) trend.push([day, repoKb]);
    s.repo = { kb: repoKb, at: now.toISOString(), trend: trend.slice(-400), isPrivate, lastSquashAt: s.repo?.lastSquashAt ?? null };
  }, `status ${now.toISOString().slice(0, 16)}`);
  return { wrote: true, alarms, head: co.head };
}
async function main(): Promise<void> {
  authenticateGit();
  const r = await runWatchdog({ fetch, now: () => new Date(), env: process.env, workdir: path.join(workRoot(), "watch") });
  log(`watchdog: ${r.alarms.length} alarm(s)${r.alarms.length ? ` (${r.alarms.map((a) => `${a.code}/${a.level}`).join(", ")})` : ""}; status ${r.wrote ? "written" : "unchanged"}`);
  // an alarm is a record in status.json and the admin panel, never a red workflow of its own: the exit code stays 0
}
if (process.argv[1] && /scripts[\\/]data-watchdog\.ts$/.test(process.argv[1])) main().catch((e) => { console.error(e); process.exitCode = 1; });
