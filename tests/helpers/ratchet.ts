// A ratchet that does not need a shared mutable allow-list (critique 6: the first draft's tests/fixtures/get-catalog-callers.json and legacy-vocab ratchet file were edited by every package).
// Offenders are DERIVED from the filesystem; each package owns ONE key of a baseline file (one key per line, so concurrent edits merge); the count per owner may only go down, and with
// RATCHET_STRICT=1 (set at milestone M2) it must be zero. The owner of a file comes from docs/ownership.json (generated from work-packages-final.json by WP21 in C0).
import fs from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(__dirname, "../..");
export function walk(dir: string, keep: (f: string) => boolean = () => true): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => (e.name === "node_modules" || e.name === ".next" ? [] : e.isDirectory() ? walk(path.join(dir, e.name), keep) : keep(path.join(dir, e.name).split(path.sep).join("/")) ? [path.join(dir, e.name).split(path.sep).join("/")] : []));
}
export const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
export function ownerOf(file: string): string {
  const f = path.join(ROOT, "docs/ownership.json");
  if (!fs.existsSync(f)) return "?";
  const map = JSON.parse(fs.readFileSync(f, "utf8")) as Record<string, string>;
  return map[file] ?? "?";
}
export interface RatchetResult { ok: boolean; byOwner: Record<string, string[]>; failures: string[] }
/** offenders: files (relative paths) that still contain the legacy thing. baselineKeyPrefix: the key family in tests/fixtures/ratchet-baseline.json, e.g. "legacy-vocab" -> "legacy-vocab/WP07". */
export function ratchet(id: string, offenders: readonly string[], strict = process.env.RATCHET_STRICT === "1"): RatchetResult {
  const byOwner: Record<string, string[]> = {};
  for (const f of offenders) (byOwner[ownerOf(f)] ??= []).push(f);
  const bf = path.join(ROOT, "tests/fixtures/ratchet-baseline.json");
  const baseline = fs.existsSync(bf) ? (JSON.parse(fs.readFileSync(bf, "utf8")) as Record<string, number>) : {};
  const failures: string[] = [];
  for (const [owner, files] of Object.entries(byOwner)) {
    if (strict) { failures.push(`${id}: ${owner} still has ${files.length} file(s): ${files.slice(0, 5).join(", ")}${files.length > 5 ? " ..." : ""}`); continue; }
    const allowed = baseline[`${id}/${owner}`] ?? baseline[`${id}/*`] ?? Infinity;
    if (files.length > allowed) failures.push(`${id}: ${owner} went from ${allowed} to ${files.length} file(s) (a ratchet only goes down): ${files.slice(0, 5).join(", ")}`);
  }
  return { ok: failures.length === 0, byOwner, failures };
}
export const summary = (r: RatchetResult): string => Object.entries(r.byOwner).map(([o, f]) => `${o}: ${f.length}`).join(", ") || "none";
