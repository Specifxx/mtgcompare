// Is this repo's engine the same as its sister repos'? (engine.json lists the
// engine paths and the repos.) Compares git blob ids, so it needs no checkout of
// the others: one GitHub tree call per engine directory per repo, plus each
// package.json. Run by .github/workflows/engine-drift.yml:
//   on a pull request: prints what the sisters' main would need (never fails;
//                      the first of three PRs is always "ahead" of the others)
//   weekly:            fails the run, so GitHub emails the owner, when main
//                      still differs from a sister's main
//   npx tsx scripts/engine-drift.ts [--strict] [../sister-checkout ...]
// With checkout paths it compares against their HEAD instead of GitHub.
import { execFileSync } from "node:child_process";
import fs from "node:fs";

type Manifest = { repos: string[]; paths: string[]; exclude: string[]; packageFields: string[] };
const manifest = JSON.parse(fs.readFileSync("engine.json", "utf8")) as Manifest;
const strict = process.argv.includes("--strict");
const token = process.env.GITHUB_TOKEN;
const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "engine-drift" };
if (token) headers.Authorization = `Bearer ${token}`;

const isEngine = (p: string) => manifest.paths.some((e) => p === e || p.startsWith(`${e}/`)) && !manifest.exclude.includes(p);

const checkouts = process.argv.slice(2).filter((a) => !a.startsWith("--"));

function localBlobs(cwd = "."): Map<string, string> {
  const out = new Map<string, string>();
  const ls = execFileSync("git", ["ls-tree", "-r", "HEAD", "--", ...manifest.paths], { cwd, encoding: "utf8" });
  for (const line of ls.split("\n").filter(Boolean)) {
    const [meta, p] = line.split("\t");
    if (isEngine(p)) out.set(p, meta.split(" ")[2]);
  }
  return out;
}

async function gh<T>(url: string): Promise<T> {
  const r = await fetch(`https://api.github.com${url}`, { headers, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return (await r.json()) as T;
}

type Tree = { sha: string; truncated?: boolean; tree: { path: string; type: string; sha: string }[] };

async function remoteBlobs(repo: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  // The root tree alone, then each engine directory's own tree: data/ is far too
  // big for one recursive listing of the whole repo.
  const root = await gh<Tree>(`/repos/${repo}/git/trees/main`);
  const byPath = new Map(root.tree.map((e) => [e.path, e]));
  for (const p of manifest.paths) {
    const top = p.split("/")[0];
    const entry = byPath.get(top);
    if (!entry) continue;
    if (entry.type === "blob") {
      if (isEngine(entry.path)) out.set(entry.path, entry.sha);
      continue;
    }
    const sub = await gh<Tree>(`/repos/${repo}/git/trees/${entry.sha}?recursive=1`);
    if (sub.truncated) throw new Error(`${repo}: ${top}/ tree truncated`);
    for (const e of sub.tree) {
      const full = `${top}/${e.path}`;
      if (e.type === "blob" && isEngine(full)) out.set(full, e.sha);
    }
  }
  return out;
}

function pick(pkg: Record<string, unknown>) {
  return JSON.stringify(manifest.packageFields.map((f) => pkg[f] ?? null));
}

async function main() {
  const self = (process.env.GITHUB_REPOSITORY || "").toLowerCase();
  const mine = localBlobs();
  const myPkg = pick(JSON.parse(fs.readFileSync("package.json", "utf8")));
  let drift = 0;
  const lines: string[] = [];
  const sisters = checkouts.length ? checkouts : manifest.repos.filter((r) => r.toLowerCase() !== self);
  for (const repo of sisters) {
    let theirs: Map<string, string>;
    let theirPkg = "";
    if (checkouts.length) {
      theirs = localBlobs(repo);
      theirPkg = pick(JSON.parse(execFileSync("git", ["show", "HEAD:package.json"], { cwd: repo, encoding: "utf8" })));
    } else {
      theirs = await remoteBlobs(repo);
      const rawPkg = await fetch(`https://raw.githubusercontent.com/${repo}/main/package.json`, { signal: AbortSignal.timeout(20000) });
      theirPkg = rawPkg.ok ? pick((await rawPkg.json()) as Record<string, unknown>) : "";
    }
    const differ = [...new Set([...mine.keys(), ...theirs.keys()])].filter((p) => mine.get(p) !== theirs.get(p)).sort();
    if (theirPkg !== myPkg) differ.push("package.json (scripts or dependencies)");
    drift += differ.length;
    lines.push(differ.length ? `${repo}: ${differ.length} engine file(s) differ\n${differ.map((p) => `  ${mine.has(p) ? (theirs.has(p) ? "changed" : "missing there") : p.startsWith("package.json") ? "changed" : "only there"}  ${p}`).join("\n")}` : `${repo}: same engine`);
  }
  const report = lines.join("\n");
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Engine drift\n\n\`\`\`\n${report}\n\`\`\`\n${drift ? "\nCopy the change to the other repos with `scripts/engine-sync.sh` (CLAUDE.md).\n" : ""}`);
  if (drift && strict) {
    console.error(`\nThe engine differs from a sister repo in ${drift} place(s). Copy it across with scripts/engine-sync.sh.`);
    process.exit(1);
  }
}
main().catch((e) => {
  console.error((e as Error).message);
  process.exit(strict ? 1 : 0);
});
