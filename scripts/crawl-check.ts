// scripts/crawl-check.ts (owner WP19, parity P04): crawl the site from the home page like a bot.
//
//   npx tsx scripts/crawl-check.ts --url http://localhost:3000
//   npx tsx scripts/crawl-check.ts --url https://mtgcompare.app --max 800 --concurrency 6 --out crawl-report.json
//
// "Site navigation difficulties" is a real AdSense rejection category, and it is checked the only way that means anything: start at the home page, follow internal links breadth-first, and see what a crawler actually finds.
// At 100,000 printings the site cannot be crawled whole, so the crawl is CAPPED (--max, default 600) and breadth-first: the shallow half of the site, which is where navigation problems live, is what it covers. Reports:
//   * 404s and 5xxs reachable from the home page          * soft 404s: HTTP 200 with an empty or error body
//   * pages whose server HTML holds no content (a CSR bailout)   * redirect chains longer than one hop
//   * pages more than 4 clicks from the home page          * sitemap orphans: URLs the sitemap submits that nothing on the crawled site links to
//   * metadata hygiene on indexable pages: a unique title and description, exactly one <h1>, a self-referencing canonical, BreadcrumbList structured data
// The report is written to --out (default crawl-report.json in the working directory; not docs/, which the project root owns). Exit 1 when a hard problem is found (broken links, 5xx, empty renders, soft 404s,
// wrong canonicals); duplicate titles and breadcrumbs are reported and counted but only fail the run with --strict.
import fs from "node:fs";
import path from "node:path";
import { h1Count, internalLinks, parseHead, visibleText } from "./smoke-pages";

export const USER_AGENT = "MTGCompare-crawl/1.0 (+https://github.com/Specifxx/mtgcompare)";
/** Routes a crawler meets that are not content pages: they carry their own noindex, need an account, or are machine surfaces. Fetched (to prove they do not error) but exempt from content and metadata assertions. */
export const NON_CONTENT: RegExp[] = [
  /^\/api\//, /^\/_next\//, /^\/login/, /^\/register/, /^\/forgot/, /^\/reset/, /^\/verify/,
  /^\/dashboard/, /^\/profile/, /^\/admin/, /^\/portfolio/, /^\/watching/, /^\/account/, /^\/premium\/(start|welcome)/,
  /^\/unsubscribe/, /^\/newsletter\/unsubscribe/, /^\/alerts\/(action|manage|release)/, /^\/c\//, /^\/rising\//,
  /^\/embed\//, /^\/llm\//, /\.(xml|txt|json|png|jpe?g|svg|ico|webp|webmanifest)$/,
];
export const isNonContent = (p: string): boolean => NON_CONTENT.some((re) => re.test(p));
export const MAX_DEPTH = 4;

export interface Result {
  path: string; depth: number; status: number; redirects: number; finalPath: string; title: string; description: string; h1Count: number; canonical: string | null; noindex: boolean;
  hasBreadcrumbs: boolean; emptyServerRender: boolean; softFourOhFour: boolean; textLength: number; links: string[]; error?: string;
}
export const normalise = (base: string, href: string, from: string): string | null => {
  try { const u = new URL(href, `${base}${from}`); return u.origin === new URL(base).origin ? u.pathname.replace(/\/+$/, "") || "/" : null; } catch { return null; }   // query strings are filter state, not pages
};
/** Reads one fetched page into a Result (pure; the network part is fetchPage). */
export function readPage(base: string, path0: string, depth: number, status: number, hops: number, finalPath: string, html: string): Result {
  const head = parseHead(html), text = visibleText(html.replace(/<header[\s\S]*?<\/header>/gi, " ").replace(/<footer[\s\S]*?<\/footer>/gi, " "));
  const main = /<main[^>]*id="main-content"[^>]*>([\s\S]{0,400})/.exec(html);
  return {
    path: path0, depth, status, redirects: hops, finalPath, title: head.title, description: head.description, h1Count: h1Count(html),
    canonical: head.canonicals[0] ?? null, noindex: /noindex/.test(head.robots), hasBreadcrumbs: html.includes('"@type":"BreadcrumbList"'),
    emptyServerRender: Boolean(main && main[1]!.includes("BAILOUT_TO_CLIENT_SIDE_RENDERING")), softFourOhFour: status === 200 && text.length < 250, textLength: text.length,
    links: [...new Set(internalLinks(html).map((l) => normalise(base, l, finalPath)).filter((p): p is string => !!p && !p.startsWith("/_next")))],
  };
}
async function fetchPage(base: string, p: string, depth: number): Promise<Result> {
  let current = p, hops = 0, res: Response;
  try {
    for (;;) {                                                                   // hops are counted by hand: `follow` hides the chain length, and a chain over one hop is the finding
      res = await fetch(`${base}${current}`, { redirect: "manual", headers: { "user-agent": USER_AGENT, accept: "text/html" }, signal: AbortSignal.timeout(60_000) });
      if (res.status >= 300 && res.status < 400) { const loc = res.headers.get("location"), next = loc ? normalise(base, loc, current) : null; if (!next || hops >= 5) break; current = next; hops++; continue; }
      break;
    }
  } catch (e) { return { path: p, depth, status: 0, redirects: 0, finalPath: p, title: "", description: "", h1Count: 0, canonical: null, noindex: false, hasBreadcrumbs: false, emptyServerRender: false, softFourOhFour: false, textLength: 0, links: [], error: String(e).slice(0, 120) }; }
  return readPage(base, p, depth, res.status, hops, current, await res.text());
}

export interface Report { totals: Record<string, number>; hard: number; soft: number }
/** Counts what the crawl found. Pure over the results; `orphans` are sitemap URLs reached by the crawl that nothing links to. */
export function summarise(all: readonly Result[], orphans: readonly string[]): Report & { detail: Record<string, unknown> } {
  const content = all.filter((r) => !isNonContent(r.path)), indexable = content.filter((r) => r.status === 200 && !r.noindex);
  const dup = (key: "title" | "description"): [string, string[]][] => { const m = new Map<string, string[]>(); for (const r of indexable) if (r[key]) (m.get(r[key]) ?? m.set(r[key], []).get(r[key])!).push(r.path); return [...m].filter(([, ps]) => ps.length > 1); };
  const dt = dup("title"), dd = dup("description");
  const broken = all.filter((r) => r.status >= 400 || r.error), server = all.filter((r) => r.status >= 500), soft = content.filter((r) => r.softFourOhFour), empty = content.filter((r) => r.emptyServerRender);
  const chains = all.filter((r) => r.redirects > 1), deep = content.filter((r) => r.depth > MAX_DEPTH && r.status === 200);
  const wrongH1 = indexable.filter((r) => r.h1Count !== 1), noCanon = indexable.filter((r) => !r.canonical);
  const wrongCanon = indexable.filter((r) => r.canonical && new URL(r.canonical, "http://x").pathname.replace(/\/+$/, "") !== (r.path === "/" ? "" : r.path));
  const noCrumbs = indexable.filter((r) => r.path !== "/" && !r.hasBreadcrumbs);
  const totals = { broken: broken.length, serverErrors: server.length, softFourOhFours: soft.length, emptyServerRender: empty.length, redirectChains: chains.length, tooDeep: deep.length, sitemapOrphans: orphans.length, duplicateTitles: dt.length, duplicateDescriptions: dd.length, missingTitle: indexable.filter((r) => !r.title).length, missingDescription: indexable.filter((r) => !r.description).length, wrongH1Count: wrongH1.length, missingCanonical: noCanon.length, wrongCanonical: wrongCanon.length, missingBreadcrumbs: noCrumbs.length };
  const hard = totals.broken + totals.serverErrors + totals.softFourOhFours + totals.emptyServerRender + totals.wrongCanonical + totals.missingTitle;
  return {
    totals, hard, soft: Object.values(totals).reduce((a, b) => a + b, 0) - hard,
    detail: {
      broken: broken.map((r) => ({ path: r.path, status: r.status, error: r.error })), softFourOhFours: soft.map((r) => ({ path: r.path, textLength: r.textLength })), emptyServerRender: empty.map((r) => r.path),
      redirectChains: chains.map((r) => ({ path: r.path, hops: r.redirects, to: r.finalPath })), tooDeep: deep.map((r) => ({ path: r.path, depth: r.depth })), sitemapOrphans: orphans,
      duplicateTitles: dt.map(([t, ps]) => ({ title: t.slice(0, 70), paths: ps.slice(0, 6) })), duplicateDescriptions: dd.map(([d, ps]) => ({ description: d.slice(0, 70), paths: ps.slice(0, 6) })),
      wrongH1Count: wrongH1.map((r) => ({ path: r.path, h1s: r.h1Count })), missingCanonical: noCanon.map((r) => r.path), wrongCanonical: wrongCanon.map((r) => ({ path: r.path, canonical: r.canonical })), missingBreadcrumbs: noCrumbs.map((r) => r.path).slice(0, 40),
    },
  };
}
export async function main(argv: readonly string[]): Promise<number> {
  const arg = (n: string, d: string): string => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1]! : d; };
  const base = arg("--url", "http://localhost:3000").replace(/\/$/, ""), max = Number(arg("--max", "600")), conc = Number(arg("--concurrency", "6")), out = arg("--out", "crawl-report.json");
  console.log(`\nCrawling ${base} from the home page (at most ${max} pages, ${conc} at a time)\n`);
  const results = new Map<string, Result>(), inbound = new Map<string, Set<string>>(), seen = new Set<string>(["/"]);
  let frontier: { path: string; depth: number }[] = [{ path: "/", depth: 0 }];
  while (frontier.length && results.size < max) {
    const batch = frontier.splice(0, conc), got = await Promise.all(batch.map((b) => fetchPage(base, b.path, b.depth))), next: { path: string; depth: number }[] = [];
    for (const r of got) {
      results.set(r.path, r);
      for (const l of r.links) { (inbound.get(l) ?? inbound.set(l, new Set()).get(l)!).add(r.path); if (!seen.has(l) && results.size + next.length < max) { seen.add(l); next.push({ path: l, depth: r.depth + 1 }); } }
    }
    frontier = [...frontier, ...next].sort((a, b) => a.depth - b.depth);                       // breadth-first: depth order is what makes "clicks from the home page" mean anything
    process.stdout.write(`\r  crawled ${results.size}, frontier ${frontier.length}   `);
  }
  process.stdout.write("\n");
  // sitemap orphans: only for URLs the crawl reached (an unvisited URL beyond the cap has an unknown inbound count, not a zero one); the first sections only, a section is up to 10,000 URLs
  let orphans: string[] = [];
  try {
    const index = await (await fetch(`${base}/sitemap.xml`, { headers: { "user-agent": USER_AGENT } })).text(), submitted = new Set<string>();
    for (const c of [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname).slice(0, Number(arg("--sitemap-sections", "3")))) {
      for (const m of (await (await fetch(`${base}${c}`, { headers: { "user-agent": USER_AGENT } })).text()).matchAll(/<loc>([^<]+)<\/loc>/g)) submitted.add(new URL(m[1]!).pathname.replace(/\/+$/, "") || "/");
    }
    orphans = [...submitted].filter((p) => p !== "/" && results.has(p) && !(inbound.get(p)?.size));          // the crawl root has no inbound link by construction
  } catch { /* an unreachable sitemap is seo-gate's finding, not this script's */ }
  const all = [...results.values()], rep = summarise(all, orphans);
  fs.writeFileSync(path.resolve(out), JSON.stringify({ generatedAt: new Date().toISOString(), base, crawled: all.length, maxDepth: MAX_DEPTH, totals: rep.totals, detail: rep.detail }, null, 2));
  console.log(`Crawled ${all.length} URLs, ${all.filter((r) => !isNonContent(r.path)).length} content pages\n`);
  for (const [k, v] of Object.entries(rep.totals)) console.log(`  ${v === 0 ? "+" : "x"} ${k.padEnd(24)} ${v}`);
  for (const [label, list] of [["broken", rep.detail.broken], ["soft-404", rep.detail.softFourOhFours], ["empty server render", rep.detail.emptyServerRender], ["wrong canonical", rep.detail.wrongCanonical], ["redirect chain", rep.detail.redirectChains], ["too deep", rep.detail.tooDeep], ["orphan", rep.detail.sitemapOrphans]] as [string, unknown[]][]) {
    for (const item of list.slice(0, 10)) console.log(`      ${label}: ${typeof item === "string" ? item : JSON.stringify(item)}`);
  }
  console.log(`\nWrote ${out}`);
  if (rep.hard) console.error(`::error::${rep.hard} hard crawl problem(s).`);
  return rep.hard || (argv.includes("--strict") && rep.soft) ? 1 : 0;
}
if (process.argv[1] && /scripts[\\/]crawl-check\.ts$/.test(process.argv[1])) main(process.argv.slice(2)).then((c) => { process.exitCode = c; }).catch((e) => { console.error(e); process.exitCode = 1; });
