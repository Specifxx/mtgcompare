#!/usr/bin/env node
// Runs `tsc --noEmit` and groups the errors by the package that owns each file (critique 19: at C0 the repository is red by design, and 'free of errors in its files' needs a tool to read it).
// Usage: node checks/tsc-by-owner.mjs [WP07]      -> a table of error counts per owner, or the errors of one owner. Ownership comes from docs/ownership.json (generated from work-packages-final.json in C0).
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
const owner = existsSync("docs/ownership.json") ? JSON.parse(readFileSync("docs/ownership.json", "utf8")) : {};
const r = spawnSync("npx", ["tsc", "--noEmit", "--pretty", "false"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const lines = `${r.stdout}${r.stderr}`.split("\n").filter((l) => /^[^\s].*\(\d+,\d+\): error TS\d+/.test(l));
const by = new Map();
for (const l of lines) { const f = l.slice(0, l.indexOf("(")); const o = owner[f] ?? "?"; (by.get(o) ?? by.set(o, []).get(o)).push(l); }
const want = process.argv[2];
if (want) { for (const l of by.get(want) ?? []) console.log(l); console.log(`${(by.get(want) ?? []).length} error(s) in ${want}'s files`); process.exit((by.get(want) ?? []).length ? 1 : 0); }
for (const [o, l] of [...by].sort((a, b) => b[1].length - a[1].length)) console.log(String(l.length).padStart(5), o);
console.log(String(lines.length).padStart(5), "total");
process.exit(lines.length ? 1 : 0);
