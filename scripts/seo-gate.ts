// scripts/seo-gate.ts (owner WP19, parity P04): the pre-deploy SEO gate for the generated page surface. Ported from RiftCompare, whose 530 lines exist because a price-comparison site fails SEO in a way a content site does not: a
// wrong figure shown to a shopper is a different class of failure from a slow crawl. At Magic's scale (about 35,000 indexable printings, 15,000 oracle hubs, 3,400 commanders) the risk is thin and near-duplicate generated pages.
//
//   npx tsx scripts/seo-gate.ts --plan [--dir .data]             no server: the sitemap plan the published data implies (sm/plan.json) and the number of section files
//   npx tsx scripts/seo-gate.ts --url http://localhost:3000      the full gate
//   npx tsx scripts/seo-gate.ts --url https://mtgcompare.app --max 1500 --concurrency 6
//
// WHY SEPARATE FROM scripts/crawl-check.ts: crawl-check walks the site from the home page and reports navigation health. This walks the SITEMAP and asserts PUBLICATION correctness. The checks:
//   1. Sitemap validity: the index and every child are well-formed XML; children are named /sitemaps/<kind>-<n>.xml; no section holds more than SITEMAP_SECTION_MAX URLs (the protocol allows 50,000; contract 4.5 uses 10,000).
//   2. Every sampled submitted URL returns 200 (no redirect, no 404, no 5xx), is on our origin and carries no query string (a `?finish=` variant is never submitted: Annex C check 17).
//   3. Per page: a title, a meta description, exactly one self-referencing canonical, no robots noindex on a SUBMITTED url (a THIN page is noindex and out of the sitemap, so the two must agree), valid typed JSON-LD, every <img> has an alt.
//   4. No two sampled pages share a title or a description.
//   5. Thin content: at least MIN_WORDS words of visible SERVER-rendered text.
//   6. Price integrity: every money figure on a price-bearing page parses to a real number in a sane band (zero only where it is a fact: free postage); no NaN, Infinity or undefined after a currency symbol.
// The sample is spread evenly over every section (--max pages in all), because the cards section alone is 4 files of 10,000 and walking it whole would be a crawl of 35,000 pages. Exit 1 on the first failing gate set.
import fs from "node:fs";
import path from "node:path";
import { SITEMAP_SECTION } from "../src/lib/data/plane/shards";
import { decodeEntities, jsonLdBlocks, parseHead, visibleText } from "./smoke-pages";

export const USER_AGENT = "MTGCompare-seo-gate/1.0 (+https://github.com/Specifxx/mtgcompare)";
/** The most URLs a section file may list: SITEMAP_SECTION_SIZE of src/lib/data/sitemap.ts (10,000), written as shards.ts SITEMAP_SECTION. The sitemap protocol allows 50,000 URLs and 50 MB. */
export const SITEMAP_SECTION_MAX = SITEMAP_SECTION;
export const SITEMAP_PROTOCOL_MAX = 50_000;
/** Below this many words of visible server-rendered text a submitted page is thin. Matches the 150-word floor of RiftCompare's audit so the two cannot disagree about "thin". */
export const MIN_WORDS = 150;
export const MIN_CENTS = 1, MAX_CENTS = 100_000_000;       // a quote under 1 cent or over $1,000,000 is a data fault (the dearest real quote on 2026-10-07 is $203,067)
export const SECTION_KINDS = ["static", "sets", "sealed", "commanders", "names", "cards"] as const;

const TEMPLATES: [name: string, test: (p: string) => boolean, priceBearing: boolean][] = [
  ["card/[slug]", (p) => /^\/card\/[^/]+$/.test(p), true],
  ["cards/name/[oracle]", (p) => p.startsWith("/cards/name/"), true],
  ["cards/facet", (p) => /^\/cards\/(type|rarity|treatment)\//.test(p), true],
  ["colors + keywords", (p) => /^\/(colors|keywords)\//.test(p), true],
  ["sets/gallery", (p) => /^\/sets\/[^/]+\/gallery$/.test(p), false],
  ["sets/[slug]", (p) => /^\/sets\/[^/]+$/.test(p), true],
  ["sealed/[slug]", (p) => /^\/sealed\/[^/]+$/.test(p), true],
  ["commanders/[slug]", (p) => /^\/commanders\/[^/]+$/.test(p), true],
  ["decks", (p) => p.startsWith("/decks/"), true],
  ["stores/[slug]", (p) => /^\/stores\/[^/]+$/.test(p), true],
  ["guides + blog", (p) => /^\/(guides|blog)\/[^/]+$/.test(p), false],
  ["authors", (p) => p.startsWith("/authors/"), false],
];
export function templateOf(p: string): { name: string; priceBearing: boolean } {
  for (const [name, t, priceBearing] of TEMPLATES) if (t(p)) return { name, priceBearing };
  return { name: "static", priceBearing: false };
}
/** Well-formedness, dependency-free: catches what actually breaks a sitemap (an unescaped ampersand, a stray "<" in a URL, an unclosed tag). */
export function xmlErrors(xml: string): string[] {
  const errs: string[] = [];
  if (!xml.startsWith("<?xml")) errs.push("missing XML declaration");
  const badAmp = xml.match(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g);
  if (badAmp) errs.push(`${badAmp.length} unescaped "&" (must be &amp;)`);
  const stack: string[] = [], tagRe = /<\/?([A-Za-z_][\w:.-]*)([^>]*?)(\/?)>/g; let m: RegExpExecArray | null;
  while ((m = tagRe.exec(xml))) {
    const [raw, name, , selfClose] = m;
    if (raw!.startsWith("<?") || raw!.startsWith("<!")) continue;
    if (raw!.startsWith("</")) { const open = stack.pop(); if (open !== name) errs.push(`closing </${name}> does not match <${open ?? "nothing"}>`); } else if (!selfClose) stack.push(name!);
  }
  if (stack.length) errs.push(`unclosed tag(s): ${stack.join(", ")}`);
  return errs;
}
export const locsOf = (xml: string): string[] => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decodeEntities(m[1]!));
/** `/sitemaps/cards-2.xml` -> { kind: "cards", n: 2 } or null. */
export const sectionOf = (pathname: string): { kind: string; n: number } | null => { const m = /^\/sitemaps\/([a-z]+)-(\d+)\.xml$/.exec(pathname); return m ? { kind: m[1]!, n: Number(m[2]) } : null; };
/** An even sample of `want` items from a list (always the first and the last, so a section's edges are covered). */
export function spread<T>(items: readonly T[], want: number): T[] {
  if (items.length <= want) return [...items];
  if (want <= 1) return items.slice(0, Math.max(0, want));
  return Array.from({ length: want }, (_, i) => items[Math.round((i * (items.length - 1)) / (want - 1))]!);
}
const SYMBOLS = String.raw`(?:A\$|US\$|C\$|S\$|£|€|\$)`;
const MONEY_RE = new RegExp(`${SYMBOLS}\\s?-?[\\d,]+(?:\\.\\d{1,2})?`, "g"), BROKEN_MONEY_RE = new RegExp(`${SYMBOLS}\\s*(?:NaN|Infinity|undefined|null)`, "i");
/** Contexts where a rendered zero is a FACT (free postage, a saving of nothing); a zero anywhere else is a null summed as 0. */
const ZERO_IS_LEGAL = /^\s*(?:postage|shipping|delivery|freight|saved|savings?|discount|fees?)\b/i;
export interface PageFacts { path: string; status: number; title: string; description: string; canonicals: string[]; noindex: boolean; jsonLd: string[]; words: number; money: { raw: string; after: string }[]; brokenMoney: boolean; imgWithoutAlt: number; error?: string }
/** Reads one fetched page into the facts the gates judge (pure). */
export function readFacts(p: string, status: number, html: string, xRobots: string | null): PageFacts {
  const head = parseHead(html), body = visibleText(html), money: PageFacts["money"] = [];
  for (const m of body.matchAll(MONEY_RE)) money.push({ raw: m[0], after: body.slice(m.index! + m[0].length, m.index! + m[0].length + 24) });
  return {
    path: p, status, title: head.title, description: head.description, canonicals: head.canonicals, noindex: /noindex/.test(head.robots) || /noindex/i.test(xRobots ?? ""), jsonLd: jsonLdBlocks(html),
    words: body ? body.split(" ").length : 0, money, brokenMoney: BROKEN_MONEY_RE.test(body),
    imgWithoutAlt: [...html.matchAll(/<img\b[^>]*>/gi)].filter((m) => !/\balt\s*=/.test(m[0])).length,
  };
}
export const moneyToCents = (s: string): number | null => { const n = Number(s.replace(/[^0-9.-]/g, "")); return Number.isFinite(n) ? Math.round(n * 100) : null; };
/** Every node of a JSON-LD block must be an object with an @type; an @graph envelope is unwrapped. */
export function ldProblem(parsed: unknown): string | null {
  const nodes = Array.isArray(parsed) ? parsed : [parsed];
  for (const n of nodes) {
    if (!n || typeof n !== "object") return "node is not an object";
    const node = n as Record<string, unknown>;
    if (Array.isArray(node["@graph"])) { const r = ldProblem(node["@graph"]); if (r) return r; continue; }
    if (!("@type" in node)) return `node has no @type: ${Object.keys(node).slice(0, 4).join(",")}`;
  }
  return null;
}
export interface GateProblem { gate: string; where: string; message: string }
/** Judges a set of pages (pure): metadata, structured data, duplicates, thin content, price integrity. */
export function judgePages(pages: readonly PageFacts[], origin: string, minWords = MIN_WORDS): GateProblem[] {
  const out: GateProblem[] = [], add = (gate: string, where: string, message: string) => out.push({ gate, where, message });
  const ok = pages.filter((p) => p.status === 200 && !p.error);
  for (const p of pages) if (p.status !== 200 || p.error) add("status", p.path, p.error ?? `HTTP ${p.status}`);
  for (const p of ok) {
    if (!p.title) add("metadata", p.path, "empty <title>");
    if (!p.description) add("metadata", p.path, "empty meta description");
    if (p.canonicals.length !== 1) add("canonical", p.path, `${p.canonicals.length} canonical tags (need exactly 1)`);
    else { const self = new URL(p.canonicals[0]!, origin).pathname.replace(/\/$/, "") || "/", own = p.path.replace(/\/$/, "") || "/"; if (self !== own) add("canonical", p.path, `canonical points at ${self}`); }
    if (p.noindex) add("indexability", p.path, "submitted in the sitemap but noindex (a THIN page is noindex AND out of the sitemap)");
    for (const raw of p.jsonLd) { try { const r = ldProblem(JSON.parse(raw)); if (r) add("structured-data", p.path, r); } catch (e) { add("structured-data", p.path, `invalid JSON-LD: ${String(e).slice(0, 80)}`); } }
    if (p.imgWithoutAlt) add("alt", p.path, `${p.imgWithoutAlt} <img> without an alt attribute in the server HTML`);
    if (p.words < minWords) add("thin", p.path, `${p.words} words of server-rendered text (< ${minWords})`);
    if (templateOf(p.path).priceBearing) {
      for (const hit of p.money) {
        const cents = moneyToCents(hit.raw);
        if (cents == null) add("price", p.path, `unparseable money figure ${JSON.stringify(hit.raw)}`);
        else if (cents === 0) { if (!ZERO_IS_LEGAL.test(hit.after)) add("price", p.path, `published a zero price (${hit.raw}${hit.after.trim() ? ` ${hit.after.trim()}` : ""}): a null summed as 0`); }
        else if (cents < MIN_CENTS || cents > MAX_CENTS) add("price", p.path, `out-of-range price ${hit.raw}`);
      }
      if (p.brokenMoney) add("price", p.path, "rendered a non-numeric price (NaN/Infinity/undefined after a currency symbol)");
    }
  }
  for (const key of ["title", "description"] as const) {
    const by = new Map<string, string[]>(); for (const p of ok) if (p[key]) (by.get(p[key]) ?? by.set(p[key], []).get(p[key])!).push(p.path);
    for (const [v, ps] of by) if (ps.length > 1) add("duplicate", ps.slice(0, 3).join(", "), `${ps.length} pages share the ${key} "${v.slice(0, 70)}"`);
  }
  return out;
}
/** Sitemap-level problems from the index and the section files (pure over their text). */
export function judgeSitemaps(indexXml: string, sections: Map<string, string>, origin: string): GateProblem[] {
  const out: GateProblem[] = [], add = (message: string, where = "sitemap") => out.push({ gate: "sitemap", where, message });
  for (const e of xmlErrors(indexXml)) add(e, "/sitemap.xml");
  const children = locsOf(indexXml);
  if (!children.length) add("the index lists no section", "/sitemap.xml");
  const kinds = new Set<string>();
  for (const loc of children) {
    const p = new URL(loc, origin).pathname, s = sectionOf(p);
    if (!s) { add(`${p} is not /sitemaps/<kind>-<n>.xml`, "/sitemap.xml"); continue; }
    kinds.add(s.kind);
    if (!(SECTION_KINDS as readonly string[]).includes(s.kind)) add(`unknown section kind "${s.kind}"`, p);
    const xml = sections.get(p); if (xml === undefined) continue;
    for (const e of xmlErrors(xml)) add(e, p);
    const urls = locsOf(xml);
    if (urls.length > SITEMAP_SECTION_MAX) add(`${urls.length} URLs in one section (cap ${SITEMAP_SECTION_MAX}; the protocol allows ${SITEMAP_PROTOCOL_MAX})`, p);
    if (Buffer.byteLength(xml) > 50 * 1024 * 1024) add("over the 50 MB protocol limit", p);
    for (const u of urls) { if (new URL(u, origin).search) add(`${u} carries a query string (only canonical paths are submitted)`, p); if (!u.startsWith(origin) && !/^https?:\/\/(?:www\.)?[^/]+/.test(u)) add(`${u} is not an absolute URL`, p); }
  }
  for (const k of ["static", "cards"]) if (children.length && !kinds.has(k)) add(`the index has no "${k}" section`, "/sitemap.xml");
  return out;
}

async function get(base: string, p: string): Promise<{ status: number; text: string; xRobots: string | null }> {
  const res = await fetch(`${base}${p}`, { redirect: "manual", headers: { "user-agent": USER_AGENT, accept: "text/html,application/xml" }, signal: AbortSignal.timeout(60_000) });
  return { status: res.status, text: res.status < 300 || res.status >= 400 ? await res.text() : "", xRobots: res.headers.get("x-robots-tag") };
}
async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { for (;;) { const k = i++; if (k >= items.length) return; out[k] = await fn(items[k]!); } }));
  return out;
}
function printPlan(dir: string): number {
  const root = path.join(path.resolve(dir), "v1", "sm"), plan = path.join(root, "plan.json");
  if (!fs.existsSync(plan)) { console.log(`no ${plan}: run the importer (npm run import:bootstrap) or pass --dir <PLANE_DIR>`); return 0; }
  // plan.json counts the section FILES of each kind; the URLs are the entries of the files themselves (sm/<kind>-<n>.json, paths of at most SITEMAP_SECTION_MAX)
  const files = JSON.parse(fs.readFileSync(plan, "utf8")) as Record<string, number>;
  console.log("Sitemap plan (v1/sm):"); let total = 0, over = 0;
  for (const k of SECTION_KINDS) {
    const n = typeof files[k] === "number" ? files[k]! : 0; if (k === "static" || !n) continue;
    const sizes = Array.from({ length: n }, (_, i) => { const f = path.join(root, `${k}-${i}.json`); return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, "utf8")) as unknown[]).length : -1; });
    const urls = sizes.filter((x) => x > 0).reduce((a, b) => a + b, 0); total += urls; over += sizes.filter((x) => x > SITEMAP_SECTION_MAX).length;
    console.log(`  ${k.padEnd(11)} ${String(urls).padStart(7)} URLs in ${n} file(s)${sizes.some((x) => x < 0) ? " (a file is missing)" : ""}`);
  }
  console.log(`  total ${total} URLs besides the static pages; every file holds at most ${SITEMAP_SECTION_MAX}${over ? ` - ${over} FILE(S) ARE OVER` : ""}`);
  return over ? 1 : 0;
}
export async function main(argv: readonly string[]): Promise<number> {
  const arg = (n: string, d: string): string => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1]! : d; };
  if (argv.includes("--plan")) return printPlan(arg("--dir", ".data"));
  const base = arg("--url", "").replace(/\/$/, "");
  if (!base) { console.log("No --url given: nothing rendered to gate. --plan prints the sitemap plan; --url <origin> runs the gate."); return 0; }
  const max = Number(arg("--max", "1500")), conc = Number(arg("--concurrency", "6")), origin = new URL(base).origin;
  console.log(`\nSEO gate: ${base}\n`);
  const idx = await get(base, "/sitemap.xml");
  if (idx.status !== 200) { console.log(`x /sitemap.xml returned ${idx.status}`); return 1; }
  const sections = new Map<string, string>(), perSection = new Map<string, string[]>();
  for (const loc of locsOf(idx.text)) {
    const p = new URL(loc, origin).pathname, r = await get(base, p);
    if (r.status !== 200) { console.log(`x ${p} returned ${r.status}`); return 1; }
    sections.set(p, r.text); perSection.set(p, locsOf(r.text).map((u) => new URL(u, origin).pathname));
  }
  const problems = judgeSitemaps(idx.text, sections, origin);
  console.log(`1. Sitemap: ${perSection.size} section file(s), ${[...perSection.values()].reduce((a, b) => a + b.length, 0)} URLs; ${problems.length} problem(s)`);
  const per = Math.max(1, Math.floor(max / Math.max(1, perSection.size))), paths = [...new Set([...perSection.values()].flatMap((u) => spread(u, per)))].slice(0, max);
  console.log(`2. Fetching ${paths.length} submitted URLs, spread over every section`);
  const pages = await pool(paths, conc, async (p): Promise<PageFacts> => { try { const r = await get(base, p); return readFacts(p, r.status, r.text, r.xRobots); } catch (e) { return { path: p, status: 0, title: "", description: "", canonicals: [], noindex: false, jsonLd: [], words: 0, money: [], brokenMoney: false, imgWithoutAlt: 0, error: String(e).slice(0, 120) }; } });
  problems.push(...judgePages(pages, origin));
  const byGate = new Map<string, number>(); for (const p of problems) byGate.set(p.gate, (byGate.get(p.gate) ?? 0) + 1);
  for (const g of ["sitemap", "status", "metadata", "canonical", "indexability", "structured-data", "alt", "thin", "price", "duplicate"]) console.log(`  ${byGate.get(g) ? "x" : "+"} ${g.padEnd(16)} ${byGate.get(g) ?? 0}`);
  for (const p of problems.slice(0, 40)) console.log(`      [${p.gate}] ${p.where}: ${p.message}`);
  if (problems.length > 40) console.log(`      ...and ${problems.length - 40} more`);
  const byTemplate = new Map<string, { total: number; words: number }>();
  for (const p of pages) { const t = templateOf(p.path).name, e = byTemplate.get(t) ?? { total: 0, words: 0 }; e.total++; e.words += p.words; byTemplate.set(t, e); }
  console.log("\nPages sampled per template:"); for (const [name, e] of [...byTemplate].sort((a, b) => b[1].total - a[1].total)) console.log(`  ${name.padEnd(22)} ${String(e.total).padStart(5)}  avg ${Math.round(e.words / e.total)} words`);
  console.log(problems.length ? `\nSEO gate FAILED: ${problems.length} problem(s).` : "\nSEO gate passed.");
  if (problems.length) console.log(`::error::SEO gate: ${problems.length} problem(s).`);
  return problems.length ? 1 : 0;
}
if (process.argv[1] && /scripts[\\/]seo-gate\.ts$/.test(process.argv[1])) main(process.argv.slice(2)).then((c) => { process.exitCode = c; }).catch((e) => { console.error(e); process.exitCode = 1; });
