// scripts/gen-ownership.ts (owner WP21, contract 9.3 step 5 and Annex H): docs/ownership.json, the map "repository path -> owning package" that
// tests/helpers/ratchet.ts (ownerOf) and scripts/contract-checks/tsc-by-owner.mjs read. It is generated from work-packages-final.json, never edited by hand.
//
//   tsx scripts/gen-ownership.ts <path-to-work-packages-final.json>   regenerate docs/ownership.json (exit 1 on a path owned twice or an existing file nobody owns)
//   tsx scripts/gen-ownership.ts --check                              no plan needed: every file git knows (tracked or new, not ignored) is in docs/ownership.json
//
// The map holds every file a package lists in `files`, `tests` or `newFiles` (planned files that do not exist yet included, so a new file is attributed the day
// it appears), the glob entries of `newFiles` expanded against the working tree, and the files of the pseudo package UNTOUCHED under the owner "UNTOUCHED".
// `contract-tree` files are already there: Annex H is the same plan (the files it copies are `newFiles` or overwrite a listed file; `checks/*` are
// `scripts/contract-checks/*`). One key per line, sorted, so two packages adding a line never conflict.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "docs/ownership.json");
interface Pkg { id: string; files?: string[]; tests?: string[]; newFiles?: string[] }

/** Every file git knows in the working tree: tracked files that still exist plus untracked files that are not ignored. */
function worktreeFiles(): string[] {
  const out = execFileSync("git", ["-C", ROOT, "ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return [...new Set(out.split("\0").filter(Boolean))].filter((f) => fs.existsSync(path.join(ROOT, f))).sort();
}
/** `*` matches inside one path segment; it is the only wildcard the plan uses (tests/fixtures/plane/*.json, tests/fixtures/titles/*.json). */
function expand(pattern: string, existing: readonly string[]): string[] {
  if (!pattern.includes("*")) return [pattern];
  const re = new RegExp("^" + pattern.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*") + "$");
  return existing.filter((f) => re.test(f));
}
function ownershipFromPlan(plan: readonly Pkg[], existing: readonly string[]): { map: Record<string, string>; problems: string[] } {
  const map: Record<string, string> = {}; const problems: string[] = [];
  for (const p of plan) {
    const owner = p.id;
    for (const entry of [...(p.files ?? []), ...(p.tests ?? []), ...(p.newFiles ?? [])]) {
      if (entry.includes("*")) map[entry] = owner;                      // the pattern itself stays in the map: --check accepts a later file that matches it
      for (const f of expand(entry, existing)) {
        if (map[f] !== undefined && map[f] !== owner) problems.push(`${f}: owned by ${map[f]} and ${owner}`);
        else map[f] = owner;
      }
    }
  }
  for (const f of existing) if (map[f] === undefined) problems.push(`${f}: exists but no package owns it`);
  // A directory is owned by the one package that owns everything under it (tests/legacy-vocab.test.ts reports directories, e.g. src/app/leaders). Mixed directories get no key.
  const below = new Map<string, Set<string>>();
  for (const [f, owner] of Object.entries(map)) for (let d = path.posix.dirname(f); d !== "." && d !== "/"; d = path.posix.dirname(d)) { const s = below.get(d) ?? new Set<string>(); s.add(owner); below.set(d, s); }
  for (const [d, owners] of below) if (owners.size === 1 && map[d] === undefined) map[d] = [...owners][0]!;
  return { map, problems };
}
const sortedJson = (m: Record<string, string>): string => "{\n" + Object.keys(m).sort().map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(m[k])}`).join(",\n") + "\n}\n";

function main(): number {
  const arg = process.argv[2];
  const existing = worktreeFiles();
  if (arg === "--check") {
    if (!fs.existsSync(OUT)) { console.error("docs/ownership.json is missing: run tsx scripts/gen-ownership.ts <work-packages-final.json>"); return 1; }
    const map = JSON.parse(fs.readFileSync(OUT, "utf8")) as Record<string, string>;
    const patterns = Object.keys(map).filter((k) => k.includes("*")).map((k) => new RegExp("^" + k.split("*").map((x) => x.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*") + "$"));
    const missing = existing.filter((f) => map[f] === undefined && !patterns.some((re) => re.test(f)));
    for (const f of missing) console.error(`${f}: exists but is not in docs/ownership.json (add it to the plan and regenerate, or ask WP21)`);
    console.log(`ownership: ${Object.keys(map).length} paths, ${existing.length} files in the working tree, ${missing.length} unowned`);
    return missing.length ? 1 : 0;
  }
  const planPath = arg ?? process.env.WORK_PACKAGES_JSON;
  if (!planPath) { console.error("usage: tsx scripts/gen-ownership.ts <work-packages-final.json> | --check"); return 2; }
  const plan = JSON.parse(fs.readFileSync(path.resolve(planPath), "utf8")) as Pkg[];
  const withUntouched = plan.map((p) => (p.id === "UNTOUCHED" ? { ...p, id: "UNTOUCHED" } : p));
  const { map, problems } = ownershipFromPlan(withUntouched, existing);
  for (const x of problems) console.error(x);
  const counts = new Map<string, number>(); for (const o of Object.values(map)) counts.set(o, (counts.get(o) ?? 0) + 1);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  if (problems.length === 0 || process.env.OWNERSHIP_WRITE_ANYWAY === "1") fs.writeFileSync(OUT, sortedJson(map));
  console.log(`docs/ownership.json: ${Object.keys(map).length} paths (${existing.length} files in the working tree); ` + [...counts].sort((a, b) => a[0].localeCompare(b[0])).map(([o, n]) => `${o} ${n}`).join(", "));
  return problems.length ? 1 : 0;
}
process.exit(main());
