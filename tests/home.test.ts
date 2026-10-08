import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { COUNTRY_LIST, MARKETS } from "../src/lib/country";
import { RECENT_MIN_CENTS, countsAsStore, homeStatsFrom, recentMoves } from "../src/lib/home";
import { IMPORT_CADENCE, currencyList, homeFaqs, marketList } from "../src/lib/home-faq";
import { REGION_HOME_PATH, homeTitle, postTitle, regionHomeDescription, regionHomeHreflang, regionHomeTitle } from "../src/lib/seo";
import { startHereFor } from "../src/lib/content/featured";
import { POSTS } from "../src/lib/blog";
import { getHomeBoard, getHomeFeed, getMarketOverview, getMarketRecords, getPopular } from "../src/lib/data/home";
import { resetPlaneForTests } from "../src/lib/data/plane/runtime";
import { homeSets, tileOfHome, topDealsOf } from "../src/components/home/home-data";
import { realMiniTree, writePlaneDir } from "./helpers/data-source";
import { staticEntries } from "../src/lib/sitemap-sections";
import { IMPORT_CRONS, parseDailyCron } from "../src/lib/schedule";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

// ── Rendering model ──────────────────────────────────────────────────────────

test("the homepage and the region homes read the published files per request: force-dynamic, no cookie, header or session read, never ISR", () => {
  for (const f of ["src/app/page.tsx", "src/components/home/RegionHome.tsx", "src/components/home/home-data.ts", "src/components/home/HomeSections.tsx", "src/components/home/CinematicHero.tsx", "src/components/home/EditorialHub.tsx"]) {
    const src = codeOnly(read(f));
    assert.doesNotMatch(src, /getCountry|next\/headers|cookies\(\)|headers\(\)|getCurrentUser/, f);
    assert.doesNotMatch(src, /getCatalog\(|from "@\/lib\/db"|unstable_cache/, `${f}: no catalogue scan, no database, no cache of its own`);
  }
  assert.match(read("src/app/page.tsx"), /export const dynamic = "force-dynamic";/);
  assert.doesNotMatch(codeOnly(read("src/app/page.tsx")), /export const revalidate/, "ISR over data would bake a degraded render at build (contract 12.7)");
  for (const r of ["au", "uk", "ca", "sg", "eu"]) {
    const src = read(`src/app/${r}/page.tsx`);
    assert.match(src, /export const dynamic = "force-dynamic";/, r);
    assert.doesNotMatch(codeOnly(src), /export const revalidate/, r);
    assert.match(src, new RegExp(`<RegionHome region="${r.toUpperCase()}" />`), r);
  }
});

test("the homepage uses RiftCompare's display face and order, with the eBay chase strip IMMEDIATELY under the hero (owner requirement, REQUIREMENTS 5)", () => {
  const page = codeOnly(read("src/app/page.tsx"));
  assert.match(page, /variable: "--font-riftbound"/);
  assert.match(page, /\$\{archivo\.variable\} rb-display-sans flex flex-col gap-10/);
  const order = ["<CinematicHero", "<EbayChase", "<EditorialHub", "<HomeTopDeals", "<PriceGuideCallout", "<HomeSections", "card-surface p-6"];
  let at = -1;
  for (const t of order) {
    const i = page.indexOf(t);
    assert.ok(i > at, `${t} out of order`);
    at = i;
  }
  assert.equal(page.match(/<EbayChase\b/g)?.length, 1, "one strip on the page");
  assert.match(page, /<EbayChase page="home" heading="Chase cards on eBay right now" \/>/, "the heading of the owner's screenshot");
  // nothing sits between the hero and the strip
  assert.match(page, /<CinematicHero[\s\S]*?\/>\s*<EbayChase /, "the strip follows the hero directly");
  // The sea hero, the bob animation and the old SectionHeader sections are gone.
  assert.doesNotMatch(page, /SectionHeader|animate-bob|sea-grid|MarketPills/);
  // HomeSections no longer carries a slot for it: the strip is not one of the sections below the fold.
  assert.doesNotMatch(codeOnly(read("src/components/home/HomeSections.tsx")), /ebayPicks|EbayChase/);
});

test("every region home puts the same strip directly under its hero, with the market locked to the region", () => {
  const region = codeOnly(read("src/components/home/RegionHome.tsx"));
  const order = ["<CinematicHero", "<CountryLock country={region}>", "<EbayChase", "</CountryLock>", "<EditorialHub", "<HomeTopDeals", "<PriceGuideCallout", "<HomeSections"];
  let at = -1;
  for (const t of order) {
    const i = region.indexOf(t);
    assert.ok(i > at, `${t} out of order`);
    at = i;
  }
  assert.match(region, /<EbayChase page="home" heading="Chase cards on eBay right now" \/>/);
  const provider = codeOnly(read("src/components/CountryProvider.tsx"));
  assert.match(provider, /export function CountryLock\(\{ country, children \}/);
  assert.match(provider, /\{ \.\.\.parent, country, currency: COUNTRIES\[country\]\.currency \}/, "the lock keeps the provider's setCountry and pending, and pins the market and currency");
  // the strip asks the context for its market: the lock is what makes /au quote Australian listings for everyone
  assert.match(codeOnly(read("src/components/EbayChaseStrip.tsx")), /useCountry\(\)/);
});

// ── Stats ────────────────────────────────────────────────────────────────────

test("stores are store:* sources with an in-stock offer, plus TCGplayer in the US; eBay never counts", () => {
  assert.ok(countsAsStore("store:abc", "AU"));
  assert.ok(countsAsStore("tcgplayer", "US"));
  assert.ok(!countsAsStore("tcgplayer", "AU"));
  assert.ok(!countsAsStore("ebay", "US"));
  assert.ok(!countsAsStore("ebay_us", "CA"));
  const priced = Object.fromEntries(MARKETS.map((m) => [m, 10])) as Record<(typeof MARKETS)[number], number>;
  const s = homeStatsFrom(
    [
      { source: "store:a", market: "US", offers: 5, inStock: 3 },
      { source: "store:b", market: "US", offers: 5, inStock: 0 },
      { source: "tcgplayer", market: "US", offers: 9, inStock: 9 },
      { source: "ebay", market: "US", offers: 4, inStock: 4 },
      { source: "store:a", market: "AU", offers: 2, inStock: 2 },
      { source: "store:c", market: "UK", offers: 2, inStock: 1 },
    ],
    priced,
    7000,
    "2026-10-03T07:00:00.000Z",
  );
  assert.deepEqual(s.statsByCountry.US, { priced: 10, inStock: 12, stores: 2 }, "store:b has nothing in stock; eBay is excluded everywhere");
  assert.equal(s.statsByCountry.AU.stores, 1);
  assert.equal(s.statsByCountry.SG.stores, 0);
  assert.equal(s.liveStoresAll, 3, "store:a, tcgplayer, store:c");
  assert.equal(s.totalCards, 7000);
});

// ── Recently updated ─────────────────────────────────────────────────────────

test("recently updated: real changes only, outliers and sub-dollar cards dropped, biggest moves first", () => {
  const prev = { "1": [1000, 900], "2": [1000, 900], "3": [1000, 900], "4": [1000, 900], "5": [50, 40], "6": [2000, null], "7": [null, 100], "9": [1000, 1] } as Record<string, [number | null, number | null]>;
  const last = { "1": [1100, 900], "2": [1000, 800], "3": [4000, 900], "4": [150, 900], "5": [90, 40], "6": [1500, null], "7": [500, 100], "8": [700, 600], "9": [900, 1] } as Record<string, [number | null, number | null]>;
  const out = recentMoves(prev, last, (id) => id !== 9);
  assert.deepEqual(
    out.map((m) => [m.id, m.pct]),
    [
      [6, -25],
      [1, 10],
    ],
  );
  // 2 unchanged market price; 3 +300% spike; 4 −85% drop; 5 under US$1; 7 no previous; 8 new; 9 not a card.
  assert.ok(RECENT_MIN_CENTS === 100);
  assert.equal(recentMoves(prev, last, () => true, 1).length, 1, "the limit holds");
});

// ── Popular and chase ────────────────────────────────────────────────────────

test("the carousel's lists say what they are: Popular is EDHREC's order, Chase cards the dearest printings; no claim of a counter we do not run", () => {
  const carousel = read("src/components/home/PopularCardsCarousel.tsx");
  for (const label of ['label: "Popular"', 'label: "Chase cards"', 'label: "Biggest movers"', 'label: "Recently updated"']) assert.ok(carousel.includes(label), label);
  assert.match(carousel, /EDHREC/, "the popularity source is named");
  assert.doesNotMatch(carousel, /most-searched|searched/i, "no view or search counter backs a home list any more");
  assert.match(read("src/lib/data/home.ts"), /ranked by the published EDHREC column/);
  assert.doesNotMatch(read("src/lib/home.ts"), /popularKind|POPULAR_MIN_CARDS/, "the counter-or-chase switch is gone");
});

// ── FAQ claims match the constants they state ────────────────────────────────

test("every FAQ claim is built from the constants it states, and the cadence is the schedule's: one import a day", () => {
  const ml = marketList();
  for (const c of COUNTRY_LIST) assert.ok(ml.includes(c.code === "US" ? "the US" : c.code === "UK" ? "the UK" : c.code === "EU" ? "the EU" : c.label), c.code);
  const cl = currencyList();
  for (const c of COUNTRY_LIST) assert.ok(cl.includes(c.currency), c.currency);
  const off = homeFaqs({ ebayLive: false });
  const on = homeFaqs({ ebayLive: true });
  assert.equal(off.length, 8, "eight FAQs, as on RiftCompare");
  assert.ok(off[0].a.includes(ml));
  assert.ok(off[1].a.includes(IMPORT_CADENCE));
  assert.ok(off[7].a.includes(cl));
  // eBay listings are claimed only while the eBay pass is live.
  assert.ok(!off.some((f) => /cheapest matching eBay listing/.test(f.a)));
  assert.ok(on[0].a.includes("cheapest matching eBay listing"));
  // Nothing promises an email, a delivered total the site does not show, or a game; and it is about Magic.
  for (const f of [...off, ...on]) {
    assert.doesNotMatch(f.a, /email|we'll notify|riftle|pack sim/i, f.q);
    assert.doesNotMatch(f.q + f.a, /Riftbound|RiftCompare|One Piece|OP Compare|Leader|Parallel|Manga|Treasure Rare/, f.q);
  }
  assert.match(off[0].q, /MTG Compare/);
  assert.match(off[3].a, /borderless/i, "a printing the catalogue really separates");
  // the claim "once a day" is the daily import of schedule.ts: every cron of IMPORT_CRONS is one run a day (the others are its retries)
  assert.equal(IMPORT_CADENCE, "once a day");
  const hours = new Set(IMPORT_CRONS.map((c) => parseDailyCron(c)?.hour));
  assert.ok([...hours].every((h) => h === 21 || h === 22), "the three crons are one import and its retries inside one evening window");
});

test("the About copy names only revenue MTG Compare really has", () => {
  const page = read("src/app/page.tsx");
  assert.match(page, /affiliate commission \(the eBay Partner Network and TCGplayer\) and Plus and\s+Premium subscriptions/);
  assert.doesNotMatch(page, /display ads|consulting|Amazon/);
  assert.match(page, /a free account sees the top three; Plus and\s+Premium see them all/, "the Deal Finder is described as the paid tool it is (Plus and Premium; a free account the top 3)");
  assert.doesNotMatch(page, /One Piece|OP Compare|Leader|Parallel|Manga|Treasure/);
});

// ── SEO ──────────────────────────────────────────────────────────────────────

test("titles fit 60 characters and name the store count only when there is one", () => {
  assert.equal(homeTitle(95), "MTG Card Prices: Live Price Guide, 95 Stores");
  assert.equal(homeTitle(95, true), "MTG Card Prices: Live Price Guide, 95 Stores + eBay");
  assert.equal(homeTitle(0), "MTG Card Prices: Live Price Guide, Stores");
  assert.equal(homeTitle(0, true), "MTG Card Prices: Live Price Guide, Stores + eBay");
  for (const r of ["AU", "UK", "SG", "CA", "EU"] as const) {
    assert.ok(regionHomeTitle(r, 123).length <= 60, regionHomeTitle(r, 123));
    assert.ok(regionHomeTitle(r, null).length <= 60);
    assert.match(regionHomeDescription(r, 12000, 9), /Magic: The Gathering/);
  }
  assert.equal(postTitle({ title: (ctx: never) => `Most Expensive Cards (${(ctx as { cat: { pricesAt: string } }).cat.pricesAt.slice(0, 7)})` }, "2026-10-07T21:41:07Z"), "Most Expensive Cards (2026-10)", "a post title is dated by the data's pointer, not by a catalogue");
});

test("region homes carry reciprocal hreflang with / as x-default, and the sitemap lists all five", () => {
  const map = regionHomeHreflang();
  assert.equal(map["x-default"], map["en-US"]);
  for (const [c, path] of Object.entries(REGION_HOME_PATH)) {
    if (c === "US") continue;
    assert.ok(Object.values(map).some((u) => u.endsWith(path)), path);
  }
  assert.ok(map["en-GB"].endsWith("/uk") && map["en-AU"].endsWith("/au") && map["en-IE"].endsWith("/eu"));
  const meta = read("src/lib/home-metadata.ts");
  assert.match(meta, /languages: regionHomeHreflang\(\)/);
  const listed = staticEntries(undefined).map((e) => e.loc.replace(/^https?:\/\/[^/]+/, ""));
  for (const region of ["/au", "/uk", "/ca", "/sg", "/eu"]) assert.ok(listed.includes(region), `${region} is in the static sitemap section`);
});

test("every editorial pick resolves to a real post (red until the editorial package publishes the guides under the slugs of seo.ts, REQ-WP15-5)", () => {
  const slugs = new Set(POSTS.map((p) => p.slug));
  for (const m of [undefined, ...MARKETS]) for (const p of startHereFor(m)) assert.ok(slugs.has(p.slug), p.slug);
});

// ── The loaders, through a published tree on disk ────────────────────────────────────────────────────────────────────────────────────────────

const AT = "2026-10-07T21:41:07Z";
// rows of hm/home.json in the publisher's layout: [id, slug, name, sc, number, rarity, flags, headFinish, market]; real products of the Annex A fixture
const CHOCOBO: unknown[] = [630946, "traveling-chocobo-fin-551a-borderless-neon-ink-yellow", "Traveling Chocobo (Borderless) (Neon Ink Yellow)", "fin", "551a", "M", 4160, 1, 184560];
const BIRDS: unknown[] = [2831, "birds-of-paradise-7ed-231", "Birds of Paradise", "7ed", "231", "R", 64, 0, 2289];
const COUNTERSPELL: unknown[] = [238617, "counterspell-mh2-267", "Counterspell", "mh2", "267", "U", 64, 0, 394];
const ERAYO: unknown[] = [12430, "erayo-soratami-ascendant-sok-35", "Erayo, Soratami Ascendant", "sok", "35", "R", 64, 0, 2321];

function withHome(home: Record<string, unknown>, extra: Record<string, unknown> = {}, run: () => Promise<void>): Promise<void> {
  const tree = realMiniTree();
  const sets = (JSON.parse(tree.read("meta/sets.json")) as { sets: unknown[][] }).sets;
  const base = { v: 1, at: AT, stats: { cards: 57, tracked: 31, sets: sets.length, sealed: 1, oracles: 40 }, newest: [sets[0]![0]], upcoming: [], chase: [], popular: [], up: [], down: [], dealCounts: [0, 0, 0, 0, 0, 0], dealsFree: [null, null, null, null, null, null] };
  tree.write("hm/home.json", JSON.stringify({ ...base, ...home }));
  for (const [rel, v] of Object.entries(extra)) tree.write(rel, JSON.stringify(v));
  const dir = writePlaneDir(tree), was = process.env.PLANE_DIR;
  process.env.PLANE_DIR = dir; resetPlaneForTests();
  return run().finally(() => { if (was === undefined) delete process.env.PLANE_DIR; else process.env.PLANE_DIR = was; resetPlaneForTests(); rmSync(dir, { recursive: true, force: true }); });
}

test("getHomeFeed: the published tiles, the newest sets from meta/sets.json, the counts per market; getPopular is the popular tiles", async () => {
  await withHome({ chase: [CHOCOBO, BIRDS], popular: [COUNTERSPELL, ERAYO], dealCounts: [3, 1, 0, 0, 0, 0] }, {}, async () => {
    const feed = await getHomeFeed();
    assert.equal(feed.at, AT);
    assert.equal(feed.stats.cards, 57);
    assert.equal(feed.newest.length, 1);
    assert.deepEqual(feed.chase.map((t) => t.name), ["Traveling Chocobo (Borderless) (Neon Ink Yellow)", "Birds of Paradise"]);
    assert.deepEqual({ ...feed.chase[0]! }, { ...feed.chase[0]!, id: 630946, setCode: "FIN", number: "551a", rarity: "M", headFinish: "F", marketUsd: 184560, flags: 4160 }, "the set code is shown upper-case, the finish is N or F, the price is US cents");
    assert.equal(feed.chase[1]!.headFinish, "N");
    assert.deepEqual(feed.dealCounts, { US: 3, AU: 1, UK: 0, SG: 0, CA: 0, EU: 0 });
    assert.deepEqual((await getPopular(1)).map((t) => t.slug), ["counterspell-mh2-267"]);
    assert.equal((await getPopular()).length, 2);
    assert.equal(await getHomeBoard(), await getHomeBoard(), "one value per data commit in this instance");
  });
});

test("the free savings row: from the row's own trailing elements when the publisher writes them, else hydrated from the card's files; never more than one per market", async () => {
  const thin = [238617, "counterspell-mh2-267", "Counterspell", 250, 36.5];                        // today's publisher: id, slug, name, buyCents, belowPct
  const fat = [12430, "erayo-soratami-ascendant-sok-35", "Erayo, Soratami Ascendant", 1400, 40.1, "sok", "35", 64, 0];   // with the additive tail: set code, number, flags, head finish
  await withHome({ dealCounts: [57, 2, 0, 0, 0, 0], dealsFree: [thin, fat, null, null, null, null] }, {}, async () => {
    const f = (await getHomeBoard()).dealsFree;
    assert.deepEqual({ id: f.US!.id, setCode: f.US!.setCode, number: f.US!.number, buyCents: f.US!.buyCents, belowPct: f.US!.belowPct }, { id: 238617, setCode: "MH2", number: "267", buyCents: 250, belowPct: 36.5 }, "hydrated through getCardsByIds: 2 bucket files, not the browse index");
    assert.deepEqual({ id: f.AU!.id, setCode: f.AU!.setCode, number: f.AU!.number, flags: f.AU!.flags }, { id: 12430, setCode: "SOK", number: "35", flags: 64 });
    assert.equal(f.UK, null);
    const deals = topDealsOf(await getHomeBoard());
    assert.equal(deals.US.savings.length, 1, "FREE_SAVINGS_ROWS: one row");
    assert.equal(deals.US.savingsTotal, 57, "and the REAL total, so the page can say how many a paid plan unlocks");
    assert.deepEqual({ title: deals.US.savings[0]!.title, subtitle: deals.US.savings[0]!.subtitle, price: deals.US.savings[0]!.priceCents, approx: deals.US.savings[0]!.approx, badge: deals.US.savings[0]!.badge }, { title: "Counterspell", subtitle: "MH2 · 267", price: 250, approx: false, badge: "Save 36.5%" });
    assert.equal(deals.AU.savingsTotal, 2);
    assert.equal(deals.SG.savings.length, 0);
  });
});

test("the movers columns: a row carries its change when the publisher writes it, else the card's own 7-day figure, else it is not shown; prices localise and are marked ≈ outside the US", async () => {
  const up = [...BIRDS, 12.5, "Retro frame", "retro"], down = [...ERAYO, -8.25], noChange = COUNTERSPELL;
  await withHome({ up: [up, noChange], down: [down] }, {}, async () => {
    const board = await getHomeBoard();
    assert.equal(board.up[0]!.change7d, 12.5); assert.equal(board.up[0]!.variant, "Retro frame"); assert.equal(board.up[0]!.printing, "retro");
    assert.equal(board.down[0]!.change7d, -8.25);
    assert.equal(board.up[1]!.change7d, null, "the fixture's px row has no change figure for Counterspell, so the column does not invent one");
    const us = topDealsOf(board).US, au = topDealsOf(board).AU;
    assert.deepEqual(us.rising.map((d) => d.title), ["Birds of Paradise"], "a tile with no change is dropped, never shown as 0");
    assert.deepEqual({ badge: us.rising[0]!.badge, price: us.rising[0]!.priceCents, approx: us.rising[0]!.approx }, { badge: "+12.5%", price: 2289, approx: false });
    assert.equal(us.drops[0]!.badge, "−8.3%");
    assert.equal(au.rising[0]!.approx, true); assert.ok(au.rising[0]!.priceCents > 2289, "A$ per US$");
    assert.equal(us.rising[0]!.subtitle, "7ED · 231");
    assert.equal(us.rising[0]!.hasImage, true);
  });
});

test("tiles for the carousel carry exactly what a card tile reads, and the TCGplayer image is claimed only when the flags say it exists", async () => {
  await withHome({ popular: [COUNTERSPELL, [1, "no-image-card", "No Image", "tst", "1", "C", 0, 0, 100]] }, {}, async () => {
    const [a, b] = (await getHomeBoard()).popular.map(tileOfHome);
    assert.deepEqual({ id: a!.card.id, setCode: a!.setCode, number: a!.card.number, hasImage: a!.card.hasImage, marketUsd: a!.card.marketUsd, rarity: a!.card.rarity }, { id: 238617, setCode: "MH2", number: "267", hasImage: true, marketUsd: 394, rarity: "U" });
    assert.equal(b!.card.hasImage, false);
    assert.deepEqual(a!.card.low, { US: null, AU: null, UK: null, SG: null, CA: null, EU: null }, "the home feed holds no store price: the tile quotes TCGplayer's market (≈) until a card page asks the stores");
  });
});

test("Explore the database: upcoming sets first, then the newest released, release kinds only, twelve at most", () => {
  const set = (id: number, kind: string, releasedOn: string | null) => ({ id, slug: `s${id}`, tok: `s${id}`, code: `S${id}`, name: `Set ${id}`, tcgName: `Set ${id}`, kind, releasedOn, bucket: false, cardCount: 1, trackedCount: 0, sealedCount: 0 });
  const sets = [set(1, "expansion", "2026-09-01"), set(2, "expansion", "2026-11-14"), set(3, "promo", "2026-10-01"), set(4, "art-series", "2026-10-02"), set(5, "commander", "2026-12-05"), set(6, "core", "2025-07-18"), set(7, "expansion", null), ...Array.from({ length: 20 }, (_, i) => set(100 + i, "masters", `2020-01-${String(i + 1).padStart(2, "0")}`))];
  const out = homeSets(sets as never, "2026-10-08");
  assert.deepEqual(out.slice(0, 2).map((s) => s.id), [2, 5], "upcoming first, soonest first");
  assert.equal(out[2]!.id, 1, "then the newest released");
  assert.equal(out.length, 12);
  assert.ok(!out.some((s) => [3, 4, 7].includes(s.id)), "a promo, an Art Series set and an undated set are not tiles");
});

test("getMarketOverview and getMarketRecords read mk/*.json: units are id * 2 + finish, the home price is converted + saving", async () => {
  const overview = { v: 1, at: AT, basket: { n: 34952, totalUsd: 83588874, avg: 2392, median: 479 }, adv: 120, dec: 90, cons: [[630946, "traveling-chocobo-fin-551a-borderless-neon-ink-yellow", "Traveling Chocobo", 184560], [2831, "birds-of-paradise-7ed-231", "Birds of Paradise", 2289]], sets: [[2809, 1, 394]] };
  const records = { v: 1, at: AT, gaps: { US: [[238617 * 2, 0, 2, 300, 250, 100, 28.6]], AU: [] }, highs: [[2831 * 2, 2289, 2200]], lows: [[12430 * 2 + 1, 16850, 30000, 43.8]] };
  await withHome({}, { "mk/overview.json": overview, "mk/records.json": records }, async () => {
    const o = await getMarketOverview();
    assert.deepEqual(o.basket, overview.basket); assert.equal(o.advancing, 120); assert.equal(o.declining, 90);
    assert.deepEqual(o.constituents[1], { id: 2831, slug: "birds-of-paradise-7ed-231", name: "Birds of Paradise", cents: 2289 });
    assert.deepEqual(o.sets, [{ setId: 2809, n: 1, totalCents: 394 }]);
    const r = await getMarketRecords("US");
    assert.equal(r.gaps.length, 1);
    assert.deepEqual({ name: r.gaps[0]!.card.name, finish: r.gaps[0]!.finish, home: r.gaps[0]!.home, away: r.gaps[0]!.away, awayCents: r.gaps[0]!.awayCents, awayConverted: r.gaps[0]!.awayConverted, saving: r.gaps[0]!.saving, pct: r.gaps[0]!.pct }, { name: "Counterspell", finish: "N", home: 350, away: "UK", awayCents: 300, awayConverted: 250, saving: 100, pct: 28.6 });
    assert.deepEqual({ name: r.highs[0]!.card.name, finish: r.highs[0]!.finish, high90: r.highs[0]!.high90 }, { name: "Birds of Paradise", finish: "N", high90: 2200 });
    assert.deepEqual({ name: r.lows[0]!.card.name, finish: r.lows[0]!.finish, pctBelow: r.lows[0]!.pctBelow }, { name: "Erayo, Soratami Ascendant", finish: "F", pctBelow: 43.8 });
    assert.deepEqual((await getMarketRecords("AU")).gaps, [], "no gaps published for a market is an empty board");
  });
});

test("no home file carries One Piece vocabulary", () => {
  const files = ["src/app/page.tsx", "src/app/not-found.tsx", "src/components/home/RegionHome.tsx", "src/components/home/HomeSections.tsx", "src/components/home/HowItWorks.tsx", "src/components/home/home-data.ts", "src/components/home/CinematicHero.tsx",
    "src/components/home/PartnersStrip.tsx", "src/components/home/PriceGuideCallout.tsx", "src/lib/home-faq.ts", "src/lib/seo.ts", "src/lib/data/home.ts", "src/components/Footer.tsx"];
  for (const f of files) assert.doesNotMatch(codeOnly(read(f)), /One Piece|ONE PIECE|OP Compare|opcompare|Straw Hat|\bLeaders?\b|Parallel|Manga|Treasure Rare|\/leaders|DON!!/, f);
  assert.ok(existsSync(join(process.cwd(), "src/components/home/HomeSections.tsx")));
});
