// NO ORPHANS: EVERY PUBLIC PAGE IS LINKED FROM SOMEWHERE (owner WP19, parity P08; ported from RiftCompare's internal-links test, written after an outside SEO review found 19 of 91 published articles reachable only from an index
// and a tag-based module, several of them already earning impressions). At Magic's scale the orphans that matter are the hand-written pages and the editorial posts: the 100,000 card pages are linked by the lists and the sitemap
// sections, which scripts/crawl-check.ts walks. Two rules, each a RATCHET per owner, and the pure part of the crawler's report (scripts/crawl-check.ts summarise) tested on synthetic crawls so each of its findings is shown to fire.
//   1. every blog post and guide is linked from another post or from a hard-coded link in a page or component;
//   2. every public static route (a page.tsx without a dynamic segment, outside admin, account and the API) is linked by a string literal somewhere in src outside its own folder, the sitemap and robots.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, ratchet, stripComments, summary, walk } from "./helpers/ratchet";
import { MAX_DEPTH, isNonContent, normalise, readPage, summarise, type Result } from "../scripts/crawl-check";

const read = (p: string): string => fs.readFileSync(path.join(ROOT, p), "utf8");
const SRC = walk("src", (f) => /\.tsx?$/.test(f));
const BODY = new Map(SRC.map((f) => [f, stripComments(read(f))]));
/** Files whose mention of a path is NOT an internal link: the route itself, the sitemap and robots, the machine-readable mirrors. */
const NOT_A_LINK = /(?:^|\/)(?:sitemap|robots)\.|\/sitemaps?\/|\/sitemap\.xml\/|^src\/app\/llms|^src\/app\/feed\.|^src\/app\/news-sitemap|^src\/lib\/data\/sitemap\.ts$|^src\/lib\/(?:og|seo)\//;

// ── 1. posts ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("RATCHET: every blog post and guide has an inbound link from another post or a hard-coded link", async () => {
  const { POSTS, postHref } = await import("../src/lib/blog");
  const orphans: string[] = [];
  for (const p of POSTS) {
    const href = postHref(p), re = new RegExp(`${href.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}(?![\\w-])`);
    const inbound = [...BODY].some(([f, t]) => !NOT_A_LINK.test(f) && f !== "src/lib/blog/index.ts" && re.test(t));
    if (!inbound) orphans.push(href);
  }
  const r = ratchet("internal-links:posts", orphans.length ? ["src/lib/blog/index.ts"] : []);
  if (orphans.length) console.log(`internal-links posts: ${orphans.length} of ${POSTS.length} without an inbound link: ${orphans.slice(0, 6).join(", ")}`);
  assert.ok(r.ok, r.failures.join("\n"));
  assert.ok(POSTS.length > 0);
});

// ── 2. static routes ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const PRIVATE_OR_MACHINE = /^\/(?:admin|api|account|login|register|dashboard|profile|watching|watchlist|portfolio|premium\/(?:start|welcome)|unsubscribe|alerts\/(?:action|manage)|c|rising|embed|llm|_|sitemap|robots|manifest|opengraph-image|icon|apple-icon|indexnow|ads\.txt|llms|feed|news-sitemap|error|global-error|not-found|template)\b/;
export function publicStaticRoutes(): { route: string; file: string }[] {
  return walk("src/app", (f) => /\/page\.tsx$/.test(f)).map((f) => ({ file: f, route: "/" + path.dirname(path.relative("src/app", f)).split(path.sep).filter((s) => !/^\(.*\)$/.test(s)).join("/") }))
    .map((x) => ({ ...x, route: x.route === "/." ? "/" : x.route })).filter((x) => x.route !== "/" && !/\[/.test(x.route) && !PRIVATE_OR_MACHINE.test(x.route))
    // a page that declares itself noindex is where an e-mail footer lands (stop release alerts, unsubscribe): it is not part of the surface a crawler is meant to reach
    .filter((x) => !/robots:\s*\{[^}]*index:\s*false/.test(BODY.get(x.file) ?? ""));
}
export function linked(route: string, ownFile: string, bodies: ReadonlyMap<string, string>): boolean {
  const esc = route.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&"), re = new RegExp(`["'\`]${esc}(?:["'\`/?#]|\\$\\{)`);
  const ownDir = path.dirname(ownFile);
  return [...bodies].some(([f, t]) => f !== ownFile && !f.startsWith(`${ownDir}/`) && !NOT_A_LINK.test(f) && re.test(t));
}
test("the link finder can fail: a quoted path counts, a longer path, a comment, the page itself and the sitemap do not", () => {
  const bodies = new Map([
    ["src/components/Nav.tsx", 'export const L = [{ href: "/tools/box-ev" }, { href: `/tools/trade?x=1` }];'],
    ["src/lib/data/sitemap.ts", 'const s = ["/tools/orphan"];'],
    ["src/app/tools/orphan/page.tsx", 'const self = "/tools/orphan";'],
    ["src/components/Footer.tsx", 'const x = "/tools/box-evolution";'],
  ]);
  assert.equal(linked("/tools/box-ev", "src/app/tools/box-ev/page.tsx", bodies), true);
  assert.equal(linked("/tools/trade", "src/app/tools/trade/page.tsx", bodies), true);
  assert.equal(linked("/tools/orphan", "src/app/tools/orphan/page.tsx", bodies), false, "the sitemap and the page itself are not inbound links");
  assert.equal(linked("/tools/box-ev", "src/app/tools/other/page.tsx", new Map([["src/components/Footer.tsx", 'const x = "/tools/box-evolution";']])), false, "a longer path is another page");
});
test("RATCHET: every public static route is linked by a string literal somewhere outside its own folder", () => {
  const routes = publicStaticRoutes();
  assert.ok(routes.length >= 15, `${routes.length} public static routes found: the walk broke`);
  const orphans = routes.filter((r) => !linked(r.route, r.file, BODY));
  const r = ratchet("internal-links:routes", orphans.map((x) => x.file));
  if (orphans.length) console.log(`internal-links routes: ${summary(r)}: ${orphans.map((x) => x.route).join(", ")}`);
  assert.ok(r.ok, r.failures.join("\n"));
});

// ── the crawler's report, on synthetic crawls ──────────────────────────────────────────────────────────────────────────────
const page = (o: Partial<Result> & { path: string }): Result => ({ depth: 1, status: 200, redirects: 0, finalPath: o.path, title: `T ${o.path}`, description: `D ${o.path}`, h1Count: 1, canonical: o.path, noindex: false, hasBreadcrumbs: true, emptyServerRender: false, softFourOhFour: false, textLength: 900, links: [], ...o });
test("the crawl report fires on each hard problem and on each soft one, and stays quiet on a clean crawl", () => {
  const clean = summarise([page({ path: "/", depth: 0, hasBreadcrumbs: false }), page({ path: "/sets" }), page({ path: "/sets/mh3", depth: 2 })], []);
  assert.deepEqual([clean.hard, clean.soft], [0, 0]);
  const hard = (r: Result, key: string): void => { const s = summarise([page({ path: "/", depth: 0, hasBreadcrumbs: false }), r], []); assert.ok(s.hard >= 1 && (s.totals as Record<string, number>)[key]! >= 1, key); };
  hard(page({ path: "/gone", status: 404 }), "broken");
  hard(page({ path: "/boom", status: 500 }), "serverErrors");
  hard(page({ path: "/thin", softFourOhFour: true, textLength: 40 }), "softFourOhFours");
  hard(page({ path: "/csr", emptyServerRender: true }), "emptyServerRender");
  hard(page({ path: "/x", canonical: "/y" }), "wrongCanonical");
  hard(page({ path: "/untitled", title: "" }), "missingTitle");
  const soft = summarise([page({ path: "/", depth: 0, hasBreadcrumbs: false }), page({ path: "/a", title: "Same" }), page({ path: "/b", title: "Same" }), page({ path: "/deep", depth: MAX_DEPTH + 1 }), page({ path: "/hop", redirects: 2 }), page({ path: "/c", h1Count: 2 })], ["/orphan"]);
  assert.equal(soft.hard, 0, "duplicates, depth, chains, orphans and h1 counts are reported, not fatal");
  for (const k of ["duplicateTitles", "tooDeep", "redirectChains", "sitemapOrphans", "wrongH1Count"]) assert.ok((soft.totals as Record<string, number>)[k]! >= 1, k);
  assert.ok(isNonContent("/api/me") && isNonContent("/admin") && isNonContent("/c/abc") && !isNonContent("/card/sol-ring"));
  assert.equal(normalise("http://x.test", "/a/b/?q=1#z", "/"), "/a/b", "query strings are filter state, not pages");
  assert.equal(normalise("http://x.test", "https://other.test/a", "/"), null);
  const rp = readPage("http://x.test", "/p", 1, 200, 0, "/p", '<html><head><title>T</title><meta name="description" content="D"><link rel="canonical" href="http://x.test/p"></head><body><main id="main-content"><h1>H</h1>' + "x ".repeat(200) + '</main></body></html>');
  assert.deepEqual([rp.title, rp.description, rp.canonical, rp.h1Count, rp.noindex], ["T", "D", "http://x.test/p", 1, false]);
});
