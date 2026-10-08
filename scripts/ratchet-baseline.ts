// scripts/ratchet-baseline.ts (owner WP19, contract 9.3 step 5 and 16.3): tests/fixtures/ratchet-baseline.json, the per-owner offender counts of every ratchet at this commit.
//
//   tsx scripts/ratchet-baseline.ts            write tests/fixtures/ratchet-baseline.json (C0: the counts the repository starts from; a package may only lower its own key)
//   tsx scripts/ratchet-baseline.ts --check    print the counts and exit 1 when an owner's count is above its baseline key (the same rule tests/helpers/ratchet.ts applies)
//
// A ratchet is a test that calls ratchet(id, offenders) from tests/helpers/ratchet.ts. This script does not duplicate their scans: it runs every test file that imports that helper in a child
// process, with the helper's `ratchet` wrapped so that the per-owner counts of each call are written out (the wrapped call still enforces nothing: it passes strict = false). The owner of a
// file is docs/ownership.json (scripts/gen-ownership.ts). Keys are "<ratchet id>/<owner>", one per line and sorted, so two packages lowering their own keys never conflict; "<ratchet id>/*"
// is 0 for every ratchet seen, so an owner that had no offender at C0 may not gain one.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import Module from "node:module";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const BASELINE = path.join(ROOT, "tests/fixtures/ratchet-baseline.json");
type Counts = Record<string, Record<string, number>>;   // ratchet id -> owner -> files

/** Child mode: load one test file with the helper wrapped, and dump what each ratchet() call saw when the process exits. */
function child(testFile: string, outFile: string): void {
  const helper = path.join(ROOT, "tests/helpers/ratchet.ts");
  const seen: Counts = {};
  const load = (Module as unknown as { _load: (...a: unknown[]) => unknown; _resolveFilename: (...a: unknown[]) => string })._load;
  const resolve = (Module as unknown as { _resolveFilename: (...a: unknown[]) => string })._resolveFilename;
  (Module as unknown as { _load: unknown })._load = function (this: unknown, request: string, parent: unknown, isMain: boolean): unknown {
    const exp = load.call(this, request, parent, isMain) as Record<string, unknown>;
    let resolved = ""; try { resolved = resolve.call(Module, request, parent, isMain); } catch { /* not a file request */ }
    if (resolved !== helper) return exp;
    const real = exp.ratchet as (id: string, offenders: readonly string[], strict?: boolean) => { byOwner: Record<string, string[]> };
    return new Proxy(exp, { get(target, key) {
      if (key !== "ratchet") return target[key as string];
      return (id: string, offenders: readonly string[]): unknown => {
        const r = real(id, offenders, false);
        const into = (seen[id] ??= {});
        for (const [owner, files] of Object.entries(r.byOwner)) into[owner] = Math.max(into[owner] ?? 0, files.length);
        return r;
      };
    } });
  };
  process.on("exit", () => fs.writeFileSync(outFile, JSON.stringify(seen)));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require(path.resolve(testFile));
}

function ratchetTests(): string[] {
  const dir = path.join(ROOT, "tests");
  return fs.readdirSync(dir).filter((f) => f.endsWith(".test.ts")).filter((f) => /helpers\/ratchet/.test(fs.readFileSync(path.join(dir, f), "utf8"))).sort().map((f) => path.join("tests", f));
}

function collect(): Counts {
  const all: Counts = {};
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ratchet-"));
  try {
    for (const t of ratchetTests()) {
      const out = path.join(tmp, path.basename(t) + ".json");
      spawnSync(process.execPath, ["--import", "tsx", __filename, "--child", t, out], { cwd: ROOT, stdio: "ignore", env: { ...process.env, RATCHET_STRICT: "0" } });
      if (!fs.existsSync(out)) { console.error(`ratchet-baseline: ${t} produced no ratchet record (does it call ratchet()?)`); continue; }
      const got = JSON.parse(fs.readFileSync(out, "utf8")) as Counts;
      for (const [id, owners] of Object.entries(got)) { const into = (all[id] ??= {}); for (const [o, n] of Object.entries(owners)) into[o] = Math.max(into[o] ?? 0, n); }
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  return all;
}

const sortedJson = (m: Record<string, number>): string => "{\n" + Object.keys(m).sort().map((k) => `  ${JSON.stringify(k)}: ${m[k]}`).join(",\n") + "\n}\n";

function main(): number {
  const ci = process.argv.indexOf("--child");
  if (ci > 0) { child(process.argv[ci + 1]!, process.argv[ci + 2]!); return -1; }
  const counts = collect();
  const flat: Record<string, number> = {};
  for (const [id, owners] of Object.entries(counts)) { flat[`${id}/*`] = 0; for (const [o, n] of Object.entries(owners)) flat[`${id}/${o}`] = n; }
  const lines = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([id, o]) => `  ${id}: ${Object.entries(o).sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => `${k} ${n}`).join(", ") || "none"}`);
  console.log(`ratchets at this commit (${Object.keys(counts).length}):\n${lines.join("\n")}`);
  if (process.argv.includes("--check")) {
    const base = fs.existsSync(BASELINE) ? (JSON.parse(fs.readFileSync(BASELINE, "utf8")) as Record<string, number>) : {};
    const up: string[] = [];
    for (const [id, owners] of Object.entries(counts)) for (const [o, n] of Object.entries(owners)) { const allowed = base[`${id}/${o}`] ?? base[`${id}/*`] ?? Infinity; if (n > allowed) up.push(`${id}: ${o} went from ${allowed} to ${n}`); }
    for (const x of up) console.error(x);
    return up.length ? 1 : 0;
  }
  fs.writeFileSync(BASELINE, sortedJson(flat));
  console.log(`wrote tests/fixtures/ratchet-baseline.json (${Object.keys(flat).length} keys)`);
  return 0;
}
const code = main();
if (code >= 0) process.exit(code);
