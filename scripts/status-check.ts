// scripts/status-check.ts (owner WP19, parity P04): assert HTTP STATUS CODES, not rendered text. Ported from RiftCompare.
//
//   npx tsx scripts/status-check.ts --url http://localhost:3000
//   npx tsx scripts/status-check.ts --url https://mtgcompare.app --ok /,/browse,/sets
//
// Every unresolvable dynamic parameter must return a real 404. This is separate from crawl-check because a crawler only follows links that exist: it can never discover the URLs that matter here, the ones nothing links to and
// anyone can invent. THE BUG IT PREVENTS: a root `loading.tsx` wraps every route in a Suspense boundary, which makes Next stream; the shell flushes with a committed HTTP 200 before the page runs, so a notFound() thrown afterwards
// can only swap the UI, never the status: every unknown /card/... URL answered "200 OK" with the 404 page inside, an unlimited supply of crawlable junk URLs, each a soft 404.
//
// MTG has more dynamic families than a one-game site: a card by slug, a card by set and number (/card/[slug]/[number]), an oracle hub, the taxonomy hubs, a set and its gallery, sealed, commanders and decks. For each:
//   - a bogus parameter returns 404 (not 200, not 500, and not 503: a 503 means the data host was unreachable, which is a different failure the script reports in its own words)
//   - the 404 body is the real not-found page, carries its own <title>, and is not indexable
//   - a KNOWN-GOOD URL on the same router still returns 200 (a fix that 404s everything must not pass)
import { decodeEntities } from "./smoke-pages";

export const USER_AGENT = "MTGCompare-status/1.0 (+https://github.com/Specifxx/mtgcompare)";
/** One bogus parameter per dynamic route family; deliberately varied in shape: a plausible slug, an obvious probe, punctuation, a set/number pair, and a very long string. */
export const MUST_404: string[] = [
  "/card/nonexistent-card-test", "/card/nonexistent-set-test/999z", "/card/mh3/not-a-number-at-all", "/card/" + "x".repeat(300),
  "/cards/name/nonexistent-oracle-test", "/cards/rarity/nonexistent-rarity-test", "/cards/type/nonexistent-type-test", "/cards/treatment/nonexistent-treatment-test",
  "/colors/nonexistent-colour-test", "/keywords/nonexistent-keyword-test",
  "/sets/nonexistent-set-test", "/sets/nonexistent-set-test/gallery", "/sealed/nonexistent-product-test",
  "/commanders/nonexistent-commander-test", "/decks/nonexistent-deck-test", "/decks/commander/nonexistent-commander-test",
  "/stores/nonexistent-store-test", "/blog/nonexistent-post-test", "/guides/nonexistent-guide-test", "/authors/nonexistent-author-test",
  "/c/nonexistent-collection-token",
  // not a dynamic parameter: the router's own 404, so a regression in routing-level 404s is caught by the same script
  "/this-route-does-not-exist-at-all", "/browse/deeper/than/it/goes",
];
/** Dynamic ROUTE HANDLERS: they never render the React not-found page (markdown, XML, JSON or a widget), so only the status line is asserted. */
export const MUST_404_RAW: string[] = ["/sitemaps/nonexistent-section-1.xml", "/api/card/nonexistent-card-test", "/api/sealed/nonexistent-product-test", "/llm/card/nonexistent-card-test"];
/** URLs that must KEEP returning 200: the other half of the check. */
export const MUST_200_DEFAULT = "/,/browse,/sets,/sealed,/price-guide,/movers,/market,/stores,/about,/privacy,/terms,/guides,/blog".split(",");

export interface Probe { status: number; location: string | null; isNotFoundPage: boolean; title: string; robots: string[]; length: number }
const NOT_FOUND_COPY = /doesn(?:'|&#x27;|&#39;|&apos;)t exist|not found|404/i;
export function readProbe(status: number, location: string | null, html: string): Probe {
  return {
    status, location, length: html.length, isNotFoundPage: NOT_FOUND_COPY.test(html.slice(0, 200_000)),
    title: decodeEntities((/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").trim()),
    // every <meta name="robots">, decoded and lower-cased: a 404 that also says "index, follow" tells Google two things at once
    robots: [...html.matchAll(/<meta[^>]+name="robots"[^>]*content="([^"]*)"/gi)].map((m) => decodeEntities(m[1]!).toLowerCase()),
  };
}
/** Problems with one expected-404 probe against the home page's title (a 404 that carries the home title is a template bug). */
export function judge404(p: Probe, homeTitle: string, raw: boolean): string[] {
  if (p.status === 503) return [`HTTP 503: the data host was unreachable, so the page could not decide (this is the stale-while-error answer, not a missing card)`];
  if (p.status !== 404) return [`HTTP ${p.status}, expected 404${p.status === 200 ? " (a soft 404: the router committed a 200 before notFound() ran)" : ""}`];
  if (raw) return [];
  const out: string[] = [];
  if (!p.isNotFoundPage) out.push("the 404 body is not the site's not-found page");
  if (p.title && homeTitle && p.title === homeTitle) out.push("the 404 carries the HOME page's title");
  if (p.robots.some((r) => /\bindex\b/.test(r) && !/noindex/.test(r))) out.push(`the 404 says robots "${p.robots.join(", ")}"`);
  return out;
}
async function probe(base: string, p: string): Promise<Probe & { html: string }> {
  const res = await fetch(`${base}${p}`, { redirect: "manual", headers: { "user-agent": USER_AGENT, accept: "text/html" }, signal: AbortSignal.timeout(60_000) });
  const html = res.status < 300 || res.status >= 400 ? await res.text() : "";
  return { ...readProbe(res.status, res.headers.get("location"), html), html };
}
export async function main(argv: readonly string[]): Promise<number> {
  const arg = (n: string, d: string): string => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1]! : d; };
  const base = arg("--url", "http://localhost:3000").replace(/\/$/, ""), ok = arg("--ok", MUST_200_DEFAULT.join(",")).split(",").map((s) => s.trim()).filter(Boolean);
  let failures = 0; const bad = (m: string): void => { failures++; console.log(`  x ${m}`); };
  console.log(`Status codes of ${base}\n`);
  const home = await probe(base, "/").catch(() => null);
  for (const [group, list, raw] of [["unknown parameters (pages)", MUST_404, false], ["unknown parameters (route handlers)", MUST_404_RAW, true]] as const) {
    console.log(group);
    for (const p of list) {
      let problems: string[]; try { const r = await probe(base, p); problems = judge404(r, home?.title ?? "", raw); } catch (e) { problems = [`fetch failed: ${(e as Error).message}`]; }
      if (problems.length) for (const m of problems) bad(`${p.slice(0, 70)}: ${m}`); else console.log(`  + ${p.slice(0, 70)}`);
    }
  }
  console.log("known-good URLs");
  for (const p of ok) {
    let status = 0; try { status = (await probe(base, p)).status; } catch { /* reported below */ }
    if (status !== 200) bad(`${p}: HTTP ${status}, expected 200 (a fix that 404s everything must not pass)`); else console.log(`  + ${p}`);
  }
  console.log(failures ? `\n::error::${failures} status-code problem(s).` : "\nEvery unknown parameter answers 404 and every known page 200.");
  return failures ? 1 : 0;
}
if (process.argv[1] && /scripts[\\/]status-check\.ts$/.test(process.argv[1])) main(process.argv.slice(2)).then((c) => { process.exitCode = c; }).catch((e) => { console.error(e); process.exitCode = 1; });
