// ONE CANONICAL HOST, DECIDED IN ONE PLACE (owner WP19, parity P08; ported from RiftCompare, whose www -> apex redirect moved from a billed middleware into vercel.json). Duplicate content across hosts (www and the apex, the
// Vercel deployment address, a preview) splits a site's links and makes Google choose; the cure is a single source of the host and a permanent redirect for the rest:
//   * the host is SITE_URL (src/lib/site.ts, NEXT_PUBLIC_SITE_URL); metadataBase, robots, the sitemap index and og:url are all built from it, and no other file names the production host;
//   * a www request is redirected to the apex in vercel.json (a 308), never in middleware (a function billed on every request, cached pages and /public files included, to compare a Host header);
//   * a canonical is a PATH or built from SITE_URL, and never carries a query: `?finish=foil` is a view of the same page (Annex C check 17: "none carries ?finish").
// The domain is not chosen (site.ts: mtgcompare.app is a placeholder), so the redirect rule is written for whatever host SITE_URL has: choosing the real domain is one constant, and this test follows it.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, ratchet, stripComments, summary, walk } from "./helpers/ratchet";
import { SITE_URL } from "../src/lib/site";
import { pageOg } from "../src/lib/og/meta";

const read = (p: string): string => fs.readFileSync(path.join(ROOT, p), "utf8");
const HOST = new URL(SITE_URL).hostname;

test("RATCHET: vercel.json redirects www to the canonical host with a permanent redirect that keeps every path", () => {
  const vercel = JSON.parse(read("vercel.json")) as { redirects?: { source: string; destination: string; permanent?: boolean; statusCode?: number; has?: { type: string; value: string }[] }[] };
  const www = (vercel.redirects ?? []).find((x) => x.has?.some((h) => h.type === "host" && h.value === `www.${HOST.replace(/^www\./, "")}`));
  const problems: string[] = [];
  if (!www) problems.push(`no redirect for www.${HOST}`);
  else {
    if (www.source !== "/:path*") problems.push(`source ${www.source}: every path, sitemaps and feeds included`);
    if (www.destination !== `${SITE_URL}/:path*`) problems.push(`destination ${www.destination}, expected ${SITE_URL}/:path*`);
    if (www.permanent !== true && www.statusCode !== 308) problems.push("not permanent (308 keeps GET and HEAD semantics)");
  }
  // the owner of vercel.json is WP21, and the redirect arrives with the domain decision: until then this is a ratchet that records "1"
  const r = ratchet("canonical-host:www-redirect", problems.length ? ["vercel.json"] : []);
  if (problems.length) console.log(`canonical-host www redirect: ${summary(r)}: ${problems.join("; ")}`);
  assert.ok(r.ok, r.failures.join("\n"));
  for (const x of vercel.redirects ?? []) if (x.has?.some((h) => h.type === "host")) assert.ok(x.permanent === true || x.statusCode === 308, `${x.source}: a host redirect is permanent`);
});
test("no middleware runs per request", () => {
  assert.ok(!fs.existsSync(path.join(ROOT, "src/middleware.ts")) && !fs.existsSync(path.join(ROOT, "middleware.ts")));
});
test("the host is built from SITE_URL: metadataBase, robots, the sitemap index, the feeds and og:url", () => {
  assert.match(read("src/app/layout.tsx"), /metadataBase:\s*new URL\(SITE_URL\)/);
  assert.match(stripComments(read("src/app/robots.ts")), /host:\s*SITE_URL/);
  assert.match(stripComments(read("src/app/robots.ts")), /sitemap:\s*\[`\$\{SITE_URL\}\/sitemap\.xml`/);
  assert.match(stripComments(read("src/lib/sitemap-sections.ts")), /SITE_URL/, "the sitemap index and its sections build every <loc> from SITE_URL (src/lib/sitemap-sections.ts, used by both routes)");
  for (const f of ["src/app/sitemap.xml/route.ts", "src/app/sitemaps/[section]/route.ts"]) assert.match(stripComments(read(f)), /sitemap-sections/, `${f} gets its URLs from the one module`);
  assert.equal(pageOg("/sets/mh3").url, "/sets/mh3", "og:url is a path, resolved against metadataBase");
  assert.throws(() => pageOg("sets/mh3"), /not a site path/, "a relative or absolute URL is refused");
  assert.equal(SITE_URL, SITE_URL.replace(/\/+$/, ""), "no trailing slash: `${SITE_URL}/path` is never a double slash");
  assert.match(SITE_URL, /^https:\/\//, "production is https");
});
test("RATCHET: no file but site.ts names the production host, and no canonical carries a query string", () => {
  const origin = /https?:\/\/(?:www\.)?mtgcompare\.(?:app|com|net|io)\b/;
  const named: string[] = [], queried: string[] = [];
  for (const f of walk("src", (x) => /\.tsx?$/.test(x))) {
    const t = stripComments(read(f));
    if (f !== "src/lib/site.ts" && origin.test(t)) named.push(f);
    if (/canonical:\s*(?:`[^`]*\?[^`]*`|"[^"]*\?[^"]*"|'[^']*\?[^']*')/.test(t)) queried.push(f);
  }
  const r = ratchet("canonical-host:hardcoded-origin", named), q = ratchet("canonical-host:canonical-query", queried);
  if (named.length) console.log(`canonical-host hard-coded origin: ${summary(r)}: ${named.join(", ")}`);
  if (queried.length) console.log(`canonical-host canonical with a query: ${summary(q)}: ${queried.join(", ")}`);
  assert.ok(r.ok, r.failures.join("\n"));
  assert.ok(q.ok, q.failures.join("\n"));
});
test("the detectors can fail", () => {
  const origin = /https?:\/\/(?:www\.)?mtgcompare\.(?:app|com|net|io)\b/;
  assert.ok(origin.test('const u = "https://www.mtgcompare.app/card/x"') && !origin.test("const u = `${SITE_URL}/card/x`"));
  const q = /canonical:\s*(?:`[^`]*\?[^`]*`|"[^"]*\?[^"]*"|'[^']*\?[^']*')/;
  assert.ok(q.test('alternates: { canonical: `/card/${slug}?finish=foil` }') && !q.test("alternates: { canonical: `/card/${slug}` }"));
});

// ── the SEO gate of ci-build.yml and seo-preview-gate.yml (scripts/seo-gate.ts): canonical, indexability, structured data, duplicates, thin pages, prices, and the sitemap itself ─────────────────────────────────────
import { MIN_WORDS, SITEMAP_SECTION_MAX, judgePages, judgeSitemaps, ldProblem, locsOf, moneyToCents, readFacts, sectionOf, spread, templateOf, xmlErrors, type PageFacts } from "../scripts/seo-gate";
const words = (n: number): string => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
const html = (o: { title?: string; desc?: string; canonical?: string | null; robots?: string; body?: string; ld?: string; extra?: string } = {}): string =>
  `<html><head><title>${o.title ?? "Sol Ring (Commander Legends) price"}</title>${o.desc === "" ? "" : `<meta name="description" content="${o.desc ?? "Compare Sol Ring prices"}">`}${o.canonical === null ? "" : `<link rel="canonical" href="${o.canonical ?? "https://mtgcompare.app/card/a"}">`}${o.robots ? `<meta name="robots" content="${o.robots}">` : ""}${o.ld ? `<script type="application/ld+json">${o.ld}</script>` : ""}</head><body><main><h1>Sol Ring</h1>${o.body ?? words(MIN_WORDS + 10)}${o.extra ?? ""}</main></body></html>`;
const facts = (p: string, h: string, status = 200): PageFacts => readFacts(p, status, h, null);
test("the SEO page gate fires on each of its checks, and passes a clean card page", () => {
  const origin = "https://mtgcompare.app", gates = (pages: PageFacts[]): string[] => [...new Set(judgePages(pages, origin).map((p) => p.gate))].sort();
  assert.deepEqual(gates([facts("/card/sol-ring", html({ canonical: "https://mtgcompare.app/card/sol-ring", extra: ' <span>$1.50</span> <img src="/a.png" alt="Sol Ring">', ld: '{"@context":"https://schema.org","@type":"Product","name":"Sol Ring"}' }))]), []);
  assert.deepEqual(gates([facts("/card/a", html({ title: "" }))]), ["metadata"]);
  assert.deepEqual(gates([facts("/card/a", html({ desc: "" }))]), ["metadata"]);
  assert.deepEqual(gates([facts("/card/a", html({ canonical: null }))]), ["canonical"]);
  assert.deepEqual(gates([facts("/card/a", html({ canonical: "https://mtgcompare.app/card/b" }))]), ["canonical"], "a canonical must be the page itself");
  assert.deepEqual(gates([facts("/card/a", html({ canonical: "https://mtgcompare.app/card/a", robots: "noindex, follow" }))]), ["indexability"], "submitted in the sitemap but noindex: a THIN page is both noindex and out of the sitemap");
  assert.deepEqual(gates([facts("/card/a", html({ canonical: "https://mtgcompare.app/card/a", ld: '{"name":"x"}' }))]), ["structured-data"]);
  assert.deepEqual(gates([facts("/card/a", html({ canonical: "https://mtgcompare.app/card/a", ld: "{broken" }))]), ["structured-data"]);
  assert.deepEqual(gates([facts("/card/a", html({ canonical: "https://mtgcompare.app/card/a", extra: '<img src="/x.png">' }))]), ["alt"]);
  assert.deepEqual(gates([facts("/card/a", html({ canonical: "https://mtgcompare.app/card/a", body: words(40) }))]), ["thin"]);
  assert.deepEqual(gates([facts("/card/a", html({ canonical: "https://mtgcompare.app/card/a" }), 404)]), ["status"]);
  const price = (extra: string): string[] => gates([facts("/card/a", html({ canonical: "https://mtgcompare.app/card/a", extra }))]);
  assert.deepEqual(price(" <b>$0.00</b> in stock"), ["price"], "a null summed as zero");
  assert.deepEqual(price(" <b>$0.00</b> postage on every order"), [], "free postage is a fact");
  assert.deepEqual(price(" <b>$NaN</b>"), ["price"]);
  assert.deepEqual(price(" <b>$2,000,000.00</b>"), ["price"], "over the sane band");
  const a = facts("/card/a", html({ canonical: "https://mtgcompare.app/card/a" })), b = facts("/card/b", html({ canonical: "https://mtgcompare.app/card/b" }));
  assert.deepEqual(gates([a, b]), ["duplicate"], "two pages with the same title and description");
  assert.deepEqual(gates([facts("/about", html({ canonical: "https://mtgcompare.app/about", extra: " $0.00" }))]), [], "price integrity applies to price-bearing templates only");
});
test("the sitemap gate fires on a malformed file, an unknown or oversized section, a query string, a missing section kind; and reads the shape of a section name", () => {
  const origin = "https://mtgcompare.app", url = (p: string): string => `<url><loc>${origin}${p}</loc></url>`;
  const idx = (names: string[]): string => `<?xml version="1.0" encoding="UTF-8"?><sitemapindex>${names.map((n) => `<sitemap><loc>${origin}/sitemaps/${n}.xml</loc></sitemap>`).join("")}</sitemapindex>`;
  const set = (xml: string): Map<string, string> => new Map([["/sitemaps/cards-0.xml", xml]]);
  const urlset = (u: string[]): string => `<?xml version="1.0"?><urlset>${u.map(url).join("")}</urlset>`;
  assert.deepEqual(judgeSitemaps(idx(["static-0", "cards-0"]), set(urlset(["/card/a"])), origin), []);
  assert.ok(judgeSitemaps(idx(["static-0", "cards-0"]), set(urlset(["/card/a?finish=foil"])), origin).some((p) => /query string/.test(p.message)), "?finish= is never submitted");
  assert.ok(judgeSitemaps(idx(["static-0", "cards-0"]), set(`<?xml version="1.0"?><urlset><url><loc>${origin}/a&b</loc></url></urlset>`), origin).some((p) => /unescaped/.test(p.message)));
  assert.ok(judgeSitemaps(idx(["static-0", "cards-0"]), set(urlset(Array.from({ length: SITEMAP_SECTION_MAX + 1 }, (_, i) => `/card/${i}`))), origin).some((p) => /URLs in one section/.test(p.message)));
  assert.ok(judgeSitemaps(idx(["static-0", "weird-0"]), new Map(), origin).some((p) => /unknown section kind/.test(p.message)));
  assert.ok(judgeSitemaps(idx(["static-0"]), new Map(), origin).some((p) => /no "cards" section/.test(p.message)));
  assert.ok(judgeSitemaps(`<?xml version="1.0"?><sitemapindex></sitemapindex>`, new Map(), origin).some((p) => /lists no section/.test(p.message)));
  assert.deepEqual(sectionOf("/sitemaps/cards-12.xml"), { kind: "cards", n: 12 }); assert.equal(sectionOf("/sitemap.xml"), null);
  assert.deepEqual(xmlErrors("<?xml version=\"1.0\"?><a><b></a>").length > 0, true);
  assert.deepEqual(locsOf("<loc>https://x.test/a&amp;b</loc>"), ["https://x.test/a&b"]);
  assert.deepEqual(spread([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4), [1, 4, 7, 10], "an even sample that always keeps the first and last");
  assert.equal(moneyToCents("A$1,234.50"), 123450);
  assert.equal(ldProblem([{ "@type": "A" }, { "@graph": [{ "@type": "B" }] }]), null);
  assert.match(ldProblem({ "@graph": [{ name: "x" }] }) ?? "", /no @type/);
  assert.equal(templateOf("/card/sol-ring").priceBearing, true); assert.equal(templateOf("/blog/x").priceBearing, false); assert.equal(templateOf("/sets/mh3/gallery").priceBearing, false);
});
