// The hub pages (set, type, sets in order, release dates, where to buy): their generated words (src/lib/hub-copy.ts), the
// calendar file (src/lib/ics.ts) and the pages' wiring. Pure: no database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AddToCalendar } from "../src/components/AddToCalendar";
import { findBannedCopy } from "../src/lib/copy-rules";
import type { ProductCardData } from "../src/lib/data";
import {
  dealsAnchor,
  hubTitle,
  nextSet,
  prevNextSet,
  releaseChip,
  releasesTitle,
  renderedTitle,
  setDescription,
  setFacts,
  setIntro,
  setsBySeries,
  setsIndexTitle,
  setsOfYear,
  setTitle,
  shortDate,
  storeIndexable,
  storesTitle,
  TITLE_MAX,
  TITLE_SUFFIX,
  titleText,
  topStores,
  typeDescription,
  typeMsrpFact,
  typePacksFact,
  typePerPackRows,
  typeTitle,
  type HubTitle,
} from "../src/lib/hub-copy";
import { buildIcs, escapeIcsText, foldIcsLine, icsFileName, nextDay } from "../src/lib/ics";
import { REGION_LIST, REGIONS } from "../src/lib/regions";
import { PRODUCT_TYPES, TYPE_BY_SLUG } from "../src/lib/sealed-title";
import { SET_BY_CODE, SET_BY_SLUG, SETS } from "../src/lib/sets";

(globalThis as unknown as { React: typeof React }).React = React;

const TODAY = new Date("2026-10-14T09:30:00Z");
const set = (slug: string) => SET_BY_SLUG.get(slug)!;

const card = (slug: string, productType: string, lowestPriceCents: number | null, setCode = "fra", open = true): ProductCardData => ({
  slug,
  name: `${SET_BY_CODE.get(setCode)?.name ?? ""} ${productType} ${slug}`,
  productType,
  setCode,
  imageUrl: null,
  lowestPriceCents,
  inStockStores: open ? 3 : 0,
  listedStores: 3,
  marketplaceOpen: false,
  medianOpenCents: null,
  releaseDate: SET_BY_CODE.get(setCode)?.releaseDate ?? null,
});

/** A title within the rule: a plain string fits in TITLE_MAX with the suffix; anything longer goes out as absolute. */
function assertTitleRule(t: HubTitle, label: string) {
  if (typeof t === "string") assert.ok(t.length + TITLE_SUFFIX.length <= TITLE_MAX, `${label}: "${t}${TITLE_SUFFIX}" is over ${TITLE_MAX} without absolute`);
  else assert.ok(t.absolute.length + TITLE_SUFFIX.length > TITLE_MAX, `${label}: absolute for a title that fits`);
  assert.doesNotMatch(titleText(t), /\bMTG\s+(?:MTG|Magic)\b/i, `${label}: double MTG`);
  assert.equal(findBannedCopy(titleText(t)), null, label);
}

// ─── Titles ────────────────────────────────────────────────────────────────────

test("hubTitle: absolute exactly when the title and ' | MTG Compare' pass 65 characters", () => {
  assert.equal(TITLE_SUFFIX, " | MTG Compare");
  const fits = "x".repeat(TITLE_MAX - TITLE_SUFFIX.length);
  assert.equal(hubTitle(fits), fits);
  assert.deepEqual(hubTitle(`${fits}y`), { absolute: `${fits}y` });
  assert.equal(renderedTitle(fits), `${fits} | MTG Compare`);
  assert.equal(renderedTitle({ absolute: "A long one" }), "A long one");
});

test("setTitle: Star Trek before its release is the pre-order title, with its English date", () => {
  const t = setTitle(set("star-trek"), REGIONS.au, TODAY);
  const text = renderedTitle(t);
  assert.match(text, /pre-orders/);
  assert.match(text, /13 Nov 2026/);
  assert.equal(text, "MTG Star Trek pre-orders: booster box & bundle prices in Australia (out 13 Nov 2026)");
  assert.equal(typeof t, "object", "over 65 with the suffix: absolute");
});

test("setTitle: on and after its release day the same set gets the released wording (release.ts's date rule)", () => {
  const onTheDay = renderedTitle(setTitle(set("star-trek"), REGIONS.au, new Date("2026-11-13T00:00:00Z")));
  assert.doesNotMatch(onTheDay, /pre-order/i);
  assert.match(onTheDay, /^MTG Star Trek booster box, bundle & sealed prices in Australia/);
  const eve = renderedTitle(setTitle(set("star-trek"), REGIONS.au, new Date("2026-11-12T23:59:00Z")));
  assert.match(eve, /pre-orders/);
});

test("setTitle: a set sold without a booster box never says 'booster box' (Commander 2019, Commander 2018)", () => {
  for (const slug of ["commander-2019", "commander-2018"]) {
    const text = renderedTitle(setTitle(set(slug), REGIONS.us, TODAY));
    assert.doesNotMatch(text, /booster box/i, slug);
    assert.match(text, /sealed prices in the US/, slug);
  }
  assert.equal(renderedTitle(setTitle(set("commander-2019"), REGIONS.us, TODAY)), "MTG Commander 2019 sealed prices in the US | MTG Compare");
  // A set with booster lines keeps the box.
  assert.match(renderedTitle(setTitle(set("bloomburrow"), REGIONS.us, TODAY)), /^MTG Bloomburrow booster box, bundle & sealed prices in the US/);
});

test("setTitle: no double 'MTG', and the 65-character rule, for every set in every region, before and after release", () => {
  assert.match(renderedTitle(setTitle(set("final-fantasy"), REGIONS.uk, TODAY)), /^MTG Final Fantasy booster box/);
  assert.match(renderedTitle(setTitle(set("tarkir-dragonstorm"), REGIONS.uk, TODAY)), /^MTG Tarkir: Dragonstorm booster box/);
  for (const s of SETS)
    for (const r of REGION_LIST)
      for (const now of [TODAY, new Date("2027-06-01T00:00:00Z")]) {
        const t = setTitle(s, r, now);
        assertTitleRule(t, `${s.slug}/${r.region}`);
        assert.match(titleText(t), new RegExp(r.inName), "the region as people search it");
      }
});

test("typeTitle: typeName in the title (one 'MTG'), live from-price and count; the rule holds for every type", () => {
  const cbb = TYPE_BY_SLUG.get("collector-booster-boxes")!;
  const t = typeTitle(cbb, REGIONS.au, 7, 12995);
  assert.equal(renderedTitle(t), "MTG Collector Booster Boxes in Australia — from A$129.95, 7 in stock");
  assert.doesNotMatch(renderedTitle(t), /MTG MTG/);
  assert.equal(renderedTitle(typeTitle(TYPE_BY_SLUG.get("play-booster-boxes")!, REGIONS.us, 120, 8999)), "MTG Play Booster Boxes in the US — from $89.99, 120 in stock");
  assert.equal(renderedTitle(typeTitle(TYPE_BY_SLUG.get("secret-lair")!, REGIONS.nz, 0, null)), "MTG Secret Lair Drops in New Zealand — prices & stock", "too long for the suffix: absolute");
  for (const ty of PRODUCT_TYPES) for (const r of REGION_LIST) for (const [open, from] of [[0, null], [3, 999], [1234, 123456]] as const) assertTitleRule(typeTitle(ty, r, open, from), `${ty.slug}/${r.region}`);
});

test("typeDescription: live counts, and the type's capitals kept ('Collector Booster Boxes', never lowercased)", () => {
  const d = typeDescription(TYPE_BY_SLUG.get("collector-booster-boxes")!, REGIONS.au, { open: 7, total: 19 }, 12995);
  assert.match(d, /MTG Collector Booster Boxes/);
  assert.match(d, /7 in stock today from A\$129\.95/);
  assert.match(d, /19 products listed in Australia/);
  assert.doesNotMatch(d, /collector booster box/);
  assert.match(typeDescription(TYPE_BY_SLUG.get("play-booster-boxes")!, REGIONS.us, { open: 0, total: 4 }, null), /stores and TCGplayer: none in stock today/);
  assert.equal(findBannedCopy(d), null);
});

test("the other hub titles: sets in order, release dates (the render's year) and where to buy", () => {
  assert.equal(renderedTitle(setsIndexTitle(REGIONS.uk)), "Every Magic: The Gathering set in order — release dates & sealed prices (the UK)");
  assert.equal(renderedTitle(releasesTitle(REGIONS.ca, 2026)), "Magic: The Gathering release dates 2026 — upcoming sets & pre-orders (Canada)");
  assert.equal(renderedTitle(storesTitle(REGIONS.au, 60)), "Where to buy Magic sealed online in Australia — 60 stores compared");
  for (const r of REGION_LIST) for (const t of [setsIndexTitle(r), releasesTitle(r, 2026), storesTitle(r, 82)]) assertTitleRule(t, r.region);
});

// ─── Set page copy ─────────────────────────────────────────────────────────────

test("shortDate and releaseChip: '13 Nov 2026'; 'Pre-order · out in 30 days' or 'Released 2 Oct 2026'", () => {
  assert.equal(shortDate("2026-09-16"), "16 Sep 2026");
  assert.equal(shortDate("2018-01-19"), "19 Jan 2018");
  assert.equal(releaseChip(set("star-trek"), TODAY), "Pre-order · out in 30 days");
  assert.equal(releaseChip(set("star-trek"), new Date("2026-11-12T10:00:00Z")), "Pre-order · out tomorrow");
  assert.equal(releaseChip(set("reality-fracture"), TODAY), "Released 2 Oct 2026");
});

test("setDescription: counts, the cheapest pack and the date, from the loaded products only", () => {
  const products = [card("box", "Play Booster Box", 18300), card("bundle", "Bundle", 4500), card("cbb", "Collector Booster Box", 30000), card("gone", "Commander Deck", 4000, "fra", false)];
  const d = setDescription(set("reality-fracture"), REGIONS.us, products, TODAY);
  assert.equal(d, "MTG Reality Fracture sealed prices in the US: 4 products, 3 in stock today; cheapest per pack: Bundle at $5.00 a pack; released 2 Oct 2026.");
  const pre = setDescription(set("star-trek"), REGIONS.au, [card("bundle", "Bundle", 8995, "trk")], TODAY);
  assert.match(pre, /1 product, 1 open for pre-order today/);
  assert.match(pre, /out 13 Nov 2026\.$/);
  assert.match(setDescription(set("star-trek"), REGIONS.sg, [], TODAY), /no store we track lists it yet; out 13 Nov 2026/);
  for (const x of [d, pre]) assert.equal(findBannedCopy(x), null);
});

test("setIntro: plain facts — series, English date, counts today, no booster box where there is none, the cheapest way in", () => {
  const products = [card("box", "Play Booster Box", 18300), card("bundle", "Bundle", 4500), card("cbb", "Collector Booster Box", 30000)];
  const text = setIntro(set("reality-fracture"), REGIONS.us, products, TODAY).join(" ");
  assert.match(text, /^MTG Reality Fracture is a Standard set, released in English on 2 October 2026\./);
  assert.match(text, /US stores we track list 3 sealed products from it, and 3 are in stock today, from \$45\.00\./);
  assert.match(text, /cheapest way in right now is the Bundle: \$5\.00 a pack \(\$45\.00 for 9 packs\)/);
  assert.doesNotMatch(text, /not sold as a booster box/);
  const c19 = setIntro(set("commander-2019"), REGIONS.us, [card("d", "Commander Deck", 3999, "c19")], TODAY).join(" ");
  assert.match(c19, /It was not sold as a booster box: stores here list it as Commander Decks\./);
  const pre = setIntro(set("star-trek"), REGIONS.au, [card("bundle", "Bundle", 8995, "trk")], TODAY).join(" ");
  assert.match(pre, /is an upcoming Universes Beyond set, out in English on 13 November 2026 \(in 30 days\)/);
  assert.match(pre, /1 is open for pre-order today/);
  assert.match(pre, /ship pre-orders a few days either side/);
  for (const x of [text, c19, pre, setIntro(set("rivals-of-ixalan"), REGIONS.sg, [], TODAY).join(" ")]) {
    assert.equal(findBannedCopy(x), null, x);
    assert.doesNotMatch(x, /pull rate|investment|was \$|dropped|restock/i);
  }
});

test("setFacts: series, English release, the booster box (or none), and packs per Play / Collector box and bundle (packs.ts)", () => {
  const fra = setFacts(set("reality-fracture"), ["Play Booster Box", "Collector Booster Box", "Bundle"], "AU", TODAY);
  assert.deepEqual(
    fra.map((f) => [f.term, f.detail]),
    [
      ["Series", "Standard"],
      ["English release", "2 October 2026"],
      ["Play Booster Box", "30 booster packs"],
      ["Collector Booster Box", "12 booster packs"],
      ["Bundle", "9 booster packs"],
    ],
  );
  assert.ok(fra.every((f) => !f.msrp), "no MSRP outside the US");
  const us = setFacts(set("star-trek"), ["Play Booster Box", "Bundle"], "US", TODAY);
  assert.deepEqual(us.filter((f) => f.msrp).map((f) => [f.term, f.msrp]), [["Bundle", "$69.99"]], "Wizards published no box MSRP for Star Trek");
  assert.deepEqual(setFacts(set("commander-2019"), [], "US", TODAY).find((f) => f.term === "Booster box"), { term: "Booster box", detail: "Not sold as a booster box" });
  assert.equal(setFacts(set("bloomburrow"), [], "US", TODAY).find((f) => f.term === "Booster box"), undefined);
  // Play Booster Boxes held 36 packs until Aetherdrift, 30 from it on (packs.ts).
  assert.equal(setFacts(set("duskmourn-house-of-horror"), undefined, undefined, TODAY).find((f) => f.term === "Play Booster Box")?.detail, "36 booster packs");
  assert.equal(setFacts(set("aetherdrift"), undefined, undefined, TODAY).find((f) => f.term === "Play Booster Box")?.detail, "30 booster packs");
  // Only lines the region lists: Bloomburrow's Commander decks say nothing of its box, and Commander Masters' collector display has no honest pack count.
  assert.equal(setFacts(set("bloomburrow"), ["Commander Deck"], "US", TODAY).find((f) => f.term === "Play Booster Box"), undefined);
  assert.equal(setFacts(set("commander-masters"), ["Collector Booster Box"], "US", TODAY).find((f) => f.term === "Collector Booster Box"), undefined);
  assert.equal(setFacts(set("star-trek"), [], "AU", TODAY)[1].detail, "13 November 2026 (pre-order)");
  assert.equal(setFacts(set("dominaria"), undefined, "US", TODAY).find((f) => f.term === "Bundle"), undefined, "no pre-Play-Booster bundle count");
});

test("prevNextSet: the neighbours in SETS order (newest first), none past either end", () => {
  const eoe = prevNextSet("eoe");
  assert.equal(eoe.prev?.slug, "final-fantasy");
  assert.equal(eoe.next?.slug, "marvels-spider-man");
  assert.equal(prevNextSet(SETS[0].code).next, null);
  assert.equal(prevNextSet(SETS[0].code).prev?.code, SETS[1].code);
  assert.equal(prevNextSet("rix").prev, null);
  assert.deepEqual(prevNextSet("nope"), { prev: null, next: null });
});

// ─── Type page copy ────────────────────────────────────────────────────────────

test("type page helpers: packs inside (packs.ts), US MSRP (rrp.ts), the cheapest-per-pack rows and the deals anchor", () => {
  assert.equal(typePacksFact("play-booster-box"), "30 to 36 booster packs, depending on the set");
  assert.equal(typePacksFact("collector-booster-box"), "12 booster packs");
  assert.equal(typePacksFact("bundle"), "9 booster packs");
  assert.equal(typePacksFact("collection"), null);
  assert.equal(typePacksFact("secret-lair"), null);
  assert.equal(typeMsrpFact("bundle", "US"), "$69.99 for Star Trek");
  assert.equal(typeMsrpFact("bundle", "AU"), null);
  assert.equal(typeMsrpFact("collection", "US"), null);
  const rows = typePerPackRows("Play Booster Box", [card("a", "Play Booster Box", 10800, "dsk"), card("b", "Play Booster Box", 9000, "eoe"), card("c", "Play Booster Box", 12600, "fdn"), card("x", "Play Booster Box", 5000, "zzz")]);
  // Duskmourn's box holds 36 (300 a pack), Edge of Eternities' 30 (300 too: the lower price first); a set we don't know has no honest count
  assert.deepEqual(rows.map((x) => [x.p.slug, x.packs, x.perPack]), [["b", 30, 300], ["a", 36, 300], ["c", 36, 350]]);
  assert.deepEqual(typePerPackRows("Collection", [card("c", "Collection", 2000)]), []);
  assert.equal(typePerPackRows("Play Booster Box", Array.from({ length: 9 }, (_, i) => card(`b${i}`, "Play Booster Box", 20000 + i))).length, 5);
  assert.equal(dealsAnchor("play-booster-boxes"), "play-booster-boxes");
  assert.equal(dealsAnchor("commander-decks"), "commander-decks");
  assert.equal(dealsAnchor("collections"), "more");
  assert.equal(dealsAnchor("secret-lair"), "more");
});

// ─── Sets index and release dates ──────────────────────────────────────────────

test("sets in order: every SETS entry once, by series, newest first; the next set and a year's sets", () => {
  const groups = setsBySeries();
  assert.deepEqual(
    groups.flatMap((g) => g.sets.map((s) => s.code)).sort(),
    SETS.map((s) => s.code).sort(),
    "every set listed",
  );
  for (const g of groups) for (let i = 1; i < g.sets.length; i++) assert.ok(g.sets[i - 1].releaseDate >= g.sets[i].releaseDate, g.series);
  assert.equal(groups[0].series, "Standard");
  assert.equal(groups[groups.length - 1].series, "Supplemental");
  assert.equal(nextSet(TODAY)?.slug, "star-trek");
  assert.equal(nextSet(new Date("2030-01-01T00:00:00Z")), null);
  assert.deepEqual(
    setsOfYear(2026).map((s) => s.slug),
    ["star-trek", "reality-fracture", "the-hobbit", "marvel-super-heroes", "secrets-of-strixhaven", "teenage-mutant-ninja-turtles", "lorwyn-eclipsed"],
  );
  assert.deepEqual(
    setsOfYear(2025).map((s) => s.code),
    ["tla", "spm", "eoe", "fin", "tdm", "dft", "inr"],
  );
});

// ─── Stores ────────────────────────────────────────────────────────────────────

test("store pages: noindex (and out of the sitemap) when the store lists nothing or is dormant", () => {
  assert.equal(storeIndexable({ listed: 12, dormant: false }), true);
  assert.equal(storeIndexable({ listed: 0, dormant: false }), false);
  assert.equal(storeIndexable({ listed: 22, dormant: true }), false);
  assert.equal(storeIndexable(null), false, "never read");
  const src = readFileSync(new URL("../src/app/[region]/stores/[store]/StoreListing.tsx", import.meta.url), "utf8");
  assert.match(src, /const getStoreStat = cache\(/, "one storeStat read shared by the metadata and the page");
  assert.match(src, /noindex: !storeIndexable\(st\)/);
});

test("topStores: the most in stock, read within 72 hours, at most ten", () => {
  const now = Date.parse("2026-10-14T09:00:00Z");
  const h = (n: number) => new Date(now - n * 3600_000);
  const rows = [
    { key: "a", name: "Alpha", inStock: 50, listed: 80, lastOkAt: h(2) },
    { key: "b", name: "Bravo", inStock: 400, listed: 900, lastOkAt: h(80) }, // not read for 80 h: its count is not today's
    { key: "c", name: "Charlie", inStock: 120, listed: 300, lastOkAt: h(10) },
    { key: "d", name: "Delta", inStock: 0, listed: 20, lastOkAt: h(1) },
    { key: "e", name: "Echo", inStock: 120, listed: 150, lastOkAt: h(5) },
    { key: "f", name: "Foxtrot", inStock: 9, listed: 9, lastOkAt: null },
  ];
  assert.deepEqual(topStores(rows, 10, now).map((s) => s.key), ["c", "e", "a"]);
  assert.equal(topStores(Array.from({ length: 30 }, (_, i) => ({ key: `s${i}`, name: `S${i}`, inStock: i + 1, listed: 99, lastOkAt: h(1) })), 10, now).length, 10);
});

// ─── The calendar file ─────────────────────────────────────────────────────────

const TREK = { code: "trk", name: "Star Trek", date: "2026-11-13", url: "https://mtgcompare.app/au/sets/star-trek", stamp: new Date("2026-10-14T09:30:00Z") };

test("buildIcs: the exact file (golden)", () => {
  assert.equal(
    buildIcs(TREK),
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//MTG Compare//Magic The Gathering release dates//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      "UID:trk-release@mtgcompare.app",
      "DTSTAMP:20261014T093000Z",
      "DTSTART;VALUE=DATE:20261113",
      "DTEND;VALUE=DATE:20261114",
      "SUMMARY:Magic: The Gathering Star Trek release (English)",
      "DESCRIPTION:Compare Star Trek prices: https://mtgcompare.app/au/sets/star-t",
      " rek",
      "URL:https://mtgcompare.app/au/sets/star-trek",
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ].join("\r\n"),
  );
  assert.equal(icsFileName("star-trek"), "mtg-star-trek-release.ics");
});

/** A strict-enough RFC 5545 reader: CRLF only, lines ≤ 75 octets, unfolded, balanced BEGIN/END, one VEVENT's properties. */
function parseIcs(text: string): { calendar: Map<string, string>; event: Map<string, { params: string; value: string }> } {
  assert.ok(text.endsWith("\r\n"), "ends with CRLF");
  assert.doesNotMatch(text.replace(/\r\n/g, ""), /[\r\n]/, "no bare CR or LF");
  const physical = text.slice(0, -2).split("\r\n");
  for (const l of physical) assert.ok(Buffer.byteLength(l, "utf8") <= 75, `over 75 octets: ${l}`);
  const lines: string[] = [];
  for (const l of physical) {
    if (l.startsWith(" ") || l.startsWith("\t")) lines[lines.length - 1] += l.slice(1);
    else lines.push(l);
  }
  const stack: string[] = [];
  const calendar = new Map<string, string>();
  const event = new Map<string, { params: string; value: string }>();
  for (const l of lines) {
    const m = /^([A-Z][A-Z0-9-]*)((?:;[A-Z-]+=[^;:]+)*):(.*)$/.exec(l);
    assert.ok(m, `not a content line: ${l}`);
    const [, name, params, value] = m;
    if (name === "BEGIN") stack.push(value);
    else if (name === "END") assert.equal(stack.pop(), value, "balanced BEGIN/END");
    else if (stack.join("/") === "VCALENDAR") calendar.set(name, value);
    else if (stack.join("/") === "VCALENDAR/VEVENT") event.set(name, { params, value });
    else assert.fail(`property outside a component: ${l}`);
  }
  assert.equal(stack.length, 0);
  return { calendar, event };
}

const unescapeText = (v: string) => v.replace(/\\([\\;,nN])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c));

test("buildIcs parses back: an all-day event on the release date, ending the next day, with the page to come back to", () => {
  const { calendar, event } = parseIcs(buildIcs(TREK));
  assert.equal(calendar.get("VERSION"), "2.0");
  assert.ok(calendar.get("PRODID"));
  for (const p of ["UID", "DTSTAMP", "DTSTART", "DTEND", "SUMMARY"]) assert.ok(event.has(p), p);
  assert.equal(event.get("UID")!.value, "trk-release@mtgcompare.app");
  assert.match(event.get("DTSTAMP")!.value, /^\d{8}T\d{6}Z$/);
  assert.deepEqual(event.get("DTSTART"), { params: ";VALUE=DATE", value: "20261113" });
  assert.deepEqual(event.get("DTEND"), { params: ";VALUE=DATE", value: "20261114" });
  assert.equal(unescapeText(event.get("SUMMARY")!.value), "Magic: The Gathering Star Trek release (English)");
  assert.equal(unescapeText(event.get("DESCRIPTION")!.value), "Compare Star Trek prices: https://mtgcompare.app/au/sets/star-trek");
  assert.equal(event.get("URL")!.value, TREK.url);
  // Every set's file parses, and a name with the TEXT specials survives the round trip.
  for (const s of SETS) parseIcs(buildIcs({ code: s.code, name: s.name, date: s.releaseDate, url: `https://mtgcompare.app/us/sets/${s.slug}` }));
  const odd = parseIcs(buildIcs({ ...TREK, name: "Commander Legends: Battle, Gate; \\Set" }));
  assert.equal(unescapeText(odd.event.get("SUMMARY")!.value), "Magic: The Gathering Commander Legends: Battle, Gate; \\Set release (English)");
});

test("ics helpers: TEXT escapes, folding never splits a character, the next day across a month and a year", () => {
  assert.equal(escapeIcsText("a,b;c\\d\ne"), "a\\,b\\;c\\\\d\\ne");
  const long = `SUMMARY:${"é".repeat(60)}`;
  const folded = foldIcsLine(long);
  for (const l of folded.split("\r\n")) assert.ok(Buffer.byteLength(l, "utf8") <= 75);
  assert.equal(folded.replace(/\r\n /g, ""), long);
  assert.doesNotMatch(folded, /�/);
  assert.equal(foldIcsLine("SHORT:x"), "SHORT:x");
  assert.equal(nextDay("2026-11-30"), "2026-12-01");
  assert.equal(nextDay("2026-12-31"), "2027-01-01");
  assert.equal(nextDay("2028-02-28"), "2028-02-29");
});

test("AddToCalendar: a real button the server renders at its final size, named for the set and the date", () => {
  const html = renderToStaticMarkup(React.createElement(AddToCalendar, { code: "trk", name: "Star Trek", date: "2026-11-13", slug: "star-trek", url: TREK.url, when: "13 Nov 2026" }));
  assert.match(html, /^<button type="button"/);
  assert.match(html, /aria-label="Add to calendar: Star Trek release, 13 Nov 2026"/);
  assert.match(html, />Add to calendar<\/button>$/);
  assert.match(html, /min-h-11/);
});

// ─── The pages' wiring ─────────────────────────────────────────────────────────

test("the hub pages use the hub copy and the capped reads", () => {
  const src = (p: string) => readFileSync(new URL(`../src/app/[region]/${p}`, import.meta.url), "utf8");
  const setPage = src("sets/[set]/page.tsx");
  assert.match(setPage, /seoCopy\.setTitle\(s, r, /); // the <title> rule lives in lib/seo-titles.ts (tests/seo-titles.test.ts)
  assert.match(setPage, /setDescription\(s, r, products\)/);
  assert.doesNotMatch(setPage, /image: s\.logo/, "the default share card, not the set's logo");
  assert.match(setPage, /tiles="set"/);
  assert.match(setPage, /placement="set-tcgplayer"/);
  assert.match(setPage, /rel=\{REL_SPONSORED\}/);
  assert.match(setPage, /AFFILIATE_NOTE_SHORT/);
  assert.match(setPage, /itemListJsonLd\(/);
  const typePage = src("type/[type]/page.tsx");
  assert.match(typePage, /typePageData\(market, typeLabel\)/);
  assert.doesNotMatch(typePage, /productsByType/, "the uncapped read is gone");
  assert.match(typePage, /tiles="type"/);
  assert.match(typePage, /sealed\?type=\$\{t\.slug\}&stock=in/);
  assert.doesNotMatch(typePage, /(?:Pokémon|MTG) \{t\.plural\}/);
  for (const p of ["sets/page.tsx", "releases/page.tsx"]) {
    assert.match(src(p), /setCountsGrouped\(r\.market\)/, p);
    assert.doesNotMatch(src(p), /\bsetCounts\(/, p);
  }
  for (const p of ["sets/[set]/page.tsx", "type/[type]/page.tsx", "sets/page.tsx", "releases/page.tsx", "stores/page.tsx"]) {
    assert.match(src(p), /export const dynamic = "force-dynamic";/, p); // CDN-cached, not ISR (tests/cache-ttl.test.ts)
    assert.doesNotMatch(src(p), /searchParams|headers\(\)|cookies\(\)|unstable_cache/, p);
  }
});
