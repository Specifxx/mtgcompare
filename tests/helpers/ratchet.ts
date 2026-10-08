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
// Source with its comments removed. String, template and regular-expression literals are respected, so an Accept header of star-slash-star, "//" and a regex like /[/*]/ stay code: the first version of this
// function was three regular expressions, and the star-slash-star header opened a "block comment" that swallowed the next 40 lines of scryfall.ts, hiding every name and every legacy word in them from the scans.
// A line break inside a block comment is kept, so the line numbers of what remains do not move. A `//` that follows a colon (`https://`) is a URL, not a comment.
export function stripComments(src: string): string {
  const n = src.length; let i = 0, out = "", prev = "";                         // prev: the last significant character of CODE, to tell a regex literal from a division
  const REGEX_AFTER = "(,=:[!&|?{};+-*%~^\n";
  const keywordBefore = (): boolean => /(?:^|[^\w$.])(?:return|typeof|case|in|of|delete|void|throw|new|else|do|yield|await)\s*$/.test(out.slice(-12));
  const template = (): void => {                                                  // at the backtick; copies the literal, recursing into ${ ... }
    out += src[i++];
    while (i < n) {
      const c = src[i]!;
      if (c === "\\") { out += src.slice(i, i + 2); i += 2; continue; }
      if (c === "`") { out += c; i++; return; }
      if (c === "$" && src[i + 1] === "{") { out += "${"; i += 2; code(true); continue; }
      out += c; i++;
    }
  };
  const code = (inBrace: boolean): void => {
    let depth = 0;
    while (i < n) {
      const c = src[i]!, d = src[i + 1];
      if (c === "/" && d === "/" && src[i - 1] !== ":") { while (i < n && src[i] !== "\n") i++; continue; }
      if (c === "/" && d === "*") { const end = src.indexOf("*/", i + 2), stop = end < 0 ? n : end + 2; out += src.slice(i, stop).replace(/[^\n]/g, ""); i = stop; continue; }
      if (c === '"' || c === "'") { let j = i + 1; while (j < n && src[j] !== c && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1; out += src.slice(i, j + 1); i = j + 1; prev = c; continue; }
      if (c === "`") { template(); prev = "`"; continue; }
      if (c === "/" && (prev === "" || REGEX_AFTER.includes(prev) || keywordBefore() || (prev === ">" && src[i - 2] === "="))) {
        let j = i + 1, cls = false;                                              // a regex literal ends at an unescaped / outside [...] on the same line; otherwise it was a division after all
        while (j < n && src[j] !== "\n" && (cls || src[j] !== "/")) { if (src[j] === "\\") j++; else if (src[j] === "[") cls = true; else if (src[j] === "]") cls = false; j++; }
        if (src[j] === "/") { j++; while (/[a-z]/.test(src[j] ?? "")) j++; out += src.slice(i, j); i = j; prev = ")"; continue; }
      }
      if (inBrace) { if (c === "{") depth++; else if (c === "}") { if (depth === 0) { out += c; i++; return; } depth--; } }
      out += c; i++;
      if (!/\s/.test(c)) prev = c;
    }
  };
  code(false);
  return out;
}
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
