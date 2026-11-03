#!/usr/bin/env bash
# Copies this repo's engine (engine.json "paths", minus "exclude") into sister
# checkouts, and its package.json scripts and dependencies, keeping each
# sister's own "name". Files the engine no longer has are deleted there too.
# It only writes the working trees: review, test and commit each repo yourself.
#
#   scripts/engine-sync.sh ../lorcanacompare ../ygocompare
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
[ $# -gt 0 ] || { echo "usage: scripts/engine-sync.sh <sister checkout>..." >&2; exit 2; }
for dest in "$@"; do
  dest="$(cd "$dest" && pwd)"
  [ -f "$dest/src/site.config.ts" ] || { echo "$dest is not an engine repo" >&2; exit 2; }
  node - "$here" "$dest" <<'JS'
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const [src, dest] = process.argv.slice(2);
const m = JSON.parse(fs.readFileSync(path.join(src, "engine.json"), "utf8"));
const isEngine = (p) => m.paths.some((e) => p === e || p.startsWith(e + "/")) && !m.exclude.includes(p);
const tracked = (dir) => execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", ...m.paths], { cwd: dir, encoding: "utf8" }).split("\n").filter((p) => p && isEngine(p));
const want = new Set(tracked(src));
for (const p of tracked(dest)) if (!want.has(p)) { fs.rmSync(path.join(dest, p)); console.log(`deleted ${p}`); }
for (const p of want) {
  const a = fs.readFileSync(path.join(src, p));
  const to = path.join(dest, p);
  if (fs.existsSync(to) && Buffer.compare(a, fs.readFileSync(to)) === 0) continue;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(to, a);
  fs.chmodSync(to, fs.statSync(path.join(src, p)).mode);
  console.log(`copied  ${p}`);
}
const sp = JSON.parse(fs.readFileSync(path.join(src, "package.json"), "utf8"));
const dpPath = path.join(dest, "package.json");
const dp = JSON.parse(fs.readFileSync(dpPath, "utf8"));
let changed = false;
for (const f of m.packageFields) if (JSON.stringify(dp[f]) !== JSON.stringify(sp[f])) { dp[f] = sp[f]; changed = true; }
if (changed) { fs.writeFileSync(dpPath, JSON.stringify(dp, null, 2) + "\n"); console.log("updated package.json (run npm install there)"); }
JS
  echo "synced $dest"
done
