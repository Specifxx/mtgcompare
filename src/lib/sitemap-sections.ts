// The sectioned sitemaps (contract 4.5, parity P01): /sitemap.xml is a <sitemapindex>, /sitemaps/<kind>-<n>.xml the <urlset> children, at most SITEMAP_SECTION_SIZE (10,000) URLs each, so the roughly 58,000 URLs of the real catalogue are
// 10 files and Search Console reports coverage per section. PURE: the route handlers read the plan and the slug lists through the loaders of src/lib/data/sitemap.ts (published files) and hand them to the functions below, which only shape text.
//
// What may be listed (the rules the tests pin):
//   * a slug is a path segment, never a query: anything with "?", "#", "/", whitespace or a capital is dropped, so `?finish=` URLs can never reach a sitemap (the canonical URL of a card is the bare slug, 4.2);
//   * THIN card pages, unlisted rows, class 1 to 4 and unpriced Reserved List rows are not in the cards files at all (the importer writes only track.ts isIndexable rows); this module keeps no card list of its own;
//   * lastmod is the day of the data the pages show (the pointer's priceDay), never `new Date()`: a sitemap that stamps every URL with "now" teaches crawlers to distrust it. Evergreen pages carry no lastmod.
import { REGION_HOME_PATH } from "./seo";
import { SITE_URL } from "./site";
import { COLOR_PAGES } from "./constants";
import { RARITY_FACETS, TREATMENT_FACETS, TYPE_FACETS } from "./facets";
import { SITEMAP_SECTION_SIZE, type SitemapKind, type SitemapPlan } from "./data/sitemap";

export { SITEMAP_SECTION_SIZE };
/** The order of the sections in the index: the fixed pages first, then the data-backed kinds from the smallest to the largest. */
export const SECTION_KINDS: readonly SitemapKind[] = ["static", "sets", "sealed", "commanders", "names", "cards"];
export type ChangeFreq = "daily" | "weekly" | "monthly" | "yearly";
export interface SitemapEntry { loc: string; lastmod?: string; changefreq?: ChangeFreq; priority?: number }
export interface SectionRef { kind: SitemapKind; index: number; file: string; loc: string }

/** The path prefix of each data-backed kind: the file holds slugs, the route prefixes them. */
export const KIND_PREFIX: Record<Exclude<SitemapKind, "static">, string> = { sets: "/sets/", sealed: "/sealed/", commanders: "/commanders/", names: "/cards/name/", cards: "/card/" };
const KIND_FREQ: Record<Exclude<SitemapKind, "static">, { changefreq: ChangeFreq; priority: number }> = {
  sets: { changefreq: "weekly", priority: 0.7 }, sealed: { changefreq: "daily", priority: 0.7 }, commanders: { changefreq: "weekly", priority: 0.6 }, names: { changefreq: "daily", priority: 0.6 }, cards: { changefreq: "daily", priority: 0.6 },
};

/** A file name in the index: "cards-3.xml". */
export const sectionFile = (kind: SitemapKind, index: number): string => `${kind}-${index}.xml`;
export const sectionUrl = (kind: SitemapKind, index: number): string => `${SITE_URL}/sitemaps/${sectionFile(kind, index)}`;
/** The route's param ("cards-3.xml") back to a section, or null for anything that is not one: an unknown kind or a malformed index is a 404, never an empty urlset. */
export function parseSectionParam(param: string): { kind: SitemapKind; index: number } | null {
  const m = /^([a-z]+)-(0|[1-9]\d{0,3})\.xml$/.exec(param);
  if (!m) return null;
  const kind = SECTION_KINDS.find((k) => k === m[1]);
  return kind ? { kind, index: Number(m[2]) } : null;
}
/** Every section the plan implies, in index order. A kind with no files contributes nothing; `static` is always one file. */
export function sectionRefs(plan: SitemapPlan): SectionRef[] {
  return SECTION_KINDS.flatMap((kind) => Array.from({ length: kind === "static" ? 1 : Math.max(0, plan[kind]) }, (_, index) => ({ kind, index, file: sectionFile(kind, index), loc: sectionUrl(kind, index) })));
}
/** Is (kind, index) a section of this plan? The route answers 404 otherwise. */
export const inPlan = (plan: SitemapPlan, kind: SitemapKind, index: number): boolean => index >= 0 && index < (kind === "static" ? 1 : plan[kind]);

/** A slug the sitemap may print: lower-case letters, digits and hyphens, nothing else. */
export const isSafeSlug = (s: unknown): s is string => typeof s === "string" && s.length > 0 && s.length <= 200 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);
/** A site path the sitemap may print: a rooted path with no query, fragment or whitespace ("" is the home page). */
export const isSafePath = (p: string): boolean => p === "" || /^\/[A-Za-z0-9._~\-/]*$/.test(p);

/** The entries of one data-backed section: slugs to absolute URLs, unsafe and duplicate slugs dropped, at most SITEMAP_SECTION_SIZE. */
export function sectionEntries(kind: Exclude<SitemapKind, "static">, slugs: readonly string[], lastmod?: string): SitemapEntry[] {
  const seen = new Set<string>(), out: SitemapEntry[] = [], { changefreq, priority } = KIND_FREQ[kind];
  for (const s of slugs) {
    if (out.length >= SITEMAP_SECTION_SIZE) break;
    if (!isSafeSlug(s) || seen.has(s)) continue;
    seen.add(s);
    out.push({ loc: `${SITE_URL}${KIND_PREFIX[kind]}${s}`, ...(lastmod ? { lastmod } : {}), changefreq, priority });
  }
  return out;
}

/** The pages of the site that are not rows of the catalogue. [path, changefreq, priority, dated]: `dated` pages show the day's data and take the pointer's priceDay as lastmod; evergreen pages carry none. */
const FIXED: readonly (readonly [path: string, freq: ChangeFreq, priority: number, dated: boolean])[] = [
  ["", "daily", 1, true],
  ["/browse", "daily", 0.9, true], ["/price-guide", "daily", 0.8, true], ["/singles", "daily", 0.9, true], ["/sealed", "daily", 0.8, true], ["/sets", "weekly", 0.8, true],
  ["/market", "daily", 0.8, true], ["/market/records", "daily", 0.7, true], ["/movers", "daily", 0.8, true], ["/stores", "weekly", 0.5, true],
  ["/commanders", "weekly", 0.8, true], ["/colors", "weekly", 0.7, false], ["/keywords", "weekly", 0.7, false], ["/cards", "weekly", 0.7, false], ["/cards/all", "daily", 0.7, true], ["/cards/rarity", "weekly", 0.7, false],
  ["/gallery", "daily", 0.8, true], ["/deck", "weekly", 0.7, false], ["/release-dates", "daily", 0.8, false], ["/preorders", "daily", 0.8, true],
  ["/tools", "weekly", 0.8, false], ["/tools/deal-finder", "daily", 0.7, true], ["/tools/rising", "daily", 0.6, true], ["/tools/demand", "daily", 0.6, true], ["/tools/box-ev", "daily", 0.7, true], ["/tools/best-basket", "weekly", 0.8, false], ["/tools/selling-fees", "monthly", 0.7, false],
  ["/trade", "monthly", 0.7, false], ["/alerts", "monthly", 0.6, false], ["/premium", "monthly", 0.6, false], ["/stores/suggest", "monthly", 0.5, false],
  ["/blog", "daily", 0.8, false], ["/guides", "daily", 0.8, false], ["/learn", "monthly", 0.8, false], ["/authors", "monthly", 0.5, false], ["/editorial-policy", "monthly", 0.5, false], ["/methodology", "monthly", 0.5, false],
  ["/about", "monthly", 0.5, false], ["/creators", "monthly", 0.4, false], ["/embed", "monthly", 0.4, false], ["/contact", "monthly", 0.4, false], ["/support", "monthly", 0.4, false], ["/privacy", "yearly", 0.3, false], ["/terms", "yearly", 0.3, false],
];
const REGION_PATHS = Object.values(REGION_HOME_PATH).filter((p) => p !== "/");

/** What the route can add to the fixed list: each is read (or imported) by the route, and a read that fails contributes nothing. */
export interface StaticExtras {
  postHrefs?: readonly string[];       // /blog/<slug> and /guides/<slug> (lib/blog postHref)
  authorSlugs?: readonly string[];     // /authors/<slug>
  keywordSlugs?: readonly string[];    // /keywords/<slug> for the hubs the keyword page indexes
  deckPaths?: readonly string[];       // /decks/<slug>, /decks/commander/<slug> of the published library (the one allowed public Neon read)
  storeKeys?: readonly string[];       // /stores/<key> for stores with stock
}
/** The `static` section: fixed pages, the five region homes, the colour, rarity, type and treatment hubs, then the extras. No query strings, no duplicates, at most SITEMAP_SECTION_SIZE. */
export function staticEntries(lastmod: string | undefined, extra: StaticExtras = {}): SitemapEntry[] {
  const out: SitemapEntry[] = [], seen = new Set<string>();
  const add = (path: string, changefreq: ChangeFreq, priority: number, dated: boolean) => {
    if (out.length >= SITEMAP_SECTION_SIZE || !isSafePath(path) || seen.has(path)) return;
    seen.add(path);
    out.push({ loc: `${SITE_URL}${path}`, ...(dated && lastmod ? { lastmod } : {}), changefreq, priority });
  };
  for (const [path, freq, priority, dated] of FIXED) add(path, freq, priority, dated);
  for (const p of REGION_PATHS) add(p, "daily", 0.9, true);
  for (const k of COLOR_PAGES) add(`/colors/${k}`, "weekly", 0.6, false);
  for (const f of RARITY_FACETS) add(`/cards/rarity/${f.slug}`, "weekly", 0.6, false);
  for (const f of TYPE_FACETS) add(`/cards/type/${f.slug}`, "weekly", 0.6, false);
  for (const f of TREATMENT_FACETS) add(`/cards/treatment/${f.slug}`, "weekly", 0.5, false);
  for (const h of extra.postHrefs ?? []) add(h, "weekly", 0.7, false);
  for (const s of extra.authorSlugs ?? []) if (isSafeSlug(s)) add(`/authors/${s}`, "monthly", 0.4, false);
  for (const s of extra.keywordSlugs ?? []) if (isSafeSlug(s)) add(`/keywords/${s}`, "weekly", 0.5, false);
  for (const p of extra.deckPaths ?? []) add(p, "weekly", 0.5, false);
  for (const k of extra.storeKeys ?? []) if (isSafeSlug(k)) add(`/stores/${k}`, "weekly", 0.5, true);
  return out;
}

/** An optional read of the static section: a rejection AND a throw before any promise exists both mean "nothing to add", so one failing source can never turn the whole section into a 503. */
export const optionalRead = <T,>(read: () => Promise<T>, fallback: T): Promise<T> => Promise.resolve().then(read).catch(() => fallback);

/** Hubs of the keyword glossary the sitemap lists: a keyword shared by fewer oracles is a thin page (REQ-WP15-6 asks the keyword pages for the same cut, so the map never lists a noindex URL). */
export const KEYWORD_SITEMAP_MIN = 5;
/** The deck library's paths: /decks itself only once a deck is live (an empty library is noindexed), then each deck and each commander's deck page. */
export function deckPaths(decks: readonly { slug: string; commanderSlug: string }[]): string[] {
  if (!decks.length) return [];
  const commanders = [...new Set(decks.map((d) => d.commanderSlug).filter(isSafeSlug))];
  return ["/decks", ...commanders.map((c) => `/decks/commander/${c}`), ...decks.filter((d) => isSafeSlug(d.slug)).map((d) => `/decks/${d.slug}`)];
}

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
/** <sitemapindex> of the sections; each carries the pointer's priceDay as lastmod when there is one. */
export function indexXml(refs: readonly SectionRef[], lastmod?: string): string {
  const body = refs.map((r) => `  <sitemap><loc>${esc(r.loc)}</loc>${lastmod ? `<lastmod>${esc(lastmod)}</lastmod>` : ""}</sitemap>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
}
/** <urlset> of one section. */
export function urlsetXml(entries: readonly SitemapEntry[]): string {
  const body = entries
    .map((e) => `  <url><loc>${esc(e.loc)}</loc>${e.lastmod ? `<lastmod>${esc(e.lastmod)}</lastmod>` : ""}${e.changefreq ? `<changefreq>${e.changefreq}</changefreq>` : ""}${e.priority != null ? `<priority>${e.priority.toFixed(1)}</priority>` : ""}</url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}
