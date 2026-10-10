// A PURGE THAT MATCHES NOTHING FAILS SILENTLY (owner WP19, parity P08; ported from RiftCompare and re-aimed at a site whose public data is NOT purged).
//
// revalidatePath() does not validate its argument and does not throw on a path that resolves to nothing: a renamed route, or a dynamic segment written with the wrong shape, leaves that surface serving stale HTML until its
// TTL expires, with no error anywhere. RiftCompare's cure was a list of paths the price import purged. Here the price import purges NOTHING: every published file is read through a fetch pinned to the commit sha the pointer names
// (no tag, contract 7.5, 12.7.2), pages are force-dynamic and cached by the CDN header, and a publish is followed by a warm call, not a purge. What remains to purge is the small Neon-backed content (user-published decks, the
// rising snapshot, the eBay banner, the ranking caches), and these tests keep that short list honest.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, ratchet, stripComments, summary, walk } from "./helpers/ratchet";

const read = (p: string): string => fs.readFileSync(path.join(ROOT, p), "utf8");
const code = (p: string): string => stripComments(read(p));

/** The route files of src/app as segment lists: "/decks/[slug]" -> ["decks", "[slug]"]; groups "(x)" do not appear in a URL. */
export function routeTemplates(root = ROOT): string[][] {
  const base = path.join(root, "src/app");
  return walk("src/app", (f) => /\/(page|route)\.tsx?$/.test(f)).map((f) => path.relative(base, path.join(root, f)).split(path.sep).slice(0, -1).filter((s) => !/^\(.*\)$/.test(s)));
}
/** Whether a concrete path (dynamic parts already replaced by a sample) matches a route template. `[x]` takes one segment, `[...x]` and `[[...x]]` the rest. */
export function matchesRoute(concrete: string, templates: readonly string[][]): boolean {
  const segs = concrete.split("/").filter(Boolean);
  return templates.some((t) => {
    for (let i = 0; i < t.length; i++) {
      const s = t[i]!;
      if (/^\[\[?\.\.\./.test(s)) return segs.length > i || s.startsWith("[[");
      if (segs[i] === undefined) return false;
      if (!/^\[.+\]$/.test(s) && s !== segs[i]) return false;
    }
    return segs.length === t.length;
  });
}

type Call = { file: string; arg: string };
/** Every `revalidatePath(<first argument>)` of src/, the argument as written. */
function calls(): Call[] {
  const out: Call[] = [];
  for (const f of walk("src", (x) => /\.tsx?$/.test(x))) {
    const src = code(f);
    for (const m of src.matchAll(/(?<![.\w])revalidatePath\(\s*((?:`[^`]*`|"[^"]*"|'[^']*'|[A-Za-z_][\w.]*\([^)]*\)))/g)) out.push({ file: f, arg: m[1]! });
  }
  return out;
}
/** The path a call purges, with each dynamic part replaced by the sample "x": a literal, a template, or a call of a path helper whose body is a template (published-decks.ts commanderDeckPath). */
function resolve(arg: string): string | null {
  if (/^["'`]/.test(arg)) return arg.slice(1, -1).replace(/\$\{[^}]*\}/g, "x");
  const fn = /^([A-Za-z_]\w*)\(/.exec(arg)?.[1];
  if (!fn) return null;
  for (const f of walk("src/lib", (x) => /\.tsx?$/.test(x))) {
    const m = new RegExp(`export (?:const ${fn}\\s*=\\s*\\([^)]*\\)(?:\\s*:\\s*string)?\\s*=>|function ${fn}\\s*\\([^)]*\\)(?:\\s*:\\s*string)?\\s*\\{\\s*return)\\s*(\`[^\`]*\`|"[^"]*")`).exec(code(f));
    if (m) return m[1]!.slice(1, -1).replace(/\$\{[^}]*\}/g, "x");
  }
  return null;
}

test("the matcher can fail: a path that is not a route, a renamed dynamic segment, a deeper path", () => {
  const t = [["decks"], ["decks", "[slug]"], ["decks", "commander", "[slug]"], ["card", "[slug]", "[number]"], ["blog", "[...rest]"]];
  assert.ok(matchesRoute("/decks", t) && matchesRoute("/decks/x", t) && matchesRoute("/decks/commander/x", t) && matchesRoute("/card/x/y", t) && matchesRoute("/blog/a/b/c", t));
  assert.ok(!matchesRoute("/deck/x", t), "a renamed route");
  assert.ok(!matchesRoute("/decks/x/y/z", t), "a path deeper than any route");
  assert.ok(!matchesRoute("/card/x", t), "a card page needs both segments");
  assert.ok(!matchesRoute("/", t), "the home page is not in this list");
});
test("every revalidatePath() in src/ resolves to a real route", () => {
  const all = calls();
  assert.ok(all.length >= 3, `expected to find the purge calls of the deck and rising routes, found ${all.length}: the scan broke`);
  const templates = routeTemplates();
  const unresolved = all.filter((c) => resolve(c.arg) === null).map((c) => ({ file: c.file, why: `${c.arg} (a path helper whose body is not a template literal: write the path inline or export a simple helper)` }));
  const missing = all.flatMap((c) => { const p = resolve(c.arg); return p !== null && !matchesRoute(p, templates) ? [{ file: c.file, why: `${c.arg} -> ${p}` }] : []; });
  // A RATCHET per owner of the calling file: the commander deck route (/decks/commander/[commander]) is WP11's and does not exist until wave 5, so the purge calls of the deck routes name a route that is still the One Piece
  // /decks/leader/[leader]. The count may only go down; RATCHET_STRICT=1 (M2) requires none.
  const found = [...unresolved, ...missing], r = ratchet("revalidate-paths-exist", [...new Set(found.map((x) => x.file))]);
  if (found.length) console.log(`revalidate-paths-exist offenders: ${summary(r)}: ${found.map((x) => x.why).join("; ")}`);
  assert.ok(r.ok, `${r.failures.join("\n")}\nthese purge nothing: no route file on disk`);
});
test("only Neon-backed content is ever purged: tags are the NEON_TAGS, and nothing published is tagged", () => {
  const core = code("src/lib/data/core.ts");
  const tags = [...core.matchAll(/export const [A-Z_]+_TAG(?:: "[a-z-]+")? = "([a-z-]+)"/g)].map((m) => m[1]!);
  assert.deepEqual(tags.sort(), ["ebay-banner", "published-decks", "rank", "rising-snapshots"], "the Neon-backed tags of core.ts");
  const bad: string[] = [];
  for (const f of walk("src", (x) => /\.tsx?$/.test(x))) {
    for (const m of code(f).matchAll(/(?<![.\w])revalidateTag\(\s*([^)]*)\)/g)) {
      const arg = m[1]!.trim();
      if (!(/_TAG$/.test(arg) || /^tag$/.test(arg) || tags.includes(arg.replace(/["']/g, "")))) bad.push(`${f}: revalidateTag(${arg})`);
    }
  }
  assert.deepEqual(bad, [], "a purge by a tag that is not one of the Neon-backed ones");
  // DP-04: a plane fetch carries no tag, so a publish needs no purge; a tag on it would make a purge necessary and a purge would empty the Data Cache of a week-old deployment
  for (const f of walk("src/lib/data/plane", (x) => /\.tsx?$/.test(x))) assert.doesNotMatch(code(f), /\bnext\s*:\s*\{[^}]*\btags\b/, `${f} tags a plane read`);   // (the git tags of the publisher are another thing)
});
test("the import and every script purge nothing: the only calls to the site are the warm call and the Neon-tag route", () => {
  for (const f of walk("scripts", (x) => /\.(ts|cjs|mjs)$/.test(x))) {
    assert.doesNotMatch(code(f), /from ["']next\/cache["']|\brevalidate(Path|Tag)\(/, `${f}: a script cannot purge a cache, it can only ask the site to`);
    for (const m of code(f).matchAll(/["'`]\/api\/(revalidate|data-warm|data-status)[^"'`]*["'`]/g)) assert.ok(["/api/revalidate", "/api/data-warm", "/api/data-status"].includes(m[0]!.slice(1, -1)), `${f}: ${m[0]}`);
  }
});
test("/api/revalidate purges exactly the NEON_TAGS behind the bearer secret, and never a page", () => {
  const src = code("src/app/api/revalidate/route.ts");
  assert.match(src, /const tags = asked\.length \? NEON_TAGS\.filter\(\(t\) => asked\.includes\(t\)\) : \[\.\.\.NEON_TAGS\]/, "every tag, or the asked subset of NEON_TAGS");
  assert.match(src, /for \(const tag of tags\) revalidateTag\(tag\)/);
  assert.doesNotMatch(src, /revalidatePath/, "published data is not purged by path either");
  assert.match(src, /timingSafeEqual/);
  assert.match(src, /process\.env\.CRON_SECRET/);
  assert.match(src, /export const dynamic = "force-dynamic"/);
  assert.ok(fs.existsSync(path.join(ROOT, "src/app/api/data-warm/route.ts")) && fs.existsSync(path.join(ROOT, "src/app/api/data-status/route.ts")), "the warm call and the status poll the publisher makes after every publish");
});
