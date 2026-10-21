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

const card = (slug: string, productType: string, lowestPriceCents: number | null, setCode = "me5", open = true): ProductCardData => ({
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
  assert.doesNotMatch(titleText(t), /Pok[ée]mon\s+Pok[ée]mon/i, `${label}: double Pokémon`);
  assert.equal(findBannedCopy(titleText(t)), null, label);
}

// ─── Titles ────────────────────────────────────────────────────────────────────

test("hubTitle: absolute exactly when the title and ' | DexCompare' pass 65 characters", () => {
  assert.equal(TITLE_SUFFIX, " | DexCompare");
  const fits = "x".repeat(TITLE_MAX - TITLE_SUFFIX.length);
  assert.equal(hubTitle(fits), fits);
  assert.deepEqual(hubTitle(`${fits}y`), { absolute: `${fits}y` });
  assert.equal(renderedTitle(fits), `${fits} | DexCompare`);
  assert.equal(renderedTitle({ absolute: "A long one" }), "A long one");
});

test("setTitle: Delta Reign before its release is the pre-order title, with its English date", () => {
  const t = setTitle(set("delta-reign"), REGIONS.au, TODAY);
  const text = renderedTitle(t);
  assert.match(text, /pre-orders/);
  assert.match(text, /6 Nov 2026/);
  assert.equal(text, "Pokémon Delta Reign pre-orders: booster box & ETB prices in Australia (out 6 Nov 2026)");
  assert.equal(typeof t, "object", "over 65 with the suffix: absolute");
});

test("setTitle: on and after its release day the same set gets the released wording (release.ts's date rule)", () => {
  const onTheDay = renderedTitle(setTitle(set("delta-reign"), REGIONS.au, new Date("2026-11-06T00:00:00Z")));
  assert.doesNotMatch(onTheDay, /pre-order/i);
  assert.match(onTheDay, /^Pokémon Delta Reign booster box, ETB & sealed prices in Australia/);
  const eve = renderedTitle(setTitle(set("delta-reign"), REGIONS.au, new Date("2026-11-05T23:59:00Z")));
  assert.match(eve, /pre-orders/);
});

test("setTitle: a set sold without a booster box never says 'booster box' (30th Celebration, Prismatic Evolutions, 151)", () => {
  for (const slug of ["30th-celebration", "prismatic-evolutions", "scarlet-violet-151", "crown-zenith"]) {
    const text = renderedTitle(setTitle(set(slug), REGIONS.us, TODAY));
    assert.doesNotMatch(text, /booster box/i, slug);
    assert.match(text, /ETB, bundle & sealed prices in the US/, slug);
  }
  assert.equal(renderedTitle(setTitle(set("30th-celebration"), REGIONS.us, TODAY)), "Pokémon 30th Celebration ETB, bundle & sealed prices in the US");
  // Before its release, a set sold without a box gets the pre-order wording, still with no box.
  const before = renderedTitle(setTitle(set("30th-celebration"), REGIONS.us, new Date("2026-09-01T00:00:00Z")));
  assert.equal(before, "Pokémon 30th Celebration pre-orders: ETB & sealed prices in the US (out 16 Sep 2026)");
});

test("setTitle: no double 'Pokémon', and the 65-character rule, for every set in every region, before and after release", () => {
  assert.match(renderedTitle(setTitle(set("pokemon-go"), REGIONS.uk, TODAY)), /^Pokémon GO ETB, bundle/);
  assert.match(renderedTitle(setTitle(set("scarlet-violet"), REGIONS.uk, TODAY)), /^Pokémon Scarlet & Violet booster box/);
  for (const s of SETS)
    for (const r of REGION_LIST)
      for (const now of [TODAY, new Date("2027-06-01T00:00:00Z")]) {
        const t = setTitle(s, r, now);
        assertTitleRule(t, `${s.slug}/${r.region}`);
        assert.match(titleText(t), new RegExp(r.inName), "the region as people search it");
      }
});

test("typeTitle: typeName in the title (no 'Pokémon Pokémon Center…'), live from-price and count; the rule holds for every type", () => {
  const pc = TYPE_BY_SLUG.get("pokemon-center-elite-trainer-boxes")!;
  const t = typeTitle(pc, REGIONS.au, 7, 12995);
  assert.equal(renderedTitle(t), "Pokémon Center Elite Trainer Boxes in Australia — from A$129.95, 7 in stock");
  assert.doesNotMatch(renderedTitle(t), /Pokémon Pokémon/);
  assert.equal(renderedTitle(typeTitle(TYPE_BY_SLUG.get("booster-boxes")!, REGIONS.us, 120, 8999)), "Pokémon Booster Boxes in the US — from $89.99, 120 in stock");
  assert.equal(renderedTitle(typeTitle(TYPE_BY_SLUG.get("tins")!, REGIONS.nz, 0, null)), "Pokémon Tins in New Zealand — prices & stock | DexCompare");
  for (const ty of PRODUCT_TYPES) for (const r of REGION_LIST) for (const [open, from] of [[0, null], [3, 999], [1234, 123456]] as const) assertTitleRule(typeTitle(ty, r, open, from), `${ty.slug}/${r.region}`);
});

test("typeDescription: live counts, and the type's capitals kept ('Pokémon Center Elite Trainer Boxes', never lowercased)", () => {
  const d = typeDescription(TYPE_BY_SLUG.get("pokemon-center-elite-trainer-boxes")!, REGIONS.au, { open: 7, total: 19 }, 12995);
  assert.match(d, /Pokémon Center Elite Trainer Boxes/);
  assert.match(d, /7 in stock today from A\$129\.95/);
  assert.match(d, /19 products listed in Australia/);
  assert.doesNotMatch(d, /pokémon center elite trainer box/);
  assert.match(typeDescription(TYPE_BY_SLUG.get("booster-boxes")!, REGIONS.us, { open: 0, total: 4 }, null), /stores and TCGplayer: none in stock today/);
  assert.equal(findBannedCopy(d), null);
});

test("the other hub titles: sets in order, release dates (the render's year) and where to buy", () => {
  assert.equal(renderedTitle(setsIndexTitle(REGIONS.uk)), "Every Pokémon TCG set in order — release dates & sealed prices (the UK)");
  assert.equal(renderedTitle(releasesTitle(REGIONS.ca, 2026)), "Pokémon TCG release dates 2026 — upcoming sets & pre-orders (Canada)");
  assert.equal(renderedTitle(storesTitle(REGIONS.au, 60)), "Where to buy Pokémon cards online in Australia — 60 stores compared");
  for (const r of REGION_LIST) for (const t of [setsIndexTitle(r), releasesTitle(r, 2026), storesTitle(r, 82)]) assertTitleRule(t, r.region);
});

// ─── Set page copy ─────────────────────────────────────────────────────────────

test("shortDate and releaseChip: '6 Nov 2026'; 'Pre-order · out in 23 days' or 'Released 16 Sep 2026'", () => {
  assert.equal(shortDate("2026-09-16"), "16 Sep 2026");
  assert.equal(shortDate("2014-02-05"), "5 Feb 2014");
  assert.equal(releaseChip(set("delta-reign"), TODAY), "Pre-order · out in 23 days");
  assert.equal(releaseChip(set("delta-reign"), new Date("2026-11-05T10:00:00Z")), "Pre-order · out tomorrow");
  assert.equal(releaseChip(set("30th-celebration"), TODAY), "Released 16 Sep 2026");
});

test("setDescription: counts, the cheapest pack and the date, from the loaded products only", () => {
  const products = [card("box", "Booster Box", 18300), card("bundle", "Booster Bundle", 3000), card("etb", "Elite Trainer Box", 7095), card("gone", "Tin", 2000, "me5", false)];
  const d = setDescription(set("pitch-black"), REGIONS.us, products, TODAY);
  assert.equal(d, "Pokémon Pitch Black sealed prices in the US: 4 products, 3 in stock today; cheapest per pack: Booster Bundle at $5.00 a pack; released 17 Jul 2026.");
  const pre = setDescription(set("delta-reign"), REGIONS.au, [card("etb", "Elite Trainer Box", 8995, "me6")], TODAY);
  assert.match(pre, /1 product, 1 open for pre-order today/);
  assert.match(pre, /out 6 Nov 2026\.$/);
  assert.match(setDescription(set("delta-reign"), REGIONS.sg, [], TODAY), /no store we track lists it yet; out 6 Nov 2026/);
  for (const x of [d, pre]) assert.equal(findBannedCopy(x), null);
});

test("setIntro: plain facts — series, English date, counts today, no booster box where there is none, the cheapest way in", () => {
  const products = [card("box", "Booster Box", 18300), card("bundle", "Booster Bundle", 3000), card("etb", "Elite Trainer Box", 7095)];
  const text = setIntro(set("pitch-black"), REGIONS.us, products, TODAY).join(" ");
  assert.match(text, /^Pokémon Pitch Black is a Mega Evolution series set, released in English on 17 July 2026\./);
  assert.match(text, /US stores we track list 3 sealed products from it, and 3 are in stock today, from \$30\.00\./);
  assert.match(text, /cheapest way in right now is the Booster Bundle: \$5\.00 a pack \(\$30\.00 for 6 packs\)/);
  const cel = setIntro(set("30th-celebration"), REGIONS.us, [card("e", "Elite Trainer Box", 5999, "cel30"), card("c", "Collection", 2999, "cel30")], TODAY).join(" ");
  assert.match(cel, /It was not sold as a 36-pack booster box: here its packs come in Elite Trainer Boxes and Collections & Boxes\./);
  const pre = setIntro(set("delta-reign"), REGIONS.au, [card("etb", "Elite Trainer Box", 8995, "me6")], TODAY).join(" ");
  assert.match(pre, /is an upcoming Mega Evolution series set, out in English on 6 November 2026 \(in 23 days\)/);
  assert.match(pre, /1 is open for pre-order today/);
  assert.match(pre, /ship pre-orders a few days either side/);
  for (const x of [text, cel, pre, setIntro(set("xy"), REGIONS.sg, [], TODAY).join(" ")]) {
    assert.equal(findBannedCopy(x), null, x);
    assert.doesNotMatch(x, /pull rate|investment|was \$|dropped|restock/i);
  }
});

test("setFacts: series, English release, the booster box (or none), and packs per ETB / Pokémon Center ETB / bundle (packs.ts)", () => {
  const pb = setFacts(set("pitch-black"), ["Booster Box", "Elite Trainer Box", "Pokémon Center Elite Trainer Box", "Booster Bundle"], "AU", TODAY);
  assert.deepEqual(
    pb.map((f) => [f.term, f.detail]),
    [
      ["Series", "Mega Evolution"],
      ["English release", "17 July 2026"],
      ["Booster box", "36 booster packs"],
      ["Elite Trainer Box", "9 booster packs"],
      ["Pokémon Center ETB", "11 booster packs"],
      ["Booster bundle", "6 booster packs"],
    ],
  );
  assert.ok(pb.every((f) => !f.msrp), "no MSRP outside the US");
  const us = setFacts(set("pitch-black"), ["Booster Box", "Elite Trainer Box", "Pokémon Center Elite Trainer Box"], "US", TODAY);
  assert.deepEqual(us.filter((f) => f.msrp).map((f) => [f.term, f.msrp]), [
    ["Booster box", "$161.64"],
    ["Elite Trainer Box", "$49.99"],
    ["Pokémon Center ETB", "$59.99"],
  ]);
  assert.deepEqual(setFacts(set("30th-celebration"), [], "US", TODAY).find((f) => f.term === "Booster box"), { term: "Booster box", detail: "Not sold as a 36-pack booster box" });
  // Sword & Shield: 8-pack ETBs, 10-pack PC ETBs; special sets' ETBs hold 10 (packs.ts).
  assert.equal(setFacts(set("evolving-skies"), undefined, undefined, TODAY).find((f) => f.term === "Elite Trainer Box")?.detail, "8 booster packs");
  assert.equal(setFacts(set("crown-zenith"), undefined, undefined, TODAY).find((f) => f.term === "Elite Trainer Box")?.detail, "10 booster packs");
  // Only lines the region lists: Detective Pikachu has no ETB, and Celebrations' ETB has no honest pack count.
  assert.equal(setFacts(set("detective-pikachu"), ["Collection"], "US", TODAY).find((f) => f.term === "Elite Trainer Box"), undefined);
  assert.equal(setFacts(set("celebrations"), ["Elite Trainer Box"], "US", TODAY).find((f) => f.term === "Elite Trainer Box"), undefined);
  assert.equal(setFacts(set("delta-reign"), [], "AU", TODAY)[1].detail, "6 November 2026 (pre-order)");
  assert.equal(setFacts(set("xy"), undefined, "US", TODAY).find((f) => f.term === "Pokémon Center ETB"), undefined, "no XY-era PC ETB count");
});

test("prevNextSet: the neighbours in SETS order (newest first), none past either end", () => {
  const pb = prevNextSet("me5");
  assert.equal(pb.prev?.slug, "chaos-rising");
  assert.equal(pb.next?.slug, "30th-celebration");
  assert.equal(prevNextSet(SETS[0].code).next, null);
  assert.equal(prevNextSet(SETS[0].code).prev?.code, SETS[1].code);
  assert.equal(prevNextSet("xy1").prev, null);
  assert.deepEqual(prevNextSet("nope"), { prev: null, next: null });
});

// ─── Type page copy ────────────────────────────────────────────────────────────

test("type page helpers: packs inside (packs.ts), US MSRP (rrp.ts), the cheapest-per-pack rows and the deals anchor", () => {
  assert.equal(typePacksFact("booster-box"), "36 booster packs");
  assert.equal(typePacksFact("etb"), "8 to 10 booster packs, depending on the set");
  assert.equal(typePacksFact("booster-bundle"), "6 booster packs");
  assert.equal(typePacksFact("collection"), null);
  assert.equal(typePacksFact("tin"), null);
  assert.equal(typeMsrpFact("etb", "US"), "$49.99 for Mega Evolution and Scarlet & Violet sets");
  assert.equal(typeMsrpFact("etb", "AU"), null);
  assert.equal(typeMsrpFact("collection", "US"), null);
  const rows = typePerPackRows("Elite Trainer Box", [card("a", "Elite Trainer Box", 9900), card("b", "Elite Trainer Box", 7200, "swsh7"), card("c", "Elite Trainer Box", 8100), card("x", "Elite Trainer Box", 5000, "cel25")]);
  // a Sword & Shield ETB holds 8 (900 a pack), Mega Evolution 9 (900 too: the lower price first); Celebrations' ETB has no honest count
  assert.deepEqual(rows.map((x) => [x.p.slug, x.packs, x.perPack]), [["b", 8, 900], ["c", 9, 900], ["a", 9, 1100]]);
  assert.deepEqual(typePerPackRows("Collection", [card("c", "Collection", 2000)]), []);
  assert.equal(typePerPackRows("Booster Box", Array.from({ length: 9 }, (_, i) => card(`b${i}`, "Booster Box", 20000 + i))).length, 5);
  assert.equal(dealsAnchor("booster-boxes"), "booster-boxes");
  assert.equal(dealsAnchor("collections"), "collections");
  assert.equal(dealsAnchor("tins"), "more");
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
  assert.equal(groups[0].series, "Mega Evolution");
  assert.equal(groups[groups.length - 1].series, "XY");
  assert.equal(nextSet(TODAY)?.slug, "delta-reign");
  assert.equal(nextSet(new Date("2030-01-01T00:00:00Z")), null);
  assert.deepEqual(
    setsOfYear(2026).map((s) => s.slug),
    ["delta-reign", "30th-celebration", "pitch-black", "chaos-rising", "perfect-order", "ascended-heroes"],
  );
  assert.deepEqual(
    setsOfYear(2025).map((s) => s.code),
    ["me2", "me1", "zsv10pt5", "rsv10pt5", "sv10", "sv9", "sv8pt5"],
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

const DELTA = { code: "me6", name: "Delta Reign", date: "2026-11-06", url: "https://www.dexcompare.app/au/sets/delta-reign", stamp: new Date("2026-10-14T09:30:00Z") };

test("buildIcs: the exact file (golden)", () => {
  assert.equal(
    buildIcs(DELTA),
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//DexCompare//Pokemon TCG release dates//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      "UID:me6-release@dexcompare.app",
      "DTSTAMP:20261014T093000Z",
      "DTSTART;VALUE=DATE:20261106",
      "DTEND;VALUE=DATE:20261107",
      "SUMMARY:Pokémon TCG Delta Reign release (English)",
      "DESCRIPTION:Compare Delta Reign prices: https://www.dexcompare.app/au/sets/",
      " delta-reign",
      "URL:https://www.dexcompare.app/au/sets/delta-reign",
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ].join("\r\n"),
  );
  assert.equal(icsFileName("delta-reign"), "pokemon-tcg-delta-reign-release.ics");
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
  const { calendar, event } = parseIcs(buildIcs(DELTA));
  assert.equal(calendar.get("VERSION"), "2.0");
  assert.ok(calendar.get("PRODID"));
  for (const p of ["UID", "DTSTAMP", "DTSTART", "DTEND", "SUMMARY"]) assert.ok(event.has(p), p);
  assert.equal(event.get("UID")!.value, "me6-release@dexcompare.app");
  assert.match(event.get("DTSTAMP")!.value, /^\d{8}T\d{6}Z$/);
  assert.deepEqual(event.get("DTSTART"), { params: ";VALUE=DATE", value: "20261106" });
  assert.deepEqual(event.get("DTEND"), { params: ";VALUE=DATE", value: "20261107" });
  assert.equal(unescapeText(event.get("SUMMARY")!.value), "Pokémon TCG Delta Reign release (English)");
  assert.equal(unescapeText(event.get("DESCRIPTION")!.value), "Compare Delta Reign prices: https://www.dexcompare.app/au/sets/delta-reign");
  assert.equal(event.get("URL")!.value, DELTA.url);
  // Every set's file parses, and a name with the TEXT specials survives the round trip.
  for (const s of SETS) parseIcs(buildIcs({ code: s.code, name: s.name, date: s.releaseDate, url: `https://www.dexcompare.app/us/sets/${s.slug}` }));
  const odd = parseIcs(buildIcs({ ...DELTA, name: "Scarlet & Violet, Base; \\Set" }));
  assert.equal(unescapeText(odd.event.get("SUMMARY")!.value), "Pokémon TCG Scarlet & Violet, Base; \\Set release (English)");
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
  const html = renderToStaticMarkup(React.createElement(AddToCalendar, { code: "me6", name: "Delta Reign", date: "2026-11-06", slug: "delta-reign", url: DELTA.url, when: "6 Nov 2026" }));
  assert.match(html, /^<button type="button"/);
  assert.match(html, /aria-label="Add to calendar: Delta Reign release, 6 Nov 2026"/);
  assert.match(html, />Add to calendar<\/button>$/);
  assert.match(html, /min-h-11/);
});

// ─── The pages' wiring ─────────────────────────────────────────────────────────

test("the hub pages use the hub copy and the capped reads", () => {
  const src = (p: string) => readFileSync(new URL(`../src/app/[region]/${p}`, import.meta.url), "utf8");
  const setPage = src("sets/[set]/page.tsx");
  assert.match(setPage, /setTitle\(s, r\)/);
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
  assert.doesNotMatch(typePage, /Pokémon \{t\.plural\}/);
  for (const p of ["sets/page.tsx", "releases/page.tsx"]) {
    assert.match(src(p), /setCountsGrouped\(r\.market\)/, p);
    assert.doesNotMatch(src(p), /\bsetCounts\(/, p);
  }
  for (const p of ["sets/[set]/page.tsx", "type/[type]/page.tsx", "sets/page.tsx", "releases/page.tsx", "stores/page.tsx"]) {
    assert.match(src(p), /export const dynamic = "force-dynamic";/, p); // CDN-cached, not ISR (tests/cache-ttl.test.ts)
    assert.doesNotMatch(src(p), /searchParams|headers\(\)|cookies\(\)|unstable_cache/, p);
  }
});
