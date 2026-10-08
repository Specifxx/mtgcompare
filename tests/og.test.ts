// Share images (src/lib/og, src/app/**/opengraph-image.tsx). Network-free: art is
// passed as null (the placeholder path) and fonts come from the repo. The cards
// are real TCGplayer products with their TCGCSV prices of 2026-10-07 (Time Walk,
// Ancestral Recall, Sol Ring, Counterspell, Lightning Bolt, The One Ring, Black
// Lotus ...), built through the loaders' own liteFromRow.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { CARD_FLAGS, PRICE_MASK, type Finish } from "../src/lib/constants";
import { MARKETS, type Country } from "../src/lib/country";
import type { CardLite, SetLite } from "../src/lib/data";
import { liteFromRow } from "../src/lib/data/lite";
import { usdCentsToCountry } from "../src/lib/fx";
import { imageFor } from "../src/lib/images";
import { OG_FONT_DIR, OG_FONT_FILES, isSfnt, loadOgFonts } from "../src/lib/og/fonts";
import { DEFAULT_OG_IMAGE, pageOg, pageOgOwnImage } from "../src/lib/og/meta";
import { OG_AFTER_ERROR, OG_CACHED } from "../src/lib/og/respond";
import { ogPriceLines, pickGuideRows, setBoxImage, setPreviewCards, setTopRows, showMoveColumn, storesTracked, toRow } from "../src/lib/og/select";
import { SET_STATS, badgeText, clip, clipWords, fitStats, ogDate, ogDelta, ogMoney, rarityTone, setTitleSize, splitEdition, statWidth } from "../src/lib/og/theme";
import { slugify } from "../src/lib/catalog";

const ROOT = path.resolve(__dirname, "..");
const APP = path.join(ROOT, "src", "app");

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}
const ogRoutes = walk(APP).filter((f) => /[/\\](opengraph|twitter)-image\.(tsx|ts|jsx|js)$/.test(f));

// ── 1. Route exports ────────────────────────────────────────────────────────
const ALLOWED = new Set(["default", "alt", "size", "contentType", "runtime", "dynamic", "maxDuration", "generateImageMetadata"]);

test("there is a share image for /, /price-guide, sets, sealed, cards and blog posts", () => {
  const rel = ogRoutes.map((f) => path.relative(APP, f).split(path.sep).join("/")).sort();
  for (const want of [
    "opengraph-image.tsx",
    "price-guide/opengraph-image.tsx",
    "sets/[slug]/opengraph-image.tsx",
    "sealed/[slug]/opengraph-image.tsx",
    "card/[slug]/opengraph-image.tsx",
    "blog/[slug]/opengraph-image.tsx",
  ]) {
    assert.ok(rel.includes(want), `missing src/app/${want}`);
  }
  // twitter:image is copied from og:image; a twitter-image file would override it.
  assert.deepEqual(rel.filter((r) => r.includes("twitter-image")), []);
});

for (const file of ogRoutes) {
  const rel = path.relative(ROOT, file);
  test(`${rel}: nodejs, force-dynamic, 1200×630 PNG, alt, only Next's export names`, () => {
    const src = fs.readFileSync(file, "utf8");
    assert.match(src, /export const runtime = "nodejs";/);
    assert.match(src, /export const size = \{ width: 1200, height: 630 \};/);
    assert.match(src, /export const contentType = "image\/png";/);
    // Every image reads the published data per request: force-dynamic keeps `next build` from reading it (an `export const revalidate`
    // would make a param-less route prerender at build and bake a degraded image: tests/build-no-data.test.ts rules A and B).
    assert.match(src, /export const dynamic = "force-dynamic";/);
    assert.doesNotMatch(src, /export const revalidate/);
    const alt = src.match(/export const alt =\s*"([^"]*)"/);
    assert.ok(alt && alt[1].length > 20, "alt text");
    assert.match(alt[1], /Magic|MTG Compare/);
    const names = [...src.matchAll(/export\s+(?:default\s+)?(?:async\s+)?(?:const|function|let|var)?\s*(\w+)?/g)].map((m) =>
      /export\s+default/.test(m[0]) ? "default" : m[1],
    );
    for (const n of names) assert.ok(ALLOWED.has(n), `${rel} exports "${n}", which next build rejects in an image route`);
    assert.doesNotMatch(src, /export[^\n]*generateStaticParams/, "never prewarm share images");
    assert.doesNotMatch(src, /no-store/);
    assert.doesNotMatch(src, /from "@\/lib\/db"/);
  });
}

test("the image loaders read the data layer only: no database, no cache of their own, no eBay, no paid loader", () => {
  const src = fs.readFileSync(path.join(ROOT, "src", "lib", "og", "images.tsx"), "utf8");
  assert.doesNotMatch(src, /from "\.\.\/db"|@\/lib\/db|unstable_cache|prisma/);
  assert.doesNotMatch(src, /getDealList|getTopDemand|getCachedRisingCards|getDealOffers|getEbay|getChaseBanner/);
  // Card art is imageFor(c, "og"), the JPEG of both hosts, never the optimiser and never a WebP size.
  assert.match(src, /imageFor\(c, "og"\)/);
  assert.doesNotMatch(src, /imageFor\([^)]*"(thumb|tile|large)"/);
});

// ── 2–3. Metadata that would hide or mis-point the images ────────────────────
test("a page beside an opengraph-image never sets openGraph.images (it blocks the file)", () => {
  for (const file of ogRoutes) {
    const dir = path.dirname(file);
    for (const page of ["page.tsx", "layout.tsx"]) {
      const p = path.join(dir, page);
      if (!fs.existsSync(p)) continue;
      const src = fs.readFileSync(p, "utf8");
      const og = src.match(/openGraph:.*$/gm) ?? [];
      for (const block of og) assert.doesNotMatch(block, /\bimages\s*:/, `${path.relative(ROOT, p)}: ${block}`);
    }
  }
});

test("the root openGraph carries no url (every page would inherit og:url = the homepage)", () => {
  const src = fs.readFileSync(path.join(APP, "layout.tsx"), "utf8");
  const block = src.match(/openGraph:.*$/m);
  assert.ok(block, "layout.tsx sets openGraph");
  assert.doesNotMatch(block[0], /\burl\s*:/);
  assert.match(src, /summary_large_image/);
});

// Pages whose metadata belongs to another track (the contact/feedback forms and
// the privacy policy); each should adopt pageOg() the next time it is edited.
const OG_URL_PENDING = new Set(["contact/page.tsx", "feedback/page.tsx", "privacy/page.tsx", "stores/page.tsx", "stores/suggest/page.tsx"]);

test("every page with a canonical also sets og:url to that same path (pageOg)", () => {
  const pages = walk(APP).filter((f) => /[/\\]page\.tsx$/.test(f));
  let checked = 0;
  for (const file of pages) {
    const rel = path.relative(APP, file).split(path.sep).join("/");
    const src = fs.readFileSync(file, "utf8");
    const canon = src.match(/canonical:\s*("[^"]*"|`[^`]*`)/);
    if (!canon || OG_URL_PENDING.has(rel)) continue;
    const og = src.match(/openGraph:\s*(pageOg|pageOgOwnImage)\(\s*("[^"]*"|`[^`]*`)/);
    assert.ok(og, `${rel}: has a canonical but no openGraph: pageOg(...)`);
    assert.equal(og[2], canon[1], `${rel}: og:url must be the canonical path`);
    // A page's own openGraph replaces the root's, images included: without a sibling
    // opengraph-image it must carry the default (pageOg); with one, it must not
    // name images at all (pageOgOwnImage), or the key blocks the file.
    const own = fs.readdirSync(path.dirname(file)).some((f) => /^opengraph-image\.(tsx|ts|jsx|js)$/.test(f));
    assert.equal(og[1], own ? "pageOgOwnImage" : "pageOg", `${rel}: ${own ? "has its own share image" : "needs the default share image"}`);
    checked++;
  }
  assert.ok(checked >= 20, `checked ${checked} pages`);
});

test("pageOg: OG_BASE plus the page's url and the default image; extra fields override, a non-path throws", () => {
  assert.deepEqual(pageOg("/movers"), { siteName: "MTG Compare", locale: "en_US", type: "website", url: "/movers", images: [DEFAULT_OG_IMAGE] });
  assert.equal("images" in pageOgOwnImage("/card/x"), false);
  // The default image's alt is the root route's own.
  const root = fs.readFileSync(path.join(APP, "opengraph-image.tsx"), "utf8");
  assert.equal(root.match(/export const alt =\s*"([^"]*)"/)?.[1], DEFAULT_OG_IMAGE.alt);
  const a = pageOg("/blog/x", { type: "article", title: "T" }) as Record<string, unknown>;
  assert.equal(a.type, "article");
  assert.equal(a.url, "/blog/x");
  assert.throws(() => pageOg("https://mtgcompare.app/"));
});

// ── Cache headers ────────────────────────────────────────────────────────────
test("share images send a 6 h CDN header, fallbacks one minute; never ImageResponse's immutable year", () => {
  assert.equal(OG_CACHED, "public, max-age=0, s-maxage=21600, stale-while-revalidate=86400");
  assert.equal(OG_AFTER_ERROR, "public, max-age=0, s-maxage=60");
  const src = fs.readFileSync(path.join(ROOT, "src", "lib", "og", "images.tsx"), "utf8");
  assert.match(src, /export const fallbackOg = \(\) => ogResponse\(<FallbackImage \/>, OG_AFTER_ERROR\);/);
  // Every non-fallback ogResponse( … ) passes OG_CACHED.
  const calls = src.split("ogResponse(").slice(1);
  for (const c of calls) {
    const body = c.slice(0, c.indexOf(");") + 1);
    assert.match(body, /OG_(CACHED|AFTER_ERROR)/, `ogResponse(${body.slice(0, 60)}…) has no cache header`);
  }
  const respond = fs.readFileSync(path.join(ROOT, "src", "lib", "og", "respond.ts"), "utf8");
  assert.match(respond, /"cache-control": cacheControl/, "the key must be lowercase to replace ImageResponse's default");
});

// ── 4. Real fixtures ─────────────────────────────────────────────────────────
// TCGCSV, 2026-10-07 (cents). The store counts and the cheapest listing of a card are what the store stage
// of the import would publish; here the cheapest US listing is TCGplayer's own low, the one real figure there is.
const set = (id: number, tok: string, code: string, name: string, kind: SetLite["kind"], releasedOn: string | null, cardCount: number): SetLite => ({
  id, slug: slugify(`${tok} ${name}`), tok, code, name, tcgName: name, kind, releasedOn, bucket: false, cardCount, trackedCount: 0, sealedCount: 0,
});
const SETS = {
  lea: set(7, "lea", "LEA", "Alpha Edition", "core", "1993-09-05", 294),
  leb: set(17, "leb", "LEB", "Beta Edition", "core", "1993-10-04", 301),
  ed2: set(115, "2ed", "2ED", "Unlimited Edition", "core", "1993-12-06", 301),
  ced: set(1526, "ced", "CED", "Collector's Edition", "gold-border", "1993-12-03", 0),
  ed7: set(2, "7ed", "7ED", "7th Edition", "core", "2001-04-11", 350),
  babp: set(2156, "babp", "BABP", "Buy-A-Box Promos", "promo", "2009-07-19", 92),
  mh2: set(2809, "mh2", "MH2", "Modern Horizons 2", "masters", "2021-06-19", 697),
  a30: set(17666, "30a", "30A", "30th Anniversary Edition", "masters", "2022-11-28", 0),
  ltr: set(23019, "ltr", "LTR", "Universes Beyond: The Lord of the Rings: Tales of Middle-earth", "expansion", "2023-06-23", 0),
  jdg: set(62, "jdg", "JDG", "Judge Promos", "promo", "2026-10-07", 0),
  slp: set(22970, "slp", "SLP", "Secret Lair Showdown", "secret-lair", "2023-02-17", 53),
  trk: set(24766, "trk", "TRK", "Star Trek", "expansion", "2026-11-13", 0),
};
const SET_LIST: SetLite[] = Object.values(SETS);
const setById = new Map(SET_LIST.map((s) => [s.id, s]));
const US_FIRST: Country[] = ["US", "AU", "UK", "SG", "CA", "EU"];

interface Fix {
  id: number; name: string; set: SetLite; oracle: number | null; number?: string | null; rarity?: string; treat?: string; label?: string | null; flags?: number;
  marketN?: number | null; lowN?: number | null; marketF?: number | null; lowF?: number | null; shown?: Finish;
  lowUS?: number | null; storesUS?: number; change7d?: number | null; scryId?: string | null;
}
function card(o: Fix): CardLite {
  const shown = o.shown ?? "N";
  const lowShown = shown === "N" ? (o.lowN ?? null) : (o.lowF ?? null);
  const low = US_FIRST.map((m) => (m === "US" ? (o.lowUS === undefined ? lowShown : o.lowUS) : null));
  const stores = US_FIRST.map((m) => (m === "US" ? (o.storesUS ?? 3) : 0));
  return liteFromRow({
    id: o.id, slug: slugify(`${o.name} ${o.set.tok}`), name: o.name, alt: null, setId: o.set.id, sc: null, number: o.number ?? null, rarity: o.rarity ?? "R", cls: 0,
    treat: o.treat ?? "", label: o.label ?? null, flags: o.flags ?? CARD_FLAGS.TCGIMG, oracleNo: o.oracle, scryId: o.scryId ?? null, colors: 0, mv: 0, ptype: 0, setTok: o.set.tok,
    marketN: o.marketN ?? null, marketF: o.marketF ?? null, lowN: o.lowN ?? null, lowF: o.lowF ?? null,
    mask: PRICE_MASK.LISTED | (o.marketN !== undefined || o.lowN !== undefined ? PRICE_MASK.HASN : 0) | (o.marketF !== undefined || o.lowF !== undefined ? PRICE_MASK.HASF : 0) | (shown === "F" ? PRICE_MASK.HEADF : 0),
    shown, low, stores, change7d: o.change7d ?? null, change30d: null, high90: null,
  });
}
const ORACLE = { timeWalk: 1, ancestral: 2, blackLotus: 3, solRing: 4, counterspell: 5, bolt: 6, oneRing: 7, moxJet: 8, moxSapphire: 9, birds: 10 };
const F = {
  timeWalk: () => card({ id: 9231, name: "Time Walk", set: SETS.ed2, oracle: ORACLE.timeWalk, marketN: 571999, lowN: 399500, storesUS: 2 }),
  ancestral: () => card({ id: 8973, name: "Ancestral Recall", set: SETS.ed2, oracle: ORACLE.ancestral, marketN: 499995, lowN: 499999 }),
  oneRing: () => card({ id: 517451, name: "The One Ring", set: SETS.ltr, oracle: ORACLE.oneRing, number: "748", rarity: "M", treat: "borderless poster", label: "Borderless · Poster", marketN: 93166, lowN: 92260, marketF: 175306, lowF: 229999 }),
  counterspellBeta: () => card({ id: 8718, name: "Counterspell", set: SETS.leb, oracle: ORACLE.counterspell, rarity: "U", marketN: 91992, lowN: 69999 }),
  counterspellAlpha: () => card({ id: 1073, name: "Counterspell", set: SETS.lea, oracle: ORACLE.counterspell, rarity: "U", marketN: 54898, lowN: 72229 }),
  solRing: () => card({ id: 8908, name: "Sol Ring", set: SETS.leb, oracle: ORACLE.solRing, rarity: "U", marketN: 86999, lowN: 64973 }),
  boltAlpha: () => card({ id: 1174, name: "Lightning Bolt", set: SETS.lea, oracle: ORACLE.bolt, rarity: "C", marketN: 62667, lowN: 44999 }),
  boltBeta: () => card({ id: 8819, name: "Lightning Bolt", set: SETS.leb, oracle: ORACLE.bolt, rarity: "C", marketN: 34964, lowN: 32500 }),
  // 30th Anniversary Edition: Black Lotus asks 1.82× its market (US$5,999.99 against US$3,299.99).
  blackLotus30: () => card({ id: 449115, name: "Black Lotus", set: SETS.a30, oracle: ORACLE.blackLotus, number: "228", marketN: 329999, lowN: 599999, storesUS: 1 }),
  moxJet30: () => card({ id: 449148, name: "Mox Jet", set: SETS.a30, oracle: ORACLE.moxJet, number: "259", marketN: 79099, lowN: 78210 }),
  moxSapphire30: () => card({ id: 449152, name: "Mox Sapphire", set: SETS.a30, oracle: ORACLE.moxSapphire, number: "262", marketN: 58358, lowN: 69999 }),
  solRingRetro30: () => card({ id: 449467, name: "Sol Ring", set: SETS.a30, oracle: ORACLE.solRing, number: "563", rarity: "U", treat: "retro", label: "Retro Frame", marketN: 21999, lowN: 27499 }),
  // Excluded from the guide, each for its own reason:
  blackLotusCE: () => card({ id: 97413, name: "Black Lotus", set: SETS.ced, oracle: ORACLE.blackLotus, marketN: 300000, lowN: 300000 }),
  boltShowdown: () => card({ id: 619755, name: "Lightning Bolt", set: SETS.slp, oracle: ORACLE.bolt, number: "0037", marketN: 64729, lowN: 68999 }),
  boltJudge: () => card({ id: 38253, name: "Lightning Bolt", set: SETS.jdg, oracle: ORACLE.bolt, rarity: "R", treat: "judge", label: "Judge Gift", flags: CARD_FLAGS.TCGIMG | CARD_FLAGS.PROMO, marketF: 62444, lowF: 58495, shown: "F" }),
  // Its only price is a US$20,000 listing; it stands in as a market here so the serial rule, not the market rule, is what excludes it.
  gandalfSerial: () => card({ id: 518172, name: "Gandalf the White", set: SETS.ltr, oracle: 11, rarity: "M", treat: "borderless poster serial", label: "Borderless · Poster · Serialized", flags: CARD_FLAGS.TCGIMG | CARD_FLAGS.SERIAL, marketF: 2000000, lowF: 2000000, shown: "F" }),
  counterspellMH2: () => card({ id: 238617, name: "Counterspell", set: SETS.mh2, oracle: ORACLE.counterspell, number: "267", rarity: "U", marketN: 394, lowN: 199 }),
  // Birds of Paradise, 7th Edition: the foil prints at US$3,980.75 against a US$22.89 Normal; the image is Scryfall's only.
  birdsFoil: () => card({ id: 2831, name: "Birds of Paradise", set: SETS.ed7, oracle: ORACLE.birds, number: "231", rarity: "R", flags: CARD_FLAGS.SCRYIMG, scryId: "a2985857-fee5-42a6-9b5d-e157ada52a03", marketN: 2289, lowN: 1749, marketF: 398075, lowF: 400000, shown: "F" }),
};
const catOf = (cards: CardLite[]) => ({ cards, setById });

test("pickGuideRows: excludes promos, serialized and secret-lair printings, no-art, single-store, mislisted and cheap cards", () => {
  const good = [F.ancestral(), F.timeWalk(), F.oneRing(), F.counterspellBeta(), F.solRing()];
  const bad = [
    F.boltJudge(),
    F.gandalfSerial(),
    F.boltShowdown(),
    F.blackLotusCE(),
    F.blackLotus30(),
    F.counterspellMH2(),
    { ...F.moxJet30(), flags: 0 },                                       // no scan on either host
    { ...F.moxSapphire30(), stores: { ...F.moxSapphire30().stores, US: 1 } },
    { ...F.boltAlpha(), low: { ...F.boltAlpha().low, US: null } },
  ];
  const rows = pickGuideRows(catOf([...bad, ...good]));
  assert.deepEqual(rows.map((r) => r.name), ["Ancestral Recall", "Time Walk", "The One Ring", "Counterspell", "Sol Ring"]);
  assert.deepEqual(rows.map((r) => r.id), [8973, 9231, 517451, 8718, 8908]);
  assert.equal(rows[0].setCode, "2ED");
  assert.equal(rows[0].low, 499999);
  assert.equal(rows[1].low, 399500);
});

test("pickGuideRows: the hero rows keep to 1.2× the market; a 1.82× ask (Black Lotus, 30th Anniversary) only fills in when nothing else does", () => {
  const good = [F.ancestral(), F.timeWalk(), F.oneRing(), F.counterspellBeta(), F.solRing()];
  assert.deepEqual(pickGuideRows(catOf([F.blackLotus30(), ...good])).map((r) => r.name), ["Ancestral Recall", "Time Walk", "The One Ring", "Counterspell", "Sol Ring"]);
  const few = [F.blackLotus30(), F.timeWalk(), F.ancestral()];
  const rows = pickGuideRows(catOf(few));
  assert.deepEqual(rows.map((r) => r.name), ["Black Lotus", "Ancestral Recall", "Time Walk"]);
});

test("pickGuideRows: one row per card (the dearest listing inside the band), sorted by the cheapest US price, at most 5", () => {
  // Alpha Counterspell asks US$722.29 for a US$548.98 market (1.32×): the Beta printing is the card's row.
  const cards = [F.counterspellAlpha(), F.counterspellBeta(), F.timeWalk(), F.ancestral(), F.solRing(), F.boltAlpha(), F.boltBeta(), F.moxJet30()];
  const rows = pickGuideRows(catOf(cards));
  assert.equal(rows.length, 5);
  assert.deepEqual(rows.map((r) => r.name), ["Ancestral Recall", "Time Walk", "Mox Jet", "Counterspell", "Sol Ring"]);
  assert.equal(rows[3].id, 8718);
  assert.equal(new Set(rows.map((r) => r.name)).size, 5);
});

test("pickGuideRows: empty catalogue gives []; relaxes to one store, then drops the band", () => {
  assert.deepEqual(pickGuideRows(catOf([])), []);
  const one = (c: CardLite): CardLite => ({ ...c, stores: { ...c.stores, US: 1 } });
  const oneStore = [F.ancestral(), F.timeWalk(), F.oneRing(), F.counterspellBeta(), F.solRing()].map(one);
  assert.equal(pickGuideRows(catOf(oneStore)).length, 5);
  // Black Lotus (1.82×), Mox Sapphire (1.1995×, inside the band) and the retro Sol Ring (1.25×): only a lone store each, so the band relaxes last.
  const offBand = [F.blackLotus30(), F.moxSapphire30(), F.solRingRetro30()].map(one);
  assert.deepEqual(pickGuideRows(catOf(offBand)).map((r) => r.name), ["Black Lotus", "Mox Sapphire", "Sol Ring"]);
});

test("pickGuideRows: a foil unit says so in the row, and a share image draws a Scryfall-only card", () => {
  const rows = pickGuideRows(catOf([F.birdsFoil(), F.timeWalk(), F.ancestral(), F.solRing()]));
  const birds = rows.find((r) => r.name === "Birds of Paradise");
  assert.ok(birds, "a US$3,980.75 foil is a guide row");
  assert.equal(birds.finish, "Foil");
  assert.deepEqual([birds.setCode, birds.number], ["7ED", "231"]);
  assert.equal(birds.marketUsd, 398075);
  assert.equal(birds.img, "https://cards.scryfall.io/normal/front/a/2/a2985857-fee5-42a6-9b5d-e157ada52a03.jpg", "the og size is a JPEG on Scryfall too, never the WebP grid");
  assert.equal(rows.find((r) => r.name === "Time Walk")?.finish, null);
  assert.equal(toRow(F.timeWalk()).img, "https://tcgplayer-cdn.tcgplayer.com/product/9231_400w.jpg");
  // The other host first when NEXT_PUBLIC_IMAGE_PRIMARY says so, and still a JPEG.
  const both = card({ id: 594545, name: "Sol Ring", set: SETS.babp, oracle: ORACLE.solRing, number: "1", rarity: "P", flags: CARD_FLAGS.TCGIMG | CARD_FLAGS.SCRYIMG, scryId: "120e2b4b-afc7-4bf0-a09f-568e08f6bd8f", marketF: 788, lowF: 599, shown: "F" });
  assert.match(imageFor(both, "og", "scryfall") ?? "", /^https:\/\/cards\.scryfall\.io\/normal\/front\/1\/2\/120e2b4b-.*\.jpg$/);
  assert.equal(imageFor({ id: 1, scryId: null, flags: 0 }, "og"), null);
});

test("setTopRows: the set's most valuable printings; a wild ask shows the market instead", () => {
  const cards = [F.moxJet30(), F.blackLotus30(), F.timeWalk(), F.solRingRetro30(), F.solRing()];
  const rows = setTopRows(cards, SETS.a30);
  // Black Lotus asks 1.82× its market: the row carries the market, no "cheapest". Sol Ring (retro) is the set's own Sol Ring; the Beta one is another set's.
  assert.deepEqual(rows.map((r) => r.name), ["Black Lotus", "Mox Jet", "Sol Ring"]);
  assert.equal(rows[0].low, null);
  assert.equal(rows[0].marketUsd, 329999);
  assert.equal(rows[1].low, 78210);
  assert.equal(rows[2].low, 27499, "1.25× the market is inside the 1.5× band, so the ask stays");
});

test("setTopRows keeps the ask inside the band; setPreviewCards lists art-bearing cards, dearest first, unpriced last", () => {
  const rows = setTopRows([F.solRingRetro30(), F.moxSapphire30()], SETS.a30);
  assert.deepEqual(rows.map((r) => [r.name, r.low]), [["Mox Sapphire", 69999], ["Sol Ring", 27499]]);
  const lotus = card({ id: 8989, name: "Black Lotus", set: SETS.ed2, oracle: ORACLE.blackLotus, marketN: null, lowN: 1814999 });   // Unlimited: a single US$18,149.99 listing, no market
  const noScan = { ...F.ancestral(), id: 8974, flags: 0 };
  const prev = setPreviewCards([lotus, F.timeWalk(), noScan, F.ancestral()], SETS.ed2, 4);
  assert.deepEqual(prev.map((r) => r.name), ["Time Walk", "Ancestral Recall", "Black Lotus"]);
});

test("setBoxImage: the booster box first, else a pack, else any sealed product of the set", () => {
  const mh3 = 23444;
  const all = [
    { id: 541163, setId: mh3, kind: "Booster Pack" as const },   // Play Booster Pack
    { id: 541164, setId: mh3, kind: "Booster Box" as const },    // Play Booster Display
    { id: 541166, setId: mh3, kind: "Case" as const },
    { id: 999, setId: 1, kind: "Booster Box" as const },
  ];
  assert.equal(setBoxImage(all, mh3), "https://tcgplayer-cdn.tcgplayer.com/product/541164_400w.jpg");
  assert.equal(setBoxImage(all.filter((s) => s.kind !== "Booster Box"), mh3), "https://tcgplayer-cdn.tcgplayer.com/product/541163_400w.jpg");
  assert.equal(setBoxImage([], mh3), null);
});

// ── 5. The 7-day column switch ───────────────────────────────────────────────
test("showMoveColumn: store counts until at least 3 rows really moved", () => {
  assert.equal(showMoveColumn([0, 0, 0, 0, 0].map((change7d) => ({ change7d }))), false);
  assert.equal(showMoveColumn([12.4, -3.1, 0, null, 0.01].map((change7d) => ({ change7d }))), false);
  assert.equal(showMoveColumn([12.4, -3.1, 0, 7.8, null].map((change7d) => ({ change7d }))), true);
});

// ── 6. Formatting ────────────────────────────────────────────────────────────
test("ogMoney: whole units from 100 up, cents below, each market's symbol", () => {
  assert.equal(ogMoney(86999), "US$870");
  assert.equal(ogMoney(1234), "US$12.34");
  assert.equal(ogMoney(571999), "US$5,720");
  assert.equal(ogMoney(249900, "UK"), "£2,499");
  assert.equal(ogMoney(295000, "EU"), "€2,950");
  assert.equal(ogMoney(null), "—");
});

test("clip, badgeText, ogDelta", () => {
  assert.equal(clip("Lightning Bolt", 21), "Lightning Bolt");
  assert.equal(clip("Bloodline Recollector", 10), "Bloodline…");
  // A table row's card name breaks at a word, never inside a hyphenated one ("Mirror-B…").
  assert.equal(clipWords("Fable of the Mirror-Breaker", 21), "Fable of the…");
  assert.equal(clipWords("Lightning Bolt", 21), "Lightning Bolt");
  // The printing's own label when it fits; the first treatment's short label when it does not.
  assert.equal(badgeText({ variant: "Borderless · Poster", printing: "borderless" }), "Borderless · Poster");
  assert.equal(badgeText({ variant: "Borderless · Showcase · Facet Foil · from FRA", printing: "borderless" }), "Borderless");
  assert.equal(badgeText({ variant: null, printing: "standard" }), "Standard");
  // The foil word follows when the unit is a foil that the label does not already name.
  assert.equal(badgeText({ variant: null, printing: "standard", finish: "Foil" }), "Standard · Foil");
  assert.equal(badgeText({ variant: "Borderless · Facet Foil", printing: "borderless", finish: "Facet Foil" }), "Borderless · Facet Foil");
  assert.equal(badgeText({ variant: "Foil Etched", printing: "etched", finish: "Foil Etched" }), "Foil Etched");
  assert.equal(ogDelta(12.44).text, "+12.4%");
  assert.equal(ogDelta(-3.1).text, "-3.1%");
  assert.equal(ogDelta(0.01).text, "—");
  assert.equal(ogDelta(null).text, "—");
});

test("rarityTone: the dark value of each rarity's text class; unknown rarities read as plain text", () => {
  assert.equal(rarityTone("M"), "#fdba74");
  assert.equal(rarityTone("R"), "#fcd34d");
  assert.equal(rarityTone("S"), "#f0abfc");
  assert.equal(rarityTone("SEC"), "#cdc9df");
  assert.equal(rarityTone(null), "#cdc9df");
});

test("ogDate: a 3-letter month, never en-GB's 'Sept'", () => {
  assert.equal(ogDate("2025-09-30"), "30 Sep 2025");
  assert.equal(ogDate("2026-11-13"), "13 Nov 2026");
  assert.equal(ogDate("1993-09-05T00:00:00.000Z"), "5 Sep 1993");
  assert.equal(ogDate(null), "");
  assert.equal(ogDate("nope"), "");
});

test("set titles: the edition goes to the eyebrow, three size steps, clipped at a word", () => {
  assert.deepEqual(splitEdition("Fourth Edition (Foreign Black Border)"), { title: "Fourth Edition", edition: "Foreign Black Border" });
  assert.deepEqual(splitEdition("Magic 2015 (M15)"), { title: "Magic 2015", edition: "M15" });
  assert.deepEqual(splitEdition("Alpha Edition"), { title: "Alpha Edition", edition: null });
  assert.equal(setTitleSize("Alpha Edition"), 58);
  assert.equal(setTitleSize("Universes Beyond: Fallout"), 48);
  assert.equal(setTitleSize("Universes Beyond: The Lord of the Rings: Tales of Middle-earth"), 40);
  assert.equal(clipWords("Universes Beyond: The Lord of the Rings: Tales of Middle-earth", 30), "Universes Beyond: The Lord…");
  assert.ok(!/-…$/.test(clipWords("Tales of Middle-earth", 15)));
  assert.equal(clipWords("Alpha Edition", 22), "Alpha Edition");
});

test("set stats: the widest real row fits its 396px column; 'top card' goes first", () => {
  // The estimate is checked against satori: "US$13,000" draws 118px (est 119), "30 Sep 2025" 144 (146), "printings" 91 (103).
  assert.ok(statWidth(["US$13,000", "top card"]) >= 118);
  assert.ok(statWidth(["30 Sep 2025", "released"]) >= 144);
  const total = (xs: [string, string][]) => xs.reduce((w, x, i) => w + statWidth(x) + (i ? SET_STATS.gap : 0), 0);
  // The widest real sets of 2026-10-07: The List Reprints (5,302 cards), Modern Horizons 3 (665), Alpha (294); Unlimited's Time Walk is US$5,720.
  for (const top of ["US$80.99", "US$1,895", "US$5,720", "US$99,999"]) {
    for (const n of ["17", "665", "5,302"]) {
      const row = fitStats([[n, "printings"], [top, "top card"], ["30 Sep 2025", "released"]]);
      assert.ok(total(row) <= SET_STATS.width, `${n} / ${top}: ${total(row)}px`);
      assert.equal(row[0][1], "printings");
      assert.ok(row.some(([, l]) => l === "released"), "the date is kept; the top card goes first");
    }
  }
  assert.equal(fitStats([["17", "printings"], ["US$80.99", "top card"], ["30 Sep 2025", "released"]]).length, 3);
});

// Derived prices of the other markets: the same listing priced through the site's own FX, since TCGCSV has US prices only.
const inMarket = (usdCents: number, m: Country): number => usdCentsToCountry(usdCents, m);

test("ogPriceLines: the US listing leads; else EU, UK, …; else TCGplayer's market", () => {
  const p = (low: Partial<Record<Country, number>>, marketUsd: number | null = 86999) => ({
    low: Object.fromEntries(MARKETS.map((m) => [m, low[m] ?? null])) as Record<Country, number | null>,
    stores: Object.fromEntries(MARKETS.map((m) => [m, low[m] != null ? 2 : 0])) as Record<Country, number>,
    marketUsd,
  });
  // Sol Ring, Beta Edition: TCGplayer market US$869.99, cheapest US$649.73; the same listing in pounds and euros.
  const a = ogPriceLines(p({ US: 64973, UK: inMarket(64973, "UK"), EU: inMarket(64973, "EU") }));
  assert.deepEqual([a.head.kind, a.head.country, a.head.cents], ["listing", "US", 64973]);
  assert.deepEqual(a.others.map((o) => o.country), ["UK", "EU"]);
  const b = ogPriceLines(p({ UK: inMarket(64973, "UK"), EU: inMarket(64973, "EU") }));
  assert.deepEqual([b.head.kind, b.head.country], ["listing", "EU"]);
  assert.deepEqual(ogPriceLines(p({})).head, { kind: "reference", country: "US", cents: 86999, stores: 0 });
  assert.equal(ogPriceLines(p({}, null)).head.kind, "none");
});

test("ogPriceLines: a lone ask far above the market never leads; the market does and the ask is kept", () => {
  const p = (lowUS: number | null, marketUsd: number | null, storesUS = 1, lowUK: number | null = null) => ({
    low: Object.fromEntries(MARKETS.map((m) => [m, m === "US" ? lowUS : m === "UK" ? lowUK : null])) as Record<Country, number | null>,
    stores: Object.fromEntries(MARKETS.map((m) => [m, m === "US" ? storesUS : m === "UK" && lowUK != null ? 1 : 0])) as Record<Country, number>,
    marketUsd,
  });
  // TCGCSV, 2026-10-07: Black Lotus, 30th Anniversary Edition, market US$3,299.99, cheapest US$5,999.99, one US store.
  const lotus = ogPriceLines(p(599999, 329999));
  assert.deepEqual(lotus.head, { kind: "reference", country: "US", cents: 329999, stores: 0, ask: { country: "US", cents: 599999, stores: 1 } });
  // Up to 1.5× still leads (the retro-frame Sol Ring of the 30th Anniversary asks 1.25× and leads); no market means nothing to compare with.
  assert.equal(ogPriceLines(p(Math.floor(329999 * 1.5), 329999)).head.kind, "listing");
  assert.equal(ogPriceLines(p(27499, 21999)).head.kind, "listing");
  assert.equal(ogPriceLines(p(599999, null)).head.kind, "listing");
  // A UK lead is compared in pounds, not dollars.
  const uk = ogPriceLines(p(null, 86999, 0, inMarket(64973, "UK")));
  assert.deepEqual([uk.head.kind, uk.head.country], ["listing", "UK"]);
  assert.equal(ogPriceLines(p(null, 86999, 0, inMarket(86999, "UK") * 2)).head.kind, "reference");
});

test("storesTracked: the stores live anywhere, or null before the first store run (the stat is then left out, never the registry size)", () => {
  assert.equal(storesTracked({ liveStoresAll: 12 }), 12);
  assert.equal(storesTracked({ liveStoresAll: 0 }), null);
  assert.equal(storesTracked(null), null);
  assert.equal(storesTracked(undefined), null);
});

// ── 7. Fonts ─────────────────────────────────────────────────────────────────
test("brand fonts are bundled as TTF/OTF (never WOFF2), each with its licence beside it, and load", async () => {
  for (const f of OG_FONT_FILES) {
    const buf = fs.readFileSync(path.join(OG_FONT_DIR, f.file));
    assert.ok(isSfnt(buf), `${f.file} must be TTF/OTF`);
    const family = f.file.split("-")[0];
    assert.ok(fs.existsSync(path.join(OG_FONT_DIR, `${family}-OFL.txt`)), `${family}-OFL.txt beside ${f.file}`);
  }
  assert.deepEqual(OG_FONT_FILES.map((f) => f.name + f.weight), ["Cinzel900", "Archivo900", "Inter600", "Inter700", "JetBrains Mono700"]);
  assert.equal(fs.readdirSync(OG_FONT_DIR).filter((n) => /luckiest/i.test(n)).length, 0, "the retired comic face is gone with its licence");
  assert.equal(isSfnt(Buffer.from("wOF2xxxx")), false);
  const fonts = await loadOgFonts();
  assert.equal(fonts.length, OG_FONT_FILES.length);
  assert.deepEqual(await loadOgFonts(path.join(ROOT, "no-such-dir")), []);
  const cfg = fs.readFileSync(path.join(ROOT, "next.config.js"), "utf8");
  assert.match(cfg, /outputFileTracingIncludes:[^}]*opengraph-image[^}]*src\/lib\/og\/fonts/);
});

// ── 8. Render smoke test ─────────────────────────────────────────────────────
test("every composition renders to a PNG under 1 MB with the bundled fonts", async () => {
  // tsx compiles JSX in the classic runtime (React.createElement); Next uses the automatic one.
  (globalThis as unknown as { React: typeof React }).React = React;
  const { GuideImage, FallbackImage, SetImage, CardImage, SealedImage, BlogImage } = await import("../src/lib/og/compose");
  const { ImageResponse } = require("next/dist/compiled/@vercel/og/index.node.js");
  const fonts = await loadOgFonts();
  const rows = pickGuideRows(catOf([F.ancestral(), F.timeWalk(), F.oneRing(), F.counterspellBeta(), F.solRing(), F.birdsFoil()]));
  const topRows = setTopRows([F.moxJet30(), F.blackLotus30(), F.moxSapphire30(), F.solRingRetro30()], SETS.a30);
  const lightning = ogPriceLines(F.boltAlpha(), 5);
  const els: [string, React.ReactElement][] = [
    ["guide", React.createElement(GuideImage, { rows, cards: 98991, stores: 12, variant: "home" })],
    ["guide-no-stores", React.createElement(GuideImage, { rows, cards: 98991, stores: null, variant: "guide" })],
    ["fallback", React.createElement(FallbackImage)],
    ["set-priced", React.createElement(SetImage, { code: "30A", name: "30th Anniversary Edition", kindLabel: "Masters & special set", printings: 610, topCard: 329999, released: "28 Nov 2022", upcoming: false, rows: topRows, preview: [] })],
    ["set-upcoming", React.createElement(SetImage, { code: "TRK", name: "Star Trek", kindLabel: "Expansion", printings: 56, topCard: null, released: "13 Nov 2026", upcoming: true, rows: [], preview: [] })],
    ["set-edition-note", React.createElement(SetImage, { code: "4ED", name: "Fourth Edition (Foreign Black Border)", kindLabel: "Foreign", printings: 376, topCard: null, released: "3 Apr 1995", upcoming: false, rows: [], preview: [] })],
    [
      "card",
      React.createElement(CardImage, {
        name: "Lightning Bolt", variant: null, printing: "standard", printingLabel: "Standard", rarity: "C", rarityLabel: "Common", number: null, setCode: "LEA", setName: "Alpha Edition",
        art: null, marketUsd: 62667, head: lightning.head, others: lightning.others,
      }),
    ],
    [
      "card-foil",
      React.createElement(CardImage, {
        name: "Birds of Paradise", variant: null, printing: "standard", printingLabel: "Standard", finish: "Foil", rarity: "R", rarityLabel: "Rare", number: "231", setCode: "7ED", setName: "7th Edition",
        art: null, marketUsd: 398075, head: { kind: "listing", country: "US", cents: 400000, stores: 1 }, others: [{ country: "UK", cents: inMarket(400000, "UK") }],
      }),
    ],
    [
      "sealed",
      React.createElement(SealedImage, {
        name: "Modern Horizons 3 - Play Booster Display", kindLabel: "Booster Box", setCode: "MH3", art: null, marketUsd: 30393, packCount: 36,
        head: { kind: "listing", country: "US", cents: 29899, stores: 0 }, others: [],
      }),
    ],
    ["blog", React.createElement(BlogImage, { title: "The most valuable Magic cards right now: Time Walk, Ancestral Recall and the rest of the Power Nine", arts: [null, null, null] })],
  ];
  for (const [name, el] of els) {
    const res = new ImageResponse(el, { width: 1200, height: 630, fonts });
    const buf = Buffer.from(await res.arrayBuffer());
    assert.deepEqual([...buf.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], name);
    assert.ok(buf.length > 10_000 && buf.length < 1_000_000, `${name}: PNG size ${buf.length}`);
    if (process.env.OG_OUT_DIR) fs.writeFileSync(path.join(process.env.OG_OUT_DIR, `${name}.png`), buf);
  }
});
