// The sectioned sitemaps (contract 4.5, parity P01): the index at /sitemap.xml, the children at /sitemaps/<kind>-<n>.xml, at most 10,000 URLs each. Owner WP15.
// Pure shaping is tested on real slugs of the 57-product Annex A fixture; the loaders are read through a published tree on disk (PLANE_DIR) holding the sm/ files the importer writes;
// the real 2026-10-07 bootstrap tree (.data, git-ignored) is checked when it is present.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { realMiniTree, writePlaneDir } from "./helpers/data-source";
import { resetPlaneForTests } from "../src/lib/data/plane/runtime";
import { isIndexable } from "../src/lib/track";
import { PRICE_MASK } from "../src/lib/constants";
import { SITE_URL } from "../src/lib/site";
import { getSitemapPlan, getSitemapSection, SITEMAP_SECTION_SIZE } from "../src/lib/data/sitemap";
import { SITEMAP_SECTION } from "../src/lib/data/plane/shards";
import {
  KEYWORD_SITEMAP_MIN, SECTION_KINDS, deckPaths, inPlan, indexXml, isSafePath, isSafeSlug, optionalRead, parseSectionParam, sectionEntries, sectionFile, sectionRefs, sectionUrl, staticEntries, urlsetXml,
} from "../src/lib/sitemap-sections";

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const PRICE_DAY = "2026-10-07";

test("the bound: 10,000 URLs a file, far under the protocol's 50,000, and the publisher writes the same number", () => {
  assert.equal(SITEMAP_SECTION_SIZE, 10_000);
  assert.ok(SITEMAP_SECTION_SIZE <= 50_000);
  assert.equal(SITEMAP_SECTION, SITEMAP_SECTION_SIZE, "shards.ts SITEMAP_SECTION (the importer) and data/sitemap.ts SITEMAP_SECTION_SIZE (the route) are one number");
});

test("the plan of the real catalogue is ten files: static 1, sets 1, sealed 1, commanders 1, names 2, cards 4 (about 58,000 URLs)", () => {
  const plan = { static: 1, sets: 1, sealed: 1, commanders: 1, names: 2, cards: 4 };
  const refs = sectionRefs(plan);
  assert.deepEqual(refs.map((r) => r.file), ["static-0.xml", "sets-0.xml", "sealed-0.xml", "commanders-0.xml", "names-0.xml", "names-1.xml", "cards-0.xml", "cards-1.xml", "cards-2.xml", "cards-3.xml"]);
  assert.equal(refs[6]!.loc, `${SITE_URL}/sitemaps/cards-0.xml`);
  assert.equal(refs[0]!.kind, "static", "the fixed pages come first");
  assert.deepEqual(SECTION_KINDS, ["static", "sets", "sealed", "commanders", "names", "cards"], "the six kinds of contract 4.5");
  // an empty kind contributes nothing, but static is always one file
  assert.deepEqual(sectionRefs({ static: 1, sets: 0, sealed: 0, commanders: 0, names: 0, cards: 0 }).map((r) => r.file), ["static-0.xml"]);
  assert.equal(sectionFile("cards", 3), "cards-3.xml");
  assert.equal(sectionUrl("sets", 0), `${SITE_URL}/sitemaps/sets-0.xml`);
});

test("a section param is exactly <kind>-<n>.xml: anything else, and an index past the plan, is a 404", () => {
  assert.deepEqual(parseSectionParam("cards-3.xml"), { kind: "cards", index: 3 });
  assert.deepEqual(parseSectionParam("static-0.xml"), { kind: "static", index: 0 });
  for (const bad of ["cards.xml", "cards-3", "cards-03.xml", "cards--1.xml", "evil-0.xml", "cards-0.xml/../x", "CARDS-0.xml", "cards-99999.xml", "", "cards-0.xml.gz"]) assert.equal(parseSectionParam(bad), null, bad);
  const plan = { static: 1, sets: 1, sealed: 1, commanders: 1, names: 2, cards: 4 };
  assert.ok(inPlan(plan, "cards", 3) && !inPlan(plan, "cards", 4) && !inPlan(plan, "cards", -1));
  assert.ok(inPlan(plan, "static", 0) && !inPlan(plan, "static", 1));
  assert.ok(!inPlan({ ...plan, sealed: 0 }, "sealed", 0), "a kind the plan does not have is not a section");
});

test("only slugs become URLs: no query (so never ?finish=), no fragment, no path, no capital, no duplicate; at most 10,000", () => {
  const slugs = ["counterspell-mh2-267", "birds-of-paradise-7ed-231", "plains-eoe-367-borderless-galaxy-foil", "counterspell-mh2-267", "counterspell-mh2-267?finish=foil", "Black-Lotus", "a/b", "../x", "", "card 1", "x#y", "-lead", "trail-", "double--hyphen"];
  const out = sectionEntries("cards", slugs, PRICE_DAY);
  assert.deepEqual(out.map((e) => e.loc), [`${SITE_URL}/card/counterspell-mh2-267`, `${SITE_URL}/card/birds-of-paradise-7ed-231`, `${SITE_URL}/card/plains-eoe-367-borderless-galaxy-foil`]);
  for (const e of out) assert.doesNotMatch(e.loc, /[?#]|finish=/);
  assert.ok(out.every((e) => e.lastmod === PRICE_DAY), "lastmod is the data's price day, never now()");
  assert.equal(sectionEntries("cards", ["counterspell-mh2-267"])[0]!.lastmod, undefined, "no pointer, no lastmod: a made-up date is worse than none");
  const many = Array.from({ length: 12_345 }, (_, i) => `card-${i}`);
  assert.equal(sectionEntries("cards", many).length, SITEMAP_SECTION_SIZE);
  assert.ok(isSafeSlug("sol-ring") && !isSafeSlug("sol_ring") && !isSafeSlug(5) && !isSafeSlug("a".repeat(201)));
  assert.ok(isSafePath("") && isSafePath("/cards/treatment/borderless") && !isSafePath("/a?b=1") && !isSafePath("/a b") && !isSafePath("a"));
});

test("each kind has its own path prefix: sets, sealed, commanders, oracle hubs and cards", () => {
  assert.equal(sectionEntries("sets", ["mh3-modern-horizons-3"])[0]!.loc, `${SITE_URL}/sets/mh3-modern-horizons-3`);
  assert.equal(sectionEntries("sealed", ["secret-lair-drop-secret-lair-x-marvels-deadpool-final-final-reallyfinal-v7-useth"])[0]!.loc.startsWith(`${SITE_URL}/sealed/secret-lair-drop`), true);
  assert.equal(sectionEntries("commanders", ["sol-ring"])[0]!.loc, `${SITE_URL}/commanders/sol-ring`);
  assert.equal(sectionEntries("names", ["fire-ice"])[0]!.loc, `${SITE_URL}/cards/name/fire-ice`, "the oracle hub, by the oracle slug");
  assert.equal(sectionEntries("names", ["aether-vial"])[0]!.loc, `${SITE_URL}/cards/name/aether-vial`, "the ligature slug of the contract, not ther-vial");
  for (const kind of ["sets", "sealed", "commanders", "names", "cards"] as const) assert.doesNotMatch(sectionEntries(kind, ["x"])[0]!.loc, /\/leaders|\/cards\/printing/, kind);
});

test("the XML: the index lists every child with the price day; a url is escaped; the namespace is the protocol's", () => {
  const xml = indexXml(sectionRefs({ static: 1, sets: 1, sealed: 0, commanders: 0, names: 0, cards: 2 }), PRICE_DAY);
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<sitemapindex xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.equal((xml.match(/<sitemap>/g) ?? []).length, 4);
  assert.match(xml, new RegExp(`<sitemap><loc>${SITE_URL}/sitemaps/cards-1\\.xml</loc><lastmod>${PRICE_DAY}</lastmod></sitemap>`));
  assert.doesNotMatch(indexXml(sectionRefs({ static: 1, sets: 0, sealed: 0, commanders: 0, names: 0, cards: 0 })), /lastmod/);
  const set = urlsetXml([{ loc: "https://x.test/a?b=1&c=2", changefreq: "daily", priority: 0.6, lastmod: PRICE_DAY }]);
  assert.match(set, /<loc>https:\/\/x\.test\/a\?b=1&amp;c=2<\/loc><lastmod>2026-10-07<\/lastmod><changefreq>daily<\/changefreq><priority>0\.6<\/priority>/);
});

test("the static section: the fixed pages, the five region homes, the hubs of the vocabulary; Commanders, never Leaders; no query string; under the bound", () => {
  const entries = staticEntries(PRICE_DAY, { postHrefs: ["/blog/the-one-ring-price", "/guides/how-to-read-a-price"], authorSlugs: ["bill"], keywordSlugs: ["flying", "bad slug"], storeKeys: ["cardkingdom"], deckPaths: deckPaths([{ slug: "krenko-goblins", commanderSlug: "krenko-mob-boss" }]) });
  const locs = entries.map((e) => e.loc.slice(SITE_URL.length));
  for (const must of ["", "/browse", "/price-guide", "/sealed", "/market", "/movers", "/stores", "/sets", "/commanders", "/colors", "/cards", "/cards/all", "/cards/rarity", "/keywords", "/tools/deal-finder", "/tools/rising", "/tools/demand", "/release-dates", "/embed", "/creators", "/about", "/methodology", "/privacy", "/terms"]) assert.ok(locs.includes(must), `${must || "/"} is listed`);
  for (const region of ["/au", "/uk", "/ca", "/sg", "/eu"]) assert.ok(locs.includes(region), region);
  for (const hub of ["/colors/white", "/colors/colorless", "/colors/multicolor", "/cards/rarity/mythic", "/cards/type/creature", "/cards/treatment/borderless", "/cards/treatment/showcase"]) assert.ok(locs.includes(hub), hub);
  assert.ok(locs.includes("/blog/the-one-ring-price") && locs.includes("/authors/bill") && locs.includes("/keywords/flying") && locs.includes("/stores/cardkingdom") && locs.includes("/decks/commander/krenko-mob-boss"));
  assert.ok(!locs.includes("/keywords/bad slug"), "an unsafe extra is dropped");
  assert.ok(!locs.some((l) => /leaders|\/cards\/printing|\?|#/.test(l)), "no OP routes, no query, no fragment");
  // /preorders was listed until 2026-10-09, though it is only a redirect to /release-dates (now in next.config.js): a sitemap lists pages, never a URL that redirects.
  assert.ok(!locs.includes("/preorders"), "a redirect is not listed");
  assert.equal(new Set(locs).size, locs.length, "no duplicate");
  assert.ok(entries.length < SITEMAP_SECTION_SIZE);
  const home = entries[0]!; assert.equal(home.loc, SITE_URL); assert.equal(home.priority, 1); assert.equal(home.lastmod, PRICE_DAY);
  assert.equal(entries.find((e) => e.loc === `${SITE_URL}/about`)!.lastmod, undefined, "an evergreen page carries no date");
  assert.ok(!staticEntries(PRICE_DAY).some((e) => e.loc === `${SITE_URL}/decks`), "the deck library is listed only when a deck is live");
  assert.ok(staticEntries(undefined).every((e) => e.lastmod === undefined));
});

test("the deck library: /decks and its pages only once a deck exists; one page per commander and per deck", () => {
  assert.deepEqual(deckPaths([]), []);
  const paths = deckPaths([{ slug: "krenko-goblins", commanderSlug: "krenko-mob-boss" }, { slug: "krenko-tokens", commanderSlug: "krenko-mob-boss" }, { slug: "bad deck", commanderSlug: "x" }]);
  assert.deepEqual(paths, ["/decks", "/decks/commander/krenko-mob-boss", "/decks/commander/x", "/decks/krenko-goblins", "/decks/krenko-tokens"]);
  assert.ok(KEYWORD_SITEMAP_MIN >= 2, "a keyword shared by one oracle is not a hub");
});

// ── the loaders, through a published tree on disk ──────────────────────────────────────────────────────────────────────────────────────────────
function withPlane<T>(files: Record<string, unknown>, run: () => Promise<T>): Promise<T> {
  const tree = realMiniTree();
  for (const [rel, v] of Object.entries(files)) tree.write(rel, JSON.stringify(v));
  const dir = writePlaneDir(tree), was = process.env.PLANE_DIR;
  process.env.PLANE_DIR = dir; resetPlaneForTests();
  return run().finally(() => { if (was === undefined) delete process.env.PLANE_DIR; else process.env.PLANE_DIR = was; resetPlaneForTests(); fs.rmSync(dir, { recursive: true, force: true }); });
}

test("getSitemapPlan counts FILES (as the publisher writes them); static is one file the route composes; a tree without a plan has only the static section", async () => {
  await withPlane({ "sm/plan.json": { v: 1, sets: 1, sealed: 1, commanders: 1, names: 2, cards: 4, urls: { cards: 35_015 } } }, async () => {
    const plan = await getSitemapPlan();
    assert.deepEqual({ ...plan }, { static: 1, sets: 1, sealed: 1, commanders: 1, names: 2, cards: 4, urls: { cards: 35_015 } });
  });
  await withPlane({}, async () => {
    const plan = await getSitemapPlan();
    assert.deepEqual({ static: plan.static, sets: plan.sets, cards: plan.cards }, { static: 1, sets: 0, cards: 0 });
    assert.equal(sectionRefs(plan).length, 1);
  });
});

test("getSitemapSection returns the slugs of a file, [] for a missing file, a bad index and static, and only strings", async () => {
  const cards = ["counterspell-mh2-267", "birds-of-paradise-7ed-231", "black-lotus-2ed", "plains-eoe-367-borderless-galaxy-foil"];
  await withPlane({ "sm/plan.json": { v: 1, sets: 0, sealed: 0, commanders: 0, names: 0, cards: 1, urls: { cards: 4 } }, "sm/cards-0.json": [...cards, 5, null, { x: 1 }] }, async () => {
    assert.deepEqual(await getSitemapSection("cards", 0), cards);
    assert.deepEqual(await getSitemapSection("cards", 1), []);
    assert.deepEqual(await getSitemapSection("cards", -1), []);
    assert.deepEqual(await getSitemapSection("cards", 1.5), []);
    assert.deepEqual(await getSitemapSection("static", 0), [], "static is composed from code");
    assert.deepEqual(await getSitemapSection("sets", 0), []);
  });
});

// ── what the real catalogue's files must satisfy (the 2026-10-07 bootstrap, when it is on this machine) ───────────────────────────────────────────
const REAL = path.join(ROOT, ".data/v1");
test("the real bootstrap tree: every section file is within the bound, the plan agrees with the files, every slug is safe, and the cards are exactly the indexable rows", { skip: !fs.existsSync(path.join(REAL, "sm/plan.json")) }, () => {
  const plan = JSON.parse(fs.readFileSync(path.join(REAL, "sm/plan.json"), "utf8")) as Record<string, number> & { urls: { cards: number } };
  let totalFiles = 0;
  for (const kind of ["sets", "sealed", "commanders", "names", "cards"] as const) {
    let urls = 0; const seen = new Set<string>();
    for (let i = 0; i < plan[kind]!; i++) {
      const slugs = JSON.parse(fs.readFileSync(path.join(REAL, `sm/${kind}-${i}.json`), "utf8")) as string[];
      assert.ok(slugs.length <= SITEMAP_SECTION_SIZE, `${kind}-${i} has ${slugs.length}`);
      for (const s of slugs) { assert.ok(isSafeSlug(s), `${kind}-${i}: ${s}`); assert.ok(!seen.has(s), `${kind}: ${s} twice`); seen.add(s); }
      urls += slugs.length; totalFiles++;
    }
    assert.ok(!fs.existsSync(path.join(REAL, `sm/${kind}-${plan[kind]}.json`)), `${kind}: no file beyond the plan`);
    if (kind === "cards") assert.equal(urls, plan.urls.cards, "plan.urls.cards is the URL total of the cards files");
  }
  assert.ok(totalFiles + 1 <= 12, "about ten files with the static one");
  // THIN, unlisted, GONE, class 1 to 4 and untracked non-TOP rows are not in the cards files: recompute the set from cat and px
  const cards = new Set<string>(); for (let i = 0; i < plan.cards!; i++) for (const s of JSON.parse(fs.readFileSync(path.join(REAL, `sm/cards-${i}.json`), "utf8")) as string[]) cards.add(s);
  const buckets = JSON.parse(fs.readFileSync(path.join(REAL, "meta/buckets.json"), "utf8")).cat as number[];
  let indexable = 0, thinListed = 0, leaked = 0;
  for (const b of buckets) {
    const f = (fam: string) => path.join(REAL, `${fam}/${Math.floor(b / 64)}/${b}.json`);
    const cat = JSON.parse(fs.readFileSync(f("cat"), "utf8")).c as unknown[][], px = new Map((JSON.parse(fs.readFileSync(f("px"), "utf8")).p as unknown[][]).map((r) => [r[0] as number, r] as const));
    for (const c of cat) {
      const p = px.get(c[0] as number); if (!p) continue; const mask = p[5] as number, slug = c[1] as string;
      const ok = isIndexable(mask, c[9] as number);
      if (ok) indexable++; else if ((mask & PRICE_MASK.LISTED) && (mask & PRICE_MASK.THIN)) { thinListed++; if (cards.has(slug)) leaked++; }
      if (!ok && cards.has(slug)) leaked++;
    }
  }
  assert.equal(leaked, 0, "a non-indexable row (THIN, unlisted, GONE, class > 0, untracked and not TOP) is in a cards file");
  assert.equal(indexable, cards.size, "the cards files are exactly the rows track.ts isIndexable admits");
  assert.ok(thinListed > 0, "the tree has THIN rows, so the check above had something to refuse");
});

// ── the routes ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("the routes are handlers under the CDN header, rendered per request: never a metadata route, never ISR, never prerendered", () => {
  assert.ok(!fs.existsSync(path.join(ROOT, "src/app/sitemap.ts")), "app/sitemap.ts is gone: Next doubles the Cache-Control of a metadata route and it cannot split");
  for (const f of ["src/app/sitemap.xml/route.ts", "src/app/sitemaps/[section]/route.ts"]) {
    const src = read(f), code = codeOnly(src);
    assert.match(src, /export const dynamic = "force-dynamic";/, f);
    assert.doesNotMatch(code, /export const revalidate|generateStaticParams|unstable_cache|prisma|@\/lib\/db/, `${f}: reads the published files only`);
    assert.match(code, /publicDataHeaders\(\{ "content-type": "application\/xml; charset=utf-8" \}\)/, `${f}: the one header of headers.json`);
    assert.match(code, /status: 503/, `${f}: an unreachable data host is a 503, never an empty map`);
  }
  const section = codeOnly(read("src/app/sitemaps/[section]/route.ts"));
  assert.match(section, /parseSectionParam\(params\.section\)/);
  assert.match(section, /status: 404/);
  assert.match(section, /inPlan\(plan, ref\.kind, ref\.index\)/, "an index past the plan is a 404, not an empty urlset");
  for (const loader of ["getKeywordIndex", "getLibraryDecks", "getStoreStats"]) assert.match(section, new RegExp(`optionalRead\\(\\(\\) => ${loader}\\(\\), \\[\\]\\)`), `${loader}: a failing read adds nothing to the static section`);
});

test("an optional read of the static section: a value passes, a rejection and a throw before any promise exists both give the fallback", async () => {
  assert.deepEqual(await optionalRead(async () => ["flying"], []), ["flying"]);
  assert.deepEqual(await optionalRead(async () => { throw new Error("host down"); }, []), []);
  assert.deepEqual(await optionalRead((() => { throw new Error("not implemented"); }) as () => Promise<string[]>, []), [], "a loader that throws synchronously is the same as one that rejects");
});

test("robots and the news sitemap keep pointing at /sitemap.xml: the index URL did not move", () => {
  assert.equal(fs.existsSync(path.join(ROOT, "src/app/sitemap.xml/route.ts")), true);
  const news = read("src/app/news-sitemap.xml/route.ts");
  assert.match(news, /export const dynamic = "force-dynamic";/);
  assert.doesNotMatch(news, /export const revalidate/);
});

// ── the machines that read the index ─────────────────────────────────────────────────────────────────────────────────────────────────────────
test("IndexNow follows the sitemap index (it used to submit the child sitemap URLs themselves), and by default sends only the hub and release sections", async () => {
  const { urlsToSubmit } = await import("../scripts/indexnow-submit");
  const fx: Record<string, string> = {
    "https://x.test/sitemap.xml": indexXml(sectionRefs({ static: 1, sets: 1, sealed: 0, commanders: 0, names: 0, cards: 1 })).replaceAll(SITE_URL, "https://x.test"),
    "https://x.test/sitemaps/static-0.xml": urlsetXml([{ loc: "https://x.test/" }, { loc: "https://x.test/cards/all?letter=a&page=2" }]),
    "https://x.test/sitemaps/sets-0.xml": urlsetXml([{ loc: "https://x.test/sets/mh3-modern-horizons-3" }]),
    "https://x.test/sitemaps/cards-0.xml": urlsetXml([{ loc: "https://x.test/card/counterspell-mh2-267" }]),
  };
  const get = async (u: string) => fx[u] ?? "";
  const def = await urlsToSubmit("https://x.test", "static,sets,sealed,commanders", 10_000, get);
  assert.deepEqual(def, ["https://x.test/", "https://x.test/cards/all?letter=a&page=2", "https://x.test/sets/mh3-modern-horizons-3"], "page URLs, XML entities decoded, the cards section left out");
  assert.ok(!def.some((u) => /\/sitemaps\//.test(u)), "never the child sitemap URLs");
  assert.equal((await urlsToSubmit("https://x.test", "all", 10_000, get)).length, 4);
  assert.equal((await urlsToSubmit("https://x.test", "all", 2, get)).length, 2, "INDEXNOW_MAX_URLS caps a run");
  fx["https://x.test/sitemap.xml"] = urlsetXml([{ loc: "https://x.test/a" }]);
  assert.deepEqual(await urlsToSubmit("https://x.test", "static", 10_000, get), ["https://x.test/a"], "a plain urlset still works");
});

test("the workflows: IndexNow runs after the daily publish, the Search Console job submits the index and each child, and every script names itself", () => {
  const yml = read(".github/workflows/indexnow.yml");
  assert.match(yml, /cron: "15 23 \* \* \*"/, "23:15 UTC: after the import window (21:05 to 23:30 starts retries earlier; phase 2 is done by about 22:40)");
  assert.match(yml, /SITE_URL: \$\{\{ vars\.SITE_URL \|\| 'https:\/\/mtgcompare\.app' \}\}/);
  const gsc = read("scripts/gsc-report.ts");
  assert.match(gsc, /<sitemap>\\s\*<loc>/, "the children of the index are read");
  assert.match(gsc, /method: "PUT"/);
  for (const f of ["scripts/gsc-report.ts", "scripts/indexnow-submit.ts"]) assert.match(read(f), /MTGCompare-build\/0\.1 \(\+https:\/\/github\.com\/Specifxx\/mtgcompare\)/, `${f}: the build user agent on third-party requests`);
});
