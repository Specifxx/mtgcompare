// tests/helpers/cache-scan.ts (owner WP19). The static scanners behind tests/nested-cache.test.ts: pure functions over source text, so the rules are tested on synthetic sources (a rule that cannot fail is not a rule).
//
// Why each rule exists (Next 14.2.35, reproduced in design/_final2/dp-lab/next and the critic's lab):
//   * an unstable_cache callback runs under fetchCache "force-no-store": a nested loader's own cache is bypassed (Rift's burn of 2026-09-11) AND a nested fetch() bypasses the Data Cache (critique DP-06: the same pinned URL fetched inside the
//     callback under four keys hit the origin four times, outside it once). So the callback must be PURE CPU over data resolved BEFORE the closure.
//   * a cache key that carries a tier, a viewer or a user splits the cache per tier and, worse, tempts a loader to cache a cut ranking (critique DP-08).
export function stripNonCode(src: string): string { return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1"); }
/** The text between the parentheses of every `unstable_cache(` call (brace/paren matched; strings and comments skipped). */
export function cacheCalls(src: string): { args: string; line: number }[] {
  const out: { args: string; line: number }[] = [];
  for (const m of src.matchAll(/unstable_cache\s*\(/g)) {
    let i = m.index! + m[0].length, depth = 1; const start = i;
    while (i < src.length && depth > 0) {
      const c = src[i]!;
      if (c === "/" && src[i + 1] === "/") { i = src.indexOf("\n", i); if (i < 0) break; continue; }
      if (c === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i) + 2; continue; }
      if (c === '"' || c === "'" || c === "`") { const q = c; i++; while (i < src.length && src[i] !== q) i += src[i] === "\\" ? 2 : 1; }
      else if (c === "(") depth++; else if (c === ")") depth--;
      i++;
    }
    out.push({ args: src.slice(start, i - 1), line: src.slice(0, m.index).split("\n").length });
  }
  return out;
}
/** The callback (first argument) and the key array (second argument) of an unstable_cache call's argument text. */
export function splitArgs(args: string): { callback: string; key: string } {
  let depth = 0, i = 0; const parts: string[] = []; let last = 0;
  for (; i < args.length; i++) {
    const c = args[i]!;
    if (c === "/" && args[i + 1] === "/") { const n = args.indexOf("\n", i); if (n < 0) break; i = n; continue; }
    if (c === "/" && args[i + 1] === "*") { const n = args.indexOf("*/", i + 2); if (n < 0) break; i = n + 1; continue; }
    if (c === '"' || c === "'" || c === "`") { const q = c; i++; while (i < args.length && args[i] !== q) i += args[i] === "\\" ? 2 : 1; continue; }
    if (c === "(" || c === "[" || c === "{") depth++; else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) { parts.push(args.slice(last, i)); last = i + 1; }
  }
  parts.push(args.slice(last)); return { callback: parts[0] ?? "", key: parts[1] ?? "" };
}
/** `get*(` calls that are loaders, not methods: the lookbehind skips `.getTime(` (OP's own data.ts has 29 cache callbacks and exactly one false positive with the unanchored regex, q.updatedAt.getTime()). */
export const LOADER_CALL = /(?<![.\w])get[A-Z]\w*\s*\(/g;
/** Reads of the published data or the network: forbidden inside a cache callback (the Data Cache is bypassed there). */
export const PLANE_READ = /(?<![.\w])(?:planeJson|planeText|planeSource|getDataRef|getBrowseIndex|getNameTable|fetch|readFileSync)\s*\(|\.source\s*\(|\bsrc\.(?:json|text)\s*\(/g;
export function callbackOffenders(src: string): string[] {
  const out: string[] = [];
  for (const c of cacheCalls(stripNonCode(src))) {
    const { callback } = splitArgs(c.args);
    const loaderAt = new Set<number>();
    for (const m of callback.matchAll(LOADER_CALL)) { loaderAt.add(m.index!); out.push(`line ${c.line}: loader ${m[0].trim()} inside the callback (Next bypasses its cache; resolve it before the closure)`); }
    for (const m of callback.matchAll(PLANE_READ)) if (!loaderAt.has(m.index!)) out.push(`line ${c.line}: ${m[0].trim()} inside the callback (a fetch under unstable_cache is force-no-store: resolve the data before the closure)`);
  }
  return out;
}
export const TIER_WORDS = /\b(?:who|tier|viewer|access|user|entitlement|session|email|userId)\b/;
export function keyOffenders(src: string): string[] {
  const out: string[] = [];
  for (const c of cacheCalls(stripNonCode(src))) {
    const { key } = splitArgs(c.args);
    if (TIER_WORDS.test(key)) out.push(`line ${c.line}: the cache key mentions a tier, viewer or user (${key.trim().slice(0, 70)}): a ranking is cached tier-neutral and cut after the key is read`);
    if (/rank|rise|demand/.test(key) && /(?:deal-rank|rise|demand)-v\d/.test(key) && !/\bref\b|rankKey\(/.test(key)) out.push(`line ${c.line}: a ranking key without the data commit (${key.trim().slice(0, 70)}): use rankKey(name, ref, ...)`);
  }
  return out;
}
/** Rift's transitive-nesting test, generalised: functions called from a callback (up to `hops` local hops) must not call a self-cached loader or read the plane. `selfCached` = the names of the loaders that cache themselves. */
export function indexFunctions(sources: Map<string, string>): Map<string, string[]> {
  const bodies = new Map<string, string[]>();
  for (const src0 of sources.values()) {
    const src = stripNonCode(src0);
    for (const m of src.matchAll(/(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/g)) {
      let i = m.index! + m[0].length, depth = 1; while (depth > 0 && i < src.length) { if (src[i] === "(") depth++; else if (src[i] === ")") depth--; i++; }
      const open = src.indexOf("{", i); if (open < 0) continue; let d = 1, j = open + 1; while (d > 0 && j < src.length) { if (src[j] === "{") d++; else if (src[j] === "}") d--; j++; }
      (bodies.get(m[1]!) ?? bodies.set(m[1]!, []).get(m[1]!)!).push(src.slice(open, j));
    }
  }
  return bodies;
}
export function transitiveOffenders(sources: Map<string, string>, selfCached: ReadonlySet<string>, hops = 3): string[] {
  const bodies = indexFunctions(sources); const out: string[] = [];
  const bad = (body: string): string | null => { for (const m of body.matchAll(LOADER_CALL)) if (selfCached.has(m[0].replace(/\s*\($/, ""))) return m[0].trim(); for (const m of body.matchAll(PLANE_READ)) return m[0].trim(); return null; };
  const reach = (name: string, depth: number, seen: Set<string>): string | null => {
    if (depth > hops || seen.has(name)) return null; seen.add(name);
    for (const body of bodies.get(name) ?? []) { const b = bad(body); if (b) return `${name} -> ${b}`; for (const m of body.matchAll(/(?<![.\w])([A-Za-z_]\w*)\s*\(/g)) { const r = reach(m[1]!, depth + 1, seen); if (r) return `${name} -> ${r}`; } }
    return null;
  };
  for (const [file, src] of sources) for (const c of cacheCalls(stripNonCode(src))) {
    const { callback } = splitArgs(c.args);
    for (const m of callback.matchAll(/(?<![.\w])([A-Za-z_]\w*)\s*\(/g)) { if (["async", "await", "unstable_cache", "if", "for", "while", "switch", "return", "function"].includes(m[1]!)) continue; const r = reach(m[1]!, 1, new Set()); if (r) out.push(`${file} line ${c.line}: ${r}`); }
  }
  return [...new Set(out)];
}

/** The body (brace matched) of every `generateStaticParams` declaration, strings and comments skipped. */
export function staticParamsBodies(src0: string): string[] {
  const src = stripNonCode(src0); const out: string[] = [];
  for (const m of src.matchAll(/generateStaticParams\b/g)) {
    const open = src.indexOf("{", m.index! + m[0].length); if (open < 0) continue;
    let d = 1, j = open + 1;
    while (d > 0 && j < src.length) { const c = src[j]!; if (c === '"' || c === "'" || c === "`") { const q = c; j++; while (j < src.length && src[j] !== q) j += src[j] === "\\" ? 2 : 1; } else if (c === "{") d++; else if (c === "}") d--; j++; }
    out.push(src.slice(open + 1, j - 1));
  }
  return out;
}
