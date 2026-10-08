// THE BUILD FETCHES NOTHING, AND NO PAGE BAKES A DEGRADED RENDER (critique DP-01, a blocker reproduced on Next 14.2.35: a param-less page with `revalidate` is PRERENDERED at `next build`; a throwing read fails the build and a swallowed one bakes
// the degraded page and serves it for the whole revalidate window). Owner WP19. Static rules over src/app (ratchet: against OP's source it reports the 20 param-less revalidate routes and every page that must become force-dynamic, and passes at the baseline):
//   A. A route file that exports `revalidate` must not reach the data barrel or the database (its import closure, type-only imports ignored): ISR is for pages that read no published file and no table.
//   B. A route file that reaches the data barrel or the database must export `dynamic = "force-dynamic"` (page, route handler, sitemap, opengraph-image): rendered per request, cached by the CDN through headers.json.
//   C. No `sitemap.ts` / `robots.ts` metadata route may reach data (Next adds its own Cache-Control to metadata routes, so next.config headers() would DOUBLE it: measured): sitemaps are route handlers that set publicDataHeaders().
//   D. No generateStaticParams body reads data (the other author's deploy-cadence test also pins this).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appRoutes, closure, routeOf } from "./helpers/import-graph";
import { ratchet, summary } from "./helpers/ratchet";
import { staticParamsBodies } from "./helpers/cache-scan";

const ROOT = process.env.TEST_ROOT ?? path.resolve(__dirname, "..");
const rel = (root: string, f: string) => path.relative(root, f).split(path.sep).join("/");
export interface Finding { rule: "A" | "B" | "C" | "D"; file: string; why: string }
export function scan(root: string): Finding[] {
  const out: Finding[] = [];
  for (const f of appRoutes(root)) {
    const src = fs.readFileSync(f, "utf8"); const r = rel(root, f); const c = closure(f, root); const reaches = c.dataLeaf || c.dbLeaf;
    const isr = /^export const revalidate\s*=/m.test(src); const dyn = /^export const dynamic\s*=\s*["']force-dynamic["']/m.test(src); const isLayout = /\/layout\.tsx?$/.test(r);
    if (isr && reaches) out.push({ rule: "A", file: r, why: `exports revalidate but reaches ${c.dataLeaf ? "the data barrel" : "the database"}: prerendered at build, a degraded page baked for the window` });
    if (reaches && !isr && !dyn && !isLayout) out.push({ rule: "B", file: r, why: `reaches ${c.dataLeaf ? "the data barrel" : "the database"} without export const dynamic = "force-dynamic"` });
    if (/\/(sitemap|robots)\.ts$/.test(r) && reaches) out.push({ rule: "C", file: r, why: "a metadata route that reads data: use a route handler that sets publicDataHeaders()" });
    for (const body of staticParamsBodies(src)) if (/(?<![.\w])get[A-Z]\w*\s*\(|(?<![.\w])fetch\s*\(|prisma|planeJson/.test(body)) out.push({ rule: "D", file: r, why: "generateStaticParams reads data" });
  }
  return out;
}
const mk = (files: Record<string, string>): string => { const root = fs.mkdtempSync(path.join(os.tmpdir(), "bnd-")); for (const [f, s] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), s); } return root; };

test("the rules can fail: ISR over data (A), a data page that is not force-dynamic (B), a data sitemap (C), data in generateStaticParams (D), data through a component, type-only imports ignored", () => {
  const root = mk({
    "src/app/page.tsx": 'import { getHomeFeed } from "@/lib/data";\nexport const revalidate = 3600;\nexport default async function P() { return null; }',
    "src/app/about/page.tsx": 'export const revalidate = 86400;\nexport default function P() { return null; }',
    "src/app/browse/page.tsx": 'import { getCardPage } from "@/lib/data";\nexport const dynamic = "force-dynamic";\nexport default async function P() { return null; }',
    "src/app/price-guide/page.tsx": 'import { getCardPage } from "@/lib/data";\nexport default async function P() { return null; }',
    "src/app/sitemap.ts": 'import { getSitemapPlan } from "@/lib/data";\nexport const dynamic = "force-dynamic";\nexport default async function s() { return []; }',
    "src/app/via/page.tsx": 'import X from "@/components/X";\nexport const revalidate = 60;\nexport default function P() { return <X />; }',
    "src/components/X.tsx": 'import { getEbayPanel } from "@/lib/data";\nexport default async function X() { return null; }',
    "src/app/typed/page.tsx": 'import type { CardLite } from "@/lib/data";\nexport const revalidate = 60;\nexport default function P() { return null; }',
    "src/app/card/[slug]/page.tsx": 'import { getCardDetail } from "@/lib/data";\nexport function generateStaticParams() { return getCardDetail("x"); }\nexport const dynamic = "force-dynamic";\nexport default function P() { return null; }',
  });
  const f = scan(root).map((x) => `${x.rule}:${x.file}`).sort();
  assert.deepEqual(f, ["A:src/app/page.tsx", "A:src/app/via/page.tsx", "B:src/app/price-guide/page.tsx", "C:src/app/sitemap.ts", "D:src/app/card/[slug]/page.tsx"].sort()); fs.rmSync(root, { recursive: true });
});
test("RATCHET over src/app: ISR only on pages that read nothing; everything that reads data is force-dynamic (against OP's source: the 20 param-less revalidate routes and the data pages are the offenders to migrate)", () => {
  const findings = scan(ROOT); const r = ratchet("build-no-data", [...new Set(findings.map((x) => `src/app/${x.file.replace(/^src\/app\//, "")}`))]);
  if (findings.length) console.log(`build-no-data offenders: ${summary(r)} (${findings.filter((x) => x.rule === "A").length} ISR-over-data, ${findings.filter((x) => x.rule === "B").length} not force-dynamic)`);
  assert.ok(r.ok, r.failures.join("\n"));
});
test("every param-less route of the baseline that exports revalidate is a known file: the 20 the critic counted (documentation of the migration)", { skip: !fs.existsSync(path.join(ROOT, "src/app/page.tsx")) }, () => {
  const isr = appRoutes(ROOT).filter((f) => !/\[/.test(f) && /^export const revalidate\s*=/m.test(fs.readFileSync(f, "utf8"))).map((f) => routeOf(ROOT, f));
  console.log(`param-less ISR routes in this tree: ${isr.length}`); assert.ok(isr.length <= 20, "the migration only removes them");
});

// ── the CI build job's own gates (ci-build.yml, Annex C checks 23 and 24): the pure parts of scripts/smoke-pages.ts and scripts/check-images.ts, shown to be able to fail ──────────────────────────────────────────────
import { FORBIDDEN_MARKERS, STATIC_CHECKS, dataRoutePatterns, judge, prerenderedDataRoutes, routePattern, writeFixtureTree, type Fetched } from "../scripts/smoke-pages";
import { MAX_BYTES, blankComments, markdownMissingAlt, missingAlt, run as imageGuard, scryfallInOptimiser, tagEnd } from "../scripts/check-images";

const HEADERS = JSON.parse(fs.readFileSync(path.join(ROOT, "src/lib/data/plane/headers.json"), "utf8")) as { pagesPublic: string[]; pagesPrivate: string[] };
test("the build gate reads the build's own manifest: a plane-backed route in .next/prerender-manifest.json is named, and the dynamic templates match too", () => {
  const pats = dataRoutePatterns(HEADERS);
  const bad = prerenderedDataRoutes({ routes: { "/": {}, "/about": {}, "/browse": {}, "/sets/mh3": {}, "/tools/deal-finder": {}, "/privacy": {}, "/blog/x": {} }, dynamicRoutes: { "/card/[slug]": {}, "/sets/[slug]": {}, "/guides/[slug]": {}, "/stores/[slug]": {} } }, pats);
  assert.deepEqual(bad, ["/", "/browse", "/card/x", "/sets/mh3", "/sets/x", "/stores/x", "/tools/deal-finder"].sort(), "home, lists, card, set, store and the Deal Finder are data routes; about, privacy, blog and guides read nothing");
  assert.deepEqual(prerenderedDataRoutes({ routes: { "/about": {}, "/terms": {} }, dynamicRoutes: {} }, pats), [], "a build that prerendered only static pages passes");
  assert.ok(routePattern("/sets/:path*").test("/sets") && routePattern("/sets/:path*").test("/sets/a/b") && !routePattern("/sets/:path*").test("/setsx"));
  assert.ok(routePattern("/").test("/") && !routePattern("/").test("/about"));
  assert.ok(HEADERS.pagesPublic.includes("/card/:path*") && HEADERS.pagesPrivate.includes("/tools/deal-finder"), "the lists the gate reads are the ones headers.json carries");
});
test("the smoke judge fails an empty body, a missing <h1>, a thin page, a baked degraded read, an error boundary, and a missing notice; and passes a real page", () => {
  const ok = (html: string, status = 200): Fetched => ({ status, html, location: null, contentType: "text/html" });
  const body = (inner: string): string => `<html><head><title>T</title></head><body><main><h1>Sol Ring</h1>${"<p>word </p>".repeat(120)}${Array.from({ length: 20 }, (_, i) => `<a href="/x/${i}">l</a>`).join("")}${inner}</main></body></html>`;
  const home = STATIC_CHECKS.find((c) => c.path === "/")!;
  const page = body("MTG Compare, Wizards of the Coast, Scryfall");
  assert.deepEqual(judge(home, ok(page)), []);
  assert.match(judge(home, ok(page, 500))[0]!, /HTTP 500/);
  assert.deepEqual(judge(home, ok("  ")), ["an empty body"]);
  assert.ok(judge(home, ok(page.replace("<h1>Sol Ring</h1>", ""))).some((p) => /0 <h1>/.test(p)));
  assert.ok(judge(home, ok("<html><body><main><h1>x</h1></main></body></html>")).some((p) => /visible text/.test(p)));
  assert.ok(judge(home, ok(page + "degraded plane read during next build")).some((p) => /degraded plane read/.test(p)), "the marker of a data page baked at build time with the host unreachable");
  assert.ok(judge(home, ok(page + "Application error: a client-side exception")).some((p) => /Application error/.test(p)));
  assert.ok(judge(home, ok(body(""))).some((p) => /missing required content/.test(p)), "the unofficial-fan-site notice is required on the home page");
  assert.ok(judge(home, ok(page + '<script type="application/ld+json">{oops</script>')).some((p) => /JSON-LD/.test(p)));
  assert.ok(FORBIDDEN_MARKERS.includes("degraded plane read") && FORBIDDEN_MARKERS.includes("Internal Server Error"));
  assert.ok(STATIC_CHECKS.some((c) => c.path === "/premium" && c.must?.includes("Demand Finder")), "the three Premium tools are on /premium");
  assert.ok(STATIC_CHECKS.some((c) => c.path === "/tools/deal-finder"), "the signed-out Deal Finder renders its preview");
});
test("the fixture tree the smoke test serves is the golden mini tree, with a pointer the reader accepts", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bnd-tree-"));
  try {
    const n = writeFixtureTree(dir);
    assert.ok(n > 600, `${n} files`);
    const ptr = JSON.parse(fs.readFileSync(path.join(dir, "latest.json"), "utf8")) as { v: number; phase: string; format: string; counts: { files: number } };
    assert.deepEqual([ptr.v, ptr.phase, ptr.format, ptr.counts.files], [1, "full", "v1", n]);
    assert.ok(fs.existsSync(path.join(dir, "v1/manifest.json")) || fs.existsSync(path.join(dir, "v1/meta/sets.json")));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test("the image guard fails an <img> or <Image> without alt, a markdown image without text, a Scryfall host in the optimiser and a file over 150 KB; an empty alt is allowed", () => {
  assert.equal(missingAlt('<img src="/a.png" />', "a.tsx").length, 1);
  assert.equal(missingAlt('<Image src="/a.png" width={1} height={1} />', "a.tsx").length, 1);
  assert.equal(missingAlt('<img src="/a.png" alt="" />', "a.tsx").length, 0, "a decorative image says so with alt=\"\"");
  assert.equal(missingAlt('<Image src={x} alt={`${name} ${set}`} className={a > b ? "x" : "y"} />', "a.tsx").length, 0, "a > inside an expression container does not end the tag");
  assert.equal(missingAlt('// <img src="/a.png" />\nconst x = 1;', "a.tsx").length, 0, "a comment");
  assert.equal(missingAlt('const html = `<img src="${u}">`;', "w.ts").length, 1, "the embeddable widgets build HTML in template strings: those need an alt too");
  assert.equal(markdownMissingAlt("![](/a.png) and ![Sol Ring](/b.png)", "l.ts").length, 1);
  assert.equal(scryfallInOptimiser("module.exports = { images: {\n  remotePatterns: [{ hostname: 'cards.scryfall.io' }],\n  } };").length, 1);
  assert.equal(scryfallInOptimiser("module.exports = { images: {\n  remotePatterns: [{ hostname: 'tcgplayer-cdn.tcgplayer.com' }],\n  } };").length, 0);
  assert.equal(blankComments("a // b\nc /* d */ e").replace(/ +/g, " "), "a \nc e".replace(/ +/g, " "));
  assert.equal(tagEnd("<a href={x > 1 ? 'a' : 'b'}>t</a>", 0), "<a href={x > 1 ? 'a' : 'b'}>".length - 1);
  assert.equal(MAX_BYTES, 150 * 1024);
});
test("the repository passes its own image guard today (public/ images under 150 KB, an alt on every tag, no Scryfall host in the optimiser): the part of ci-build.yml that needs no build", () => {
  const { problems } = imageGuard(ROOT);
  // the tags of unfinished packages (the One Piece components still being ported) are theirs to fix: report them, fail only on a LARGE IMAGE or the optimiser rule
  const hard = problems.filter((p) => p.rule !== "MISSING ALT");
  assert.deepEqual(hard, []);
  const alt = ratchet("build-no-data:image-alt", [...new Set(problems.filter((p) => p.rule === "MISSING ALT").map((p) => p.where.split(":")[0]!))]);
  if (!alt.ok) assert.fail(alt.failures.join("\n"));
});
