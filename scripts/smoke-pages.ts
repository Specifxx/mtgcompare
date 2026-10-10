// scripts/smoke-pages.ts (owner WP19, parity P04, contract 13.5). Do the pages that matter return REAL content? Ported from RiftCompare's smoke test, which exists because a homepage that server-rendered nothing (an unwrapped
// useSearchParams deopted the whole tree to client rendering: a spinner, no <h1>, no links) typechecked, built and looked fine in a browser, and shipped blank. Nothing in CI looked at the bytes. This does.
//
// For each key URL it asserts: HTTP 200; exactly one <h1>; a floor of visible text and of internal links; every JSON-LD block parses; the page never mentions an error boundary, an application error or a degraded plane read
// ("degraded plane read during next build" is the marker of a data-backed page that was PRERENDERED at build time, the thing contract 12.7.1 forbids); and a few pieces of copy the contract requires on the page (the unofficial
// fan-site notice, the three Premium tools on /premium). The sitemap index and one child, and robots.txt, are checked as XML and text.
//
//   npx tsx scripts/smoke-pages.ts [origin]                  against a running site (default http://localhost:3000)
//   npx tsx scripts/smoke-pages.ts [origin] --fixture        against `next start` serving the fixture tree: the card, set and sealed page are found from /browse, /sets and /sealed
//   npx tsx scripts/smoke-pages.ts --write-tree <dir>        write the golden fixture tree (tests/helpers/plane-tree.ts, day 3) as a PLANE_DIR: <dir>/v1/** and <dir>/latest.json, then exit
//   --check-build [dir]                                      after `next build`: no route of headers.json (the plane-backed pages) may be in .next/prerender-manifest.json, i.e. prerendered at build time
//   --allow-404                                              a 404 on an `optional` route (one not deployed yet) is reported, not failed
//
// CI (ci-build.yml) builds with the database and the data host unreachable, starts the server with PLANE_DIR=<fixture> and runs this: so it also proves the public pages render with Neon down (Annex C check 23). The card, set and
// sealed pages are DISCOVERED from the index pages instead of named, so the same script runs against the fixture tree and against production data. Exit 1 on any failure.
import fs from "node:fs";
import path from "node:path";
import { PLANE_FORMAT, type PointerFile } from "../src/lib/data/plane/formats";
import { fsTree } from "../src/lib/data/plane/tree";
import { MINI_CUT, dayOf, isoOf, miniFull } from "../tests/helpers/plane-tree";
import { appRoutes, closure, routeOf } from "../tests/helpers/import-graph";

export const USER_AGENT = "MTGCompare-smoke/1.0 (+https://github.com/Specifxx/mtgcompare)";
// ── page parsing, shared with status-check, crawl-check and seo-gate ─────────────────────────────────────────────────────────
const ENTITIES: [RegExp, string][] = [[/&amp;/g, "&"], [/&lt;/g, "<"], [/&gt;/g, ">"], [/&quot;/g, '"'], [/&apos;|&#39;|&#x27;/g, "'"], [/&nbsp;/g, " "], [/&mdash;/g, "-"], [/&ldquo;|&rdquo;/g, '"']];
export const decodeEntities = (s: string): string => ENTITIES.reduce((a, [re, to]) => a.replace(re, to), s).replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d))).replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)));
/** Visible text of the body: scripts, styles and templates dropped, tags dropped, whitespace collapsed. */
export function visibleText(html: string): string {
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  return decodeEntities(body.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<template[\s\S]*?<\/template>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}
export const internalLinks = (html: string): string[] => [...new Set([...html.matchAll(/href="(\/[^"#?][^"]*)"/g)].map((m) => m[1]!))];
export const h1Count = (html: string): number => (html.match(/<h1[\s>]/gi) ?? []).length;
export const jsonLdBlocks = (html: string): string[] => [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]!);
export interface Head { title: string; description: string; canonicals: string[]; robots: string }
export function parseHead(html: string): Head {
  const head = html.slice(0, html.indexOf("</head>") + 7 || html.length);
  const canon = [...head.matchAll(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/gi)].map((m) => decodeEntities(m[1]!));
  canon.push(...[...head.matchAll(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/gi)].map((m) => decodeEntities(m[1]!)));
  return {
    title: decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ?? "").trim(),
    description: decodeEntities(/<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["']/i.exec(head)?.[1] ?? "").trim(),
    canonicals: [...new Set(canon)],
    robots: decodeEntities(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i.exec(head)?.[1] ?? "").toLowerCase(),
  };
}
/** What must never appear in served HTML: an error boundary, a crashed render, or the marker of a data page that was prerendered at build time with the data host unreachable. */
export const FORBIDDEN_MARKERS = ["Application error: a client-side exception", "Internal Server Error", "degraded plane read", "__next_error__"];

// ── the checks ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface Check {
  path: string; label: string; kind?: "html" | "xml" | "text";
  must?: string[]; mustNot?: string[]; minText?: number; minLinks?: number; h1?: number;
  /** a route that may not exist yet on the origin under test (--allow-404) */
  optional?: boolean;
  /** the check could not even be set up (a page to discover was not found): reported as its own failure */
  fail?: string;
}
export const STATIC_CHECKS: Check[] = [
  { path: "/", label: "home page", minText: 400, minLinks: 15, must: ["MTG Compare", "Wizards of the Coast", "Scryfall"] },
  { path: "/browse", label: "card database", minLinks: 10 },
  { path: "/price-guide", label: "price guide", minLinks: 10 },
  { path: "/sets", label: "sets index", minLinks: 5 },
  { path: "/sealed", label: "sealed products", minLinks: 3 },
  { path: "/movers", label: "movers", minLinks: 5 },
  { path: "/market", label: "market", minText: 300, minLinks: 5 },
  { path: "/stores", label: "stores", minLinks: 5 },
  { path: "/tools", label: "tools", minLinks: 5 },
  { path: "/tools/deal-finder", label: "Deal Finder (signed out: a preview, never the list)", minText: 300, minLinks: 3 },
  { path: "/premium", label: "Plus and Premium", must: ["Deal Finder", "Rising Cards", "Demand Finder"], minText: 800, minLinks: 3 },
  { path: "/about", label: "about", minText: 600, minLinks: 5, must: ["Wizards of the Coast"] },
  { path: "/privacy", label: "privacy", minText: 800, minLinks: 3 },
  { path: "/terms", label: "terms", minText: 800, minLinks: 3 },
  { path: "/methodology", label: "methodology", optional: true, minText: 600, minLinks: 3 },
];
/** Where to find an example of a data-backed page without naming one: the first link of a given shape on an index page. */
export const DISCOVER: { from: string; link: RegExp; label: string; minText: number; minLinks: number; must?: string[] }[] = [
  { from: "/browse", link: /^\/card\/[a-z0-9][a-z0-9-]*$/, label: "a card page", minText: 300, minLinks: 8 },
  { from: "/sets", link: /^\/sets\/[a-z0-9][a-z0-9-]*$/, label: "a set page", minText: 300, minLinks: 8 },
  { from: "/sealed", link: /^\/sealed\/[a-z0-9][a-z0-9-]*$/, label: "a sealed product page", minText: 200, minLinks: 5 },
];

export interface Fetched { status: number; html: string; location: string | null; contentType: string }
/** Judges one fetched page against its check. Pure: returns the problems, empty = ok. */
export function judge(c: Check, r: Fetched): string[] {
  const problems: string[] = [];
  if (c.fail) return [c.fail];
  if (r.status !== 200) return [`HTTP ${r.status}, expected 200`];
  const kind = c.kind ?? "html", html = r.html, joined = html.replace(/<!-- -->/g, "");
  if (!html.trim()) return ["an empty body"];
  if (kind === "xml") {
    if (!html.startsWith("<?xml")) problems.push("no XML declaration");
    if (!/<(sitemapindex|urlset)[\s>]/.test(html)) problems.push("neither a <sitemapindex> nor a <urlset>");
    if (!/<loc>[^<]+<\/loc>/.test(html)) problems.push("no <loc> entry");
  } else if (kind === "html") {
    const before = problems.length, want = c.h1 ?? 1, h1s = h1Count(html);
    if (h1s !== want) problems.push(`${h1s} <h1> elements, expected exactly ${want}`);
    const text = visibleText(html), minText = c.minText ?? 300;
    if (text.length < minText) problems.push(`only ${text.length} chars of visible text (min ${minText})`);
    const links = internalLinks(html).length, minLinks = c.minLinks ?? 5;
    if (links < minLinks) problems.push(`only ${links} internal links (min ${minLinks})`);
    // a contained CSR bailout (a search box in its own Suspense boundary) is the fix working; only an UNCONTAINED one that emptied <main> is the incident, and the floors above measure that
    const main = /<main[^>]*>([\s\S]*?)<\/main>/i.exec(html);
    if (problems.length > before && main && main[1]!.includes("BAILOUT_TO_CLIENT_SIDE_RENDERING")) problems.push("^ an UNCONTAINED client-side-rendering bailout swallowed <main>: look for a client hook (useSearchParams) rendered without its own <Suspense> boundary");
    jsonLdBlocks(html).forEach((b, i) => { try { JSON.parse(b); } catch (e) { problems.push(`JSON-LD block ${i + 1} does not parse (${String(e).slice(0, 60)})`); } });
  }
  for (const s of FORBIDDEN_MARKERS) if (joined.includes(s)) problems.push(`mentions "${s}"`);
  for (const s of c.must ?? []) if (!joined.includes(s) && !joined.replace(/\s+/g, "").includes(s.replace(/\s+/g, ""))) problems.push(`missing required content ${JSON.stringify(s)}`);
  for (const s of c.mustNot ?? []) if (joined.includes(s)) problems.push(`contains forbidden content ${JSON.stringify(s)}`);
  return problems;
}

/** The golden mini tree as a PLANE_DIR: v1/** and a pointer. A directory without latest.json also works (the reader invents one); this one is a plausible pointer so /api/data-status has something to say. */
export function writeFixtureTree(dir: string): number {
  const tree = miniFull({ day: 3 }), out = fsTree(path.join(dir, "v1"));
  for (const f of tree.files()) out.write(f, tree.read(f));
  const day = isoOf(dayOf(3)), cut = isoOf(MINI_CUT);
  const ptr: PointerFile = { v: 1, seq: 1, ref: "0".repeat(40), publishedAt: new Date().toISOString(), priceDay: day, tcgcsv: `${day}T20:06:09Z`, scryfall: `${day}T21:05:42+00:00`, phase: "full", format: PLANE_FORMAT, counts: { cards: 700, units: 0, files: tree.files().length }, manifestSha256: "", prev: null, repo: "local/fixture", histCut: cut, pvAt: null };
  fs.writeFileSync(path.join(dir, "latest.json"), JSON.stringify(ptr));
  return tree.files().length;
}

// ── the build prerendered nothing that reads data (contract 12.7.1, Annex C check 24) ───────────────────────────────────────────
/** Next's `/path/:slug*` / `/path/:slug` patterns (as headers.json writes them) as a regexp over concrete paths. */
export function routePattern(p: string): RegExp {
  const esc = (x: string): string => x.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const body = p.split("/").filter(Boolean).map((seg) => (/^:[A-Za-z]+\*$/.test(seg) ? "(?:/.*)?" : /^:[A-Za-z]+$/.test(seg) ? "/[^/]+" : `/${esc(seg)}`)).join("");
  return new RegExp(`^${body || "/"}/?$`);
}
/** The routes that render published data or are per-tier: the public page list of headers.json (the one source of the page Cache-Control, WP02) and the four tool pages of its private list. All of them are force-dynamic. */
export function dataRoutePatterns(h: { pagesPublic: string[]; pagesPrivate: string[] }): RegExp[] {
  return [...h.pagesPublic, ...h.pagesPrivate.filter((x) => x.startsWith("/tools/"))].map(routePattern);
}
/** Prerendered routes (from .next/prerender-manifest.json) that match a data route. `routes` holds concrete paths, `dynamicRoutes` templates ("/card/[slug]"), which are matched with a sample segment. */
export function prerenderedDataRoutes(manifest: { routes?: Record<string, unknown>; dynamicRoutes?: Record<string, unknown> }, patterns: RegExp[]): string[] {
  const concrete = Object.keys(manifest.routes ?? {}), templates = Object.keys(manifest.dynamicRoutes ?? {}).map((t) => t.replace(/\[\.\.\.[^\]]+\]/g, "x/y").replace(/\[[^\]]+\]/g, "x"));
  return [...concrete, ...templates].filter((r) => patterns.some((re) => re.test(r))).sort();
}
/** Whether the page behind a concrete route reaches the data barrel or the database (the import closure tests/build-no-data.test.ts uses). A prerendered route whose page reads neither is an
 *  ISR page that reads nothing (rule A of that test pins it), such as /tools or /stores/suggest under the /tools and /stores/:path* patterns: not a finding. No page file found: it stays one. */
export function readsData(src: string, route: string): boolean {
  const pages = appRoutes(src).filter((f) => /\/page\.tsx?$/.test(f.split(path.sep).join("/")) && routeOf(src, f) === route);
  if (!pages.length) return true;
  return pages.some((f) => { const c = closure(f, src); return c.dataLeaf || c.dbLeaf; });
}
function checkBuild(root: string): number {
  const mf = path.join(root, ".next", "prerender-manifest.json"), hf = path.join(__dirname, "..", "src", "lib", "data", "plane", "headers.json");
  if (!fs.existsSync(mf)) { console.error(`${mf} does not exist: run npm run build first`); return 2; }
  const bad = prerenderedDataRoutes(JSON.parse(fs.readFileSync(mf, "utf8")), dataRoutePatterns(JSON.parse(fs.readFileSync(hf, "utf8")))).filter((r) => readsData(path.join(__dirname, ".."), r));
  if (bad.length) { console.error(`::error::${bad.length} data-backed route(s) were prerendered at build time (they must be force-dynamic: tests/build-no-data.test.ts):\n  ${bad.slice(0, 20).join("\n  ")}`); return 1; }
  console.log("No plane-backed route is in the prerender manifest: the build rendered nothing that reads data.");
  return 0;
}

async function fetchOnce(base: string, p: string): Promise<Fetched> {
  const res = await fetch(`${base}${p}`, { headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xml,text/plain" }, redirect: "follow", signal: AbortSignal.timeout(60_000) });
  return { status: res.status, html: await res.text(), location: res.headers.get("location"), contentType: res.headers.get("content-type") ?? "" };
}
export async function main(argv: readonly string[]): Promise<number> {
  const cb = argv.indexOf("--check-build");
  if (cb >= 0) return checkBuild(path.resolve(argv[cb + 1] && !argv[cb + 1]!.startsWith("--") ? argv[cb + 1]! : "."));
  const wt = argv.indexOf("--write-tree");
  if (wt >= 0) { const dir = path.resolve(argv[wt + 1] ?? ""); if (!argv[wt + 1]) { console.error("--write-tree needs a directory"); return 2; } console.log(`wrote the fixture tree (${writeFixtureTree(dir)} files) to ${dir}; serve it with PLANE_DIR=${dir}`); return 0; }
  const base = (argv.find((a) => /^https?:\/\//.test(a)) ?? "http://localhost:3000").replace(/\/$/, ""), allow404 = argv.includes("--allow-404");
  console.log(`Smoke-testing ${base}${argv.includes("--fixture") ? " (fixture data)" : ""}\n`);
  const checks: Check[] = [...STATIC_CHECKS];
  const index = new Map<string, string>();
  for (const d of DISCOVER) {
    try {
      if (!index.has(d.from)) index.set(d.from, (await fetchOnce(base, d.from)).html);
      const hit = internalLinks(index.get(d.from)!).find((l) => d.link.test(l));
      checks.push(hit ? { path: hit, label: `${d.label} (found on ${d.from})`, minText: d.minText, minLinks: d.minLinks, must: d.must } : { path: d.from, label: d.label, fail: `no link of the right shape on ${d.from}: the index page lists nothing to open` });
    } catch { checks.push({ path: d.from, label: d.label, fail: `${d.from} could not be fetched` }); }
  }
  checks.push({ path: "/sitemap.xml", label: "sitemap index", kind: "xml" }, { path: "/robots.txt", label: "robots.txt", kind: "text", must: ["Sitemap:", "Disallow: /api/", "/admin"] });
  let failures = 0, skipped = 0;
  for (const c of checks) {
    let r: Fetched | null = null; const problems: string[] = [];
    try { r = await fetchOnce(base, c.path); } catch (e) { problems.push(`fetch failed: ${(e as Error).message}`); }
    if (r && r.status === 404 && c.optional && allow404) { console.log(`~ SKIP ${c.label} (${c.path}): 404, route not deployed yet`); skipped++; continue; }
    if (r) problems.push(...judge(c, r));
    if (r && c.path === "/sitemap.xml" && !problems.length) {                      // one child section too: the index is only as good as what it points at
      const child = [...r.html.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!.replace(/&amp;/g, "&")).pathname)[0];
      if (!child) problems.push("the index lists no section");
      else { try { const cr = await fetchOnce(base, child); problems.push(...judge({ path: child, label: "sitemap section", kind: "xml" }, cr).map((p) => `${child}: ${p}`)); } catch (e) { problems.push(`${child}: fetch failed: ${(e as Error).message}`); } }
    }
    if (problems.length) { failures++; console.log(`x FAIL ${c.label} (${c.path})`); for (const p of problems) console.log(`        ${p}`); } else console.log(`+ ok   ${c.label} (${c.path})`);
  }
  const ran = checks.length - skipped;
  console.log(`\n${ran - failures}/${ran} checks passed${skipped ? ` (${skipped} skipped)` : ""}.`);
  if (failures) { console.error(`\n::error::${failures} page(s) failed the smoke test.`); return 1; }
  return 0;
}
if (process.argv[1] && /scripts[\\/]smoke-pages\.ts$/.test(process.argv[1])) main(process.argv.slice(2)).then((c) => { process.exitCode = c; }).catch((e) => { console.error(e); process.exitCode = 1; });
