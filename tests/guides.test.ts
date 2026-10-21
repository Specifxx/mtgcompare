// The guides (src/content/guides): the registry's rules, every body rendered as a crawler sees it on fixture data (the numbers it
// prints must be packs.ts's and rrp.ts's, its copy must never match BANNED_COPY or talk about pull rates, EV or investing, and it
// carries exactly one eBay unit plus, in the US only, one labelled TCGplayer link), and the old site's guide and blog redirects.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProductCardData } from "../src/lib/data";
import { findBannedCopy } from "../src/lib/copy-rules";
import { money } from "../src/lib/format";
import { packsFor, perPackCents } from "../src/lib/packs";
import { REGION_LIST, REGIONS, type Region } from "../src/lib/regions";
import { RRP_NOTE, usMsrpCents } from "../src/lib/rrp";
import { TYPE_BY_KEY, TYPE_BY_LABEL, TYPE_BY_SLUG } from "../src/lib/sealed-title";
import { TYPE_ABOUT } from "../src/lib/type-about";
import { SET_BY_CODE, SET_BY_SLUG, SETS } from "../src/lib/sets";
import { GUIDE_BY_SLUG, GUIDES, guideFor, guideMetaTitle, guideRegions, guidesFor, type GuideSlug } from "../src/content/guides";
import { emptyGuideData, type GuideData } from "../src/content/guides/data";
import { buildBattleSets, newestReleased, specialEtbSets, upcomingSets } from "../src/content/guides/facts";
import { GUIDE_MODULES } from "../src/content/guides/modules";
import { stripIndex } from "../src/content/guides/kit";
import { daysBetween, kitOf, perPackVerdict } from "../src/content/guides/pokemon-build-and-battle-box";
import { preorderGuide } from "../src/lib/preorder-guides";

(globalThis as unknown as { React: typeof React }).React = React;

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const TODAY = "2026-10-14";
const CHECKED = "2026-10-14T08:00:00.000Z";
const card = (setCode: string, productType: string, cents: number, stores = 3, marketplace = false): ProductCardData => ({
  slug: `${SET_BY_CODE.get(setCode)!.slug}-${productType.toLowerCase().replace(/[^a-z]+/g, "-")}`,
  name: `${SET_BY_CODE.get(setCode)!.name} ${productType}`,
  productType,
  setCode,
  imageUrl: null,
  lowestPriceCents: cents,
  inStockStores: stores,
  listedStores: stores + 1,
  marketplaceOpen: marketplace,
  medianOpenCents: null,
  releaseDate: SET_BY_CODE.get(setCode)!.releaseDate,
});
/** The cheapest first, as the loaders return them. */
const sorted = (cards: ProductCardData[]) => [...cards].sort((a, b) => (a.lowestPriceCents ?? 0) - (b.lowestPriceCents ?? 0));

function fixture(slug: GuideSlug): GuideData {
  const d = emptyGuideData(TODAY, CHECKED);
  const released = newestReleased(TODAY, 4).map((s) => s.code);
  const headline = (code: string, base: number) =>
    sorted([
      ...(SET_BY_CODE.get(code)!.noBoosterBox ? [] : [card(code, "Booster Box", base * 36 - 1500, 12)]),
      card(code, "Elite Trainer Box", base * 9 + 900, 8, true),
      card(code, "Booster Bundle", base * 6 + 50, 5),
    ]);
  switch (slug) {
    case "how-many-packs-in-pokemon-products":
      return { ...d, sets: [released[0]], bySet: { [released[0]]: headline(released[0], 800) } };
    case "booster-box-vs-etb-vs-booster-bundle":
    case "pokemon-tcg-msrp":
      return { ...d, sets: released, bySet: Object.fromEntries(released.map((c, i) => [c, headline(c, 700 + i * 40)])) };
    case "are-pokemon-booster-boxes-worth-it": {
      const codes = newestReleased(TODAY, 3, (s) => !s.noBoosterBox).map((s) => s.code);
      const bySet = Object.fromEntries(
        codes.map((c, i) => [c, sorted([card(c, "Booster Box", 29900 - i * 1000), card(c, "Booster Bundle", 5995), card(c, "Sleeved Booster", 900), card(c, "Booster Pack", 850 + i * 25)])]),
      );
      return { ...d, sets: codes, bySet };
    }
    case "pokemon-sealed-products-explained":
      return {
        ...d,
        types: [
          { productType: "Booster Box", inStock: 52, preorder: 1, fromCents: 8082 },
          { productType: "Elite Trainer Box", inStock: 61, preorder: 1, fromCents: 2999 },
          { productType: "Tin", inStock: 457, preorder: 0, fromCents: 1100 },
          { productType: "Deck", inStock: 0, preorder: 2, fromCents: null },
        ],
      };
    case "how-to-preorder-pokemon-tcg": {
      const codes = upcomingSets(TODAY)
        .slice(0, 2)
        .map((s) => s.code);
      return { ...d, sets: codes, bySet: Object.fromEntries(codes.map((c) => [c, headline(c, 1000)])), openCount: Object.fromEntries(codes.map((c) => [c, 7])) };
    }
    case "whats-in-a-pokemon-elite-trainer-box":
      return { ...d, sets: released, bySet: Object.fromEntries(released.map((c, i) => [c, [card(c, "Elite Trainer Box", 5999 + i * 300, 9)]])) };
    case "pokemon-center-etb-vs-elite-trainer-box": {
      const codes = newestReleased(TODAY, 3, (s) => packsFor("pc-etb", s.code) != null).map((s) => s.code);
      return {
        ...d,
        sets: codes,
        bySet: Object.fromEntries(codes.map((c) => [c, sorted([card(c, "Elite Trainer Box", 5999, 9), card(c, "Pokémon Center Elite Trainer Box", 8999, 2)])])),
      };
    }
    case "cheapest-way-to-buy-pokemon-packs":
      return {
        ...d,
        cards: [
          card(released[0], "Booster Box", 21900, 12),
          card(released[1], "Booster Bundle", 4500, 6),
          card(released[0], "Elite Trainer Box", 6500, 9),
          card(released[2], "Booster Pack", 699, 20),
        ],
      };
    case "where-to-buy-pokemon-cards-online":
      return {
        ...d,
        stores: [
          { store: "acecollectibles", inStock: 210, listed: 340 },
          { store: "adventurers", inStock: 120, listed: 180 },
          { store: "no-such-store", inStock: 50, listed: 60 },
        ],
        types: [
          { productType: "Booster Box", inStock: 52, preorder: 1, fromCents: 8082 },
          { productType: "Elite Trainer Box", inStock: 61, preorder: 1, fromCents: 2999 },
          { productType: "Tin", inStock: 457, preorder: 0, fromCents: 1100 },
          { productType: "Deck", inStock: 0, preorder: 2, fromCents: null },
        ],
      };
    case "how-to-avoid-resealed-pokemon-products":
      return { ...d, sets: [released[0]], bySet: { [released[0]]: headline(released[0], 800).map((p) => ({ ...p, medianOpenCents: (p.lowestPriceCents ?? 0) + 1500 })) } };
    case "pokemon-build-and-battle-box": {
      // Delta Reign's on pre-order, three released sets' in stock, 30th Celebration with none; the comparison is Pitch Black's four products.
      const codes = buildBattleSets(TODAY).map((s) => s.code);
      return {
        ...d,
        sets: codes,
        bySet: { me6: [card("me6", "Build & Battle Box", 3999, 2, true)], me5: [card("me5", "Build & Battle Box", 2500, 15)], me4: [card("me4", "Build & Battle Box", 3799, 7)], me3: [card("me3", "Build & Battle Box", 3500, 7)] },
        cards: sorted([card("me5", "Build & Battle Box", 2500, 15), card("me5", "Booster Bundle", 3000, 16), card("me5", "Elite Trainer Box", 6499, 22), card("me5", "Booster Box", 15049, 21)]),
      };
    }
  }
}

const render = (slug: GuideSlug, region: Region, data: GuideData = fixture(slug)) => renderToStaticMarkup(React.createElement(GUIDE_MODULES[slug].Body, { r: REGIONS[region], data }));
const text = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
/** The rendered row of a table (data-type), as text. */
const rowText = (html: string, type: string): string => {
  const m = new RegExp(`<(tr|li)[^>]*data-type="${type}"[^>]*>([\\s\\S]*?)</\\1>`).exec(html);
  assert.ok(m, `a row for ${type}`);
  return text(m[2]).trim();
};
/** Every (guide, region) pair the site serves. */
const PAIRS = GUIDES.flatMap((g) => guideRegions(g).map((region) => ({ g, region })));

// ─── The registry ──────────────────────────────────────────────────────────────

test("registry: unique slugs, ISO editorial dates (updated ≥ published), descriptions ≤ 160, titles that fit a <title>", () => {
  assert.equal(new Set(GUIDES.map((g) => g.slug)).size, GUIDES.length);
  assert.equal(GUIDES.length, 12);
  for (const g of GUIDES) {
    assert.match(g.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    for (const d of [g.published, g.updated]) {
      assert.match(d, /^\d{4}-\d{2}-\d{2}$/, `${g.slug}: ISO date`);
      assert.equal(new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10), d, `${g.slug}: a real date`);
    }
    assert.ok(g.updated >= g.published, `${g.slug}: updated before published`);
    assert.ok(g.description.length <= 160, `${g.slug}: description is ${g.description.length} characters`);
    assert.ok(g.title.length <= 65, `${g.slug}: title`);
    const t = guideMetaTitle(g.title);
    assert.ok((typeof t === "string" ? `${t} | DexCompare` : t.absolute).length <= 65, `${g.slug}: <title> over 65 characters`);
    assert.match(g.title, /Pokémon/, `${g.slug}: the title says Pokémon`);
    assert.equal(findBannedCopy(`${g.title} ${g.description} ${g.kicker}`), null, g.slug);
    assert.ok(GUIDE_MODULES[g.slug], `${g.slug}: a body module`);
  }
});

test("registry: every topic type and set, and every eBay context, exists", () => {
  for (const g of GUIDES) {
    for (const t of g.topic.types ?? []) assert.ok(TYPE_BY_KEY.has(t), `${g.slug}: type ${t}`);
    for (const s of g.topic.sets ?? []) assert.ok(SET_BY_SLUG.has(s), `${g.slug}: set ${s}`);
    const c = g.ebay.context;
    assert.ok(c === "sealed" || (c.startsWith("type:") && TYPE_BY_SLUG.has(c.slice(5))), `${g.slug}: context ${c}`);
    assert.ok(g.ebay.heading.length > 0 && g.ebay.heading.length <= 34, `${g.slug}: the strip heading fits one phone row`);
  }
});

test("the MSRP guide is US-only; every other guide is in all seven regions", () => {
  const msrp = GUIDE_BY_SLUG.get("pokemon-tcg-msrp")!;
  assert.deepEqual(guideRegions(msrp), ["us"]);
  assert.equal(guideFor("pokemon-tcg-msrp", "us")?.slug, "pokemon-tcg-msrp");
  for (const r of REGION_LIST.filter((x) => x.region !== "us")) {
    assert.equal(guideFor("pokemon-tcg-msrp", r.region), null, r.region);
    assert.ok(!guidesFor(r.region).some((g) => g.slug === "pokemon-tcg-msrp"), r.region);
    assert.equal(guidesFor(r.region).length, 11);
  }
  assert.equal(guidesFor("us").length, 12);
  for (const g of GUIDES.filter((x) => x.slug !== "pokemon-tcg-msrp")) assert.equal(guideRegions(g).length, 7, g.slug);
  assert.equal(guideFor("no-such-guide", "au"), null);
});

// ─── The bodies, rendered ──────────────────────────────────────────────────────

test("every guide, in every region it is offered in: no banned copy, no pull rates, EV or investing, no eBay data in the HTML", () => {
  for (const { g, region } of PAIRS) {
    const html = render(g.slug, region);
    const t = text(html);
    assert.equal(findBannedCopy(t), null, `${g.slug}/${region}: "${findBannedCopy(t)}"`);
    assert.doesNotMatch(t, /pull[-\s]*rates?|expected value|\bEV\b|invest/i, `${g.slug}/${region}`);
    assert.doesNotMatch(t, /\b\d+\s+cards?\s+(?:per|a|in each|in every|in a)\s+(?:booster\s+)?pack/i, `${g.slug}/${region}: no cards-per-pack numbers`);
    assert.doesNotMatch(html, /ebayimg\.com|\/itm\//, `${g.slug}/${region}`);
    assert.doesNotMatch(t, /\bdropped|\bwas \$|trending|selling fast|back in stock/i);
    assert.doesNotMatch(t, /\ban (?:Pokémon|booster|bundle|Build|set)\b|\ba (?:Elite|ETB)\b/, `${g.slug}/${region}: a/an`);
  }
});

test("every guide has exactly one eBay unit (the listings-guide strip) and, in the US only, one labelled TCGplayer link", () => {
  for (const { g, region } of PAIRS) {
    const html = render(g.slug, region);
    const units = html.match(/data-ad="[^"]+"/g) ?? [];
    assert.deepEqual(units, ['data-ad="listings-guide"'], `${g.slug}/${region}: one unit`);
    const tcg = [...html.matchAll(/<a [^>]*href="(https:\/\/partner\.tcgplayer\.com[^"]*)"[^>]*>/g)];
    if (region === "us") {
      assert.equal(tcg.length, 1, `${g.slug}: one TCGplayer link`);
      assert.match(tcg[0][0], /rel="sponsored nofollow noopener noreferrer"/);
      assert.match(decodeURIComponent(tcg[0][1]), /sharedid=dex-us-guide-tcgplayer|guide-tcgplayer/);
      assert.match(text(html), /on TCGplayer ↗ · affiliate link/, `${g.slug}: labelled`);
      assert.match(text(html), /Affiliate link — we may earn a commission\./);
    } else {
      assert.equal(tcg.length, 0, `${g.slug}/${region}: no TCGplayer link outside the US`);
      assert.doesNotMatch(html, /tcgplayer\.com/i);
    }
    // every outbound paid link is sponsored
    for (const m of html.matchAll(/<a [^>]*href="https:\/\/[^"]*(?:ebay|tcgplayer)\.[^"]*"[^>]*>/g)) assert.match(m[0], /rel="sponsored/, `${g.slug}/${region}`);
  }
});

test("the strip sits after the first live block, and the table of contents is the body's H2s", () => {
  for (const { g, region } of PAIRS) {
    const r = REGIONS[region];
    const data = fixture(g.slug);
    const outline = GUIDE_MODULES[g.slug].outline(r, data);
    const html = render(g.slug, region, data);
    const h2 = [...html.matchAll(/<h2 id="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(h2, outline.sections.map((s) => s.id), `${g.slug}/${region}: TOC = H2s`);
    assert.equal(new Set(h2).size, h2.length, "unique anchors");
    assert.ok(outline.sections.some((s) => s.live), `${g.slug}: has a live block`);
    const at = stripIndex(outline.sections);
    const strip = html.indexOf('data-ad="listings-guide"');
    assert.ok(strip > html.indexOf(`<h2 id="${outline.sections[at].id}"`), `${g.slug}: after the live section's heading`);
    if (outline.sections[at + 1]) assert.ok(strip < html.indexOf(`<h2 id="${outline.sections[at + 1].id}"`), `${g.slug}: before the next section`);
    assert.equal(outline.sections.at(-1)!.id, "where-to-buy", `${g.slug}: closes with Where to buy`);
  }
});

test("every guide links at least three product, set or type pages, and every type, set and guide it links exists", () => {
  for (const { g, region } of PAIRS) {
    const html = render(g.slug, region);
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    const deep = hrefs.filter((h) => new RegExp(`^/${region}/(?:p|sets|type)/`).test(h));
    assert.ok(deep.length >= 3, `${g.slug}/${region}: ${deep.length} links to product, set or type pages`);
    for (const h of hrefs) {
      let m: RegExpExecArray | null;
      if ((m = /^\/[a-z]{2}\/type\/([^/#?]+)/.exec(h))) assert.ok(TYPE_BY_SLUG.has(m[1]), `${g.slug}: type ${m[1]}`);
      if ((m = /^\/[a-z]{2}\/sets\/([^/#?]+)/.exec(h))) assert.ok(SET_BY_SLUG.has(m[1]), `${g.slug}: set ${m[1]}`);
      if ((m = /^\/([a-z]{2})\/guides\/([^/#?]+)/.exec(h))) assert.ok(guideFor(m[2], m[1] as Region), `${g.slug}/${region}: links guide ${m[2]}, which ${m[1]} doesn't offer`);
      if (h.startsWith("/")) assert.ok(h.startsWith(`/${region}/`) || h === `/${region}`, `${g.slug}/${region}: an internal link leaves the region: ${h}`);
    }
  }
});

test("how many packs: every count in the table is packsFor()'s", () => {
  for (const region of ["au", "us"] as const) {
    const html = render("how-many-packs-in-pokemon-products", region);
    const nums = (type: string) => (rowText(html, type).match(/\b\d+\b/g) ?? []).map(Number);
    assert.deepEqual(nums("booster-box"), [packsFor("booster-box", "me5")]);
    assert.ok(nums("booster-box-case").includes(packsFor("booster-box-case", "me5")!));
    assert.ok(nums("booster-box-case").includes(packsFor("booster-box-case", "me5")! / packsFor("booster-box", "me5")!), "boxes per case");
    // ETB: the series' counts, and the special sets' count in the note
    for (const code of ["me5", "sv10", "swsh12", "sm12", "xy12"]) assert.ok(nums("etb").includes(packsFor("etb", code)!), `etb ${code}`);
    assert.ok(nums("etb").includes(packsFor("etb", "swsh12pt5")!), "the special sets' 10");
    for (const code of ["me5", "sv10", "swsh12"]) assert.ok(nums("pc-etb").includes(packsFor("pc-etb", code)!), `pc-etb ${code}`);
    for (const code of ["me5", "swsh12"]) assert.ok(nums("etb-case").includes(packsFor("etb-case", code)!), `etb-case ${code}`);
    for (const code of ["sv10", "swsh12"]) assert.ok(nums("build-battle-stadium").includes(packsFor("build-battle-stadium", code)!), `stadium ${code}`);
    assert.deepEqual(nums("booster-bundle"), [packsFor("booster-bundle", "me5")]);
    assert.deepEqual(nums("build-battle"), [packsFor("build-battle", "me5")]);
    assert.deepEqual(nums("sleeved-booster"), [packsFor("sleeved-booster", "me5")]);
    assert.deepEqual(nums("booster-pack"), [packsFor("booster-pack", "me5")]);
    assert.match(rowText(html, "blister"), new RegExp(` ${packsFor("blister", null, "Single Pack Blister")} to ${packsFor("blister", null, "3-Pack Blister")}$`), "1 to 3, read from the name");
    const t = text(html);
    assert.match(t, /Pack counts from the publisher’s product listings, as recorded in our data\./);
    // the special ETB sets are exactly packs.ts's, each linked
    for (const { set } of specialEtbSets()) assert.ok(t.includes(set.name), set.name);
    for (const { set, packs } of specialEtbSets()) if (packs != null) assert.match(html, new RegExp(`href="/${region}/sets/${set.slug}"`));
    // the intro's numbers
    assert.match(t, new RegExp(`booster box holds ${packsFor("booster-box", "me5")} packs , a booster bundle ${packsFor("booster-bundle", "me5")} , and an Elite Trainer Box ${packsFor("etb", "me5")}`));
  }
});

test("live blocks: price, per pack (packs.ts) and the cheapest per pack marked, in the region's currency", () => {
  const data = fixture("booster-box-vs-etb-vs-booster-bundle");
  for (const region of ["au", "uk", "us"] as const) {
    const r = REGIONS[region];
    const html = render("booster-box-vs-etb-vs-booster-bundle", region, data);
    const t = text(html);
    for (const code of data.sets) {
      for (const p of data.bySet[code]) {
        const pp = perPackCents(p.lowestPriceCents, packsFor(TYPE_BY_LABEL.get(p.productType)!.key, p.setCode));
        assert.ok(t.includes(money(p.lowestPriceCents, r.market)), `${region} ${p.name} price`);
        assert.ok(t.includes(money(pp, r.market)), `${region} ${p.name} per pack ${money(pp, r.market)}`);
        assert.match(html, new RegExp(`href="/${region}/p/${p.slug}"`));
      }
      if (SET_BY_CODE.get(code)!.noBoosterBox) assert.match(t, /Sold without a booster box/);
    }
    assert.equal((html.match(/Cheapest per pack/g) ?? []).length, data.sets.length, "one marked per set");
    assert.match(t, /Prices checked/);
  }
});

test("MSRP numbers are rrp.ts's, US only, and RRP_NOTE goes wherever an MSRP is printed", () => {
  const sv = SETS.find((s) => s.series === "Scarlet & Violet" && !s.noBoosterBox)!.code;
  const me = SETS.find((s) => s.series === "Mega Evolution" && !s.noBoosterBox)!.code;
  const html = render("pokemon-tcg-msrp", "us");
  for (const type of ["booster-pack", "sleeved-booster", "booster-box", "booster-bundle", "etb", "pc-etb", "build-battle"] as const) {
    for (const code of [sv, me]) {
      const cents = usMsrpCents(type, code)!;
      const row = rowText(html, type);
      assert.ok(row.includes(money(cents, "US")), `${type}: ${money(cents, "US")}`);
      assert.ok(row.includes(money(perPackCents(cents, packsFor(type, code)), "US")), `${type} per pack`);
    }
  }
  assert.match(text(html), /as of September 2026/);
  assert.ok(!/\$3\.99|\$39\.99/.test(text(html)), "nothing before Scarlet & Violet");
  // the box guide: 36 × $4.49
  const box = text(render("are-pokemon-booster-boxes-worth-it", "us"));
  assert.ok(box.includes(money(usMsrpCents("booster-box", me), "US")) && box.includes(`${packsFor("booster-box", me)} × ${money(usMsrpCents("booster-pack", me), "US")}`));
  assert.equal(usMsrpCents("booster-box", me), packsFor("booster-box", me)! * usMsrpCents("booster-pack", me)!);
  assert.match(box, /the MSRP of a Scarlet & Violet or Mega Evolution booster box is/, "one box: 'or', not 'and'");
  for (const { g, region } of PAIRS) {
    const t = text(render(g.slug, region));
    if (region === "us") {
      if (/MSRP/.test(t)) assert.ok(t.includes(RRP_NOTE), `${g.slug}: RRP_NOTE beside the MSRP`);
    } else assert.doesNotMatch(t, /MSRP|list price of/i, `${g.slug}/${region}: no MSRP outside the US`);
  }
  for (const slug of ["booster-box-vs-etb-vs-booster-bundle", "are-pokemon-booster-boxes-worth-it", "pokemon-tcg-msrp", "how-to-preorder-pokemon-tcg"] as const) assert.match(text(render(slug, "us")), /MSRP/, slug);
});

test("sealed products explained: one H2 per product type, type-about.ts's words, packs.ts's count or 'varies', and the live line", () => {
  const html = render("pokemon-sealed-products-explained", "uk");
  const h2 = [...html.matchAll(/<h2 id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(h2.slice(0, -1), [...TYPE_BY_SLUG.keys()]);
  const t = text(html);
  assert.match(t, /52 in stock in the UK from £80\.82 · 1 on pre-order/);
  assert.match(t, /None in stock in the UK right now · 2 on pre-order/);
  for (const [slug, info] of TYPE_BY_SLUG) {
    assert.match(html, new RegExp(`href="/uk/type/${slug}"`), slug);
    const block = new RegExp(`data-type="${info.key}"[^>]*>([\\s\\S]*?)/uk/type/${slug}"`).exec(html);
    assert.ok(block, `${slug}: its card`);
    const bt = text(block[1]);
    assert.ok(bt.includes(text(TYPE_ABOUT[slug]).trim()), `${slug}: type-about.ts word for word`);
    const counts = new Set(SETS.map((x) => packsFor(info.key, x.code)));
    if (counts.size === 1 && [...counts][0] != null) assert.match(bt, new RegExp(`^\\W*${[...counts][0]}\\b`), `${slug}: ${[...counts][0]} packs`);
    if (counts.size === 1 && [...counts][0] == null && info.key !== "blister") assert.match(bt, /Varies/, `${slug}: varies`);
  }
});

test("pre-orders: upcoming sets with their dates and open counts; a checklist of checks", () => {
  const html = render("how-to-preorder-pokemon-tcg", "au");
  const t = text(html);
  for (const s of upcomingSets(TODAY).slice(0, 2)) {
    assert.match(html, new RegExp(`href="/au/sets/${s.slug}"`));
    assert.match(html, new RegExp(`dateTime="${s.releaseDate}"`, "i"));
  }
  assert.match(t, /7 products open for pre-order in Australia/);
  assert.match(t, /stores may ship pre-orders a few days either side/i);
  const checks = [...html.matchAll(/<li class="flex gap-3[^"]*"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => text(m[1]).trim());
  assert.ok(checks.length >= 6);
  for (const c of checks) assert.match(c, /^Check /, `a check, not a claim: ${c}`);
  // nothing upcoming: an empty state that points at the calendar, and the strip still has its place
  const none = render("how-to-preorder-pokemon-tcg", "au", emptyGuideData(TODAY, CHECKED));
  assert.match(text(none), /No announced set is waiting for release right now/);
  assert.equal((none.match(/data-ad=/g) ?? []).length, 1);
});

test("live blocks with nothing in stock say so plainly, and the page still renders whole", () => {
  for (const { g, region } of PAIRS) {
    const data = { ...fixture(g.slug), bySet: {}, openCount: {}, types: [] };
    const html = render(g.slug, region, data);
    assert.equal(findBannedCopy(text(html)), null);
    assert.equal((html.match(/data-ad=/g) ?? []).length, 1, `${g.slug}/${region}`);
  }
  assert.match(text(render("are-pokemon-booster-boxes-worth-it", "nz", { ...fixture("are-pokemon-booster-boxes-worth-it"), bySet: {} })), /No .* booster box is in stock in New Zealand right now/);
});

test("Build & Battle Box: packs.ts's count, Delta Reign's deck and promos with their source, live prices per set, and no US list price", () => {
  const data = fixture("pokemon-build-and-battle-box");
  const kit = kitOf(data)!;
  assert.equal(kit.set.code, "me6");
  for (const region of ["au", "us", "uk"] as const) {
    const r = REGIONS[region];
    const html = render("pokemon-build-and-battle-box", region, data);
    const t = text(html);
    assert.match(t, new RegExp(`${packsFor("build-battle", "me6")} booster packs`), "the pack count is packs.ts's");
    assert.match(t, /Masquerain, Magmortar, Enamorus or Kommo-o \(ICv2, 1 October 2026\)/);
    assert.match(t, /40-card deck/);
    assert.ok(t.includes(TYPE_ABOUT["build-and-battle-boxes"]), "type-about.ts word for word");
    // the live table: one row per set, its price and per-pack price in the region's currency
    for (const code of data.sets.filter((c) => data.bySet[c]?.length)) {
      const s = SET_BY_CODE.get(code)!;
      const p = data.bySet[code][0];
      assert.match(html, new RegExp(`href="/${region}/sets/${s.slug}"`), s.name);
      assert.match(html, new RegExp(`href="/${region}/p/${p.slug}"`), `${s.name}: its product page`);
      assert.ok(t.includes(money(p.lowestPriceCents, r.market)), `${region} ${s.name} price`);
      assert.ok(t.includes(money(perPackCents(p.lowestPriceCents, packsFor("build-battle", code)), r.market)), `${region} ${s.name} per pack`);
    }
    assert.doesNotMatch(html, /href="\/[a-z]{2}\/sets\/30th-celebration"/, "a set with no box open gets no row");
    assert.match(text(render("pokemon-build-and-battle-box", region, { ...data, bySet: {} })), new RegExp(`No Build & Battle Box is in stock in ${r.inName} right now`));
    // the next box: its dates, days early, and its pre-order page
    assert.match(t, /It’s sold from 24 October 2026 at participating Play! Pokémon stores/);
    assert.match(t, new RegExp(`${daysBetween("2026-10-24", "2026-11-06")} days before Delta Reign is released on 6 November 2026`));
    assert.match(html, new RegExp(`href="/${region}/preorders/delta-reign"`), "links the pre-order page");
    // the comparison: Pitch Black's four products, the cheapest per pack marked, and the verdict from the same numbers
    assert.equal((html.match(/Cheapest per pack/g) ?? []).length, 1);
    assert.ok(t.includes(perPackVerdict(data.cards, SET_BY_CODE.get("me5")!, r)!), "the verdict sentence");
    // no Build & Battle list price, anywhere
    assert.ok(!t.includes(money(usMsrpCents("build-battle", "me6"), "US")), `${region}: no $29.99`);
    assert.doesNotMatch(t, /\$21\.99|MSRP/);
  }
  assert.match(text(render("pokemon-build-and-battle-box", "us", data)), /We don’t print a US list price for this box/);
  assert.doesNotMatch(text(render("pokemon-build-and-battle-box", "au", data)), /list price/, "the US note is US-only");
  // after Delta Reign's release: no "next box" section, the rest still renders
  const later = { ...data, today: "2026-11-10" };
  assert.doesNotMatch(text(render("pokemon-build-and-battle-box", "au", later)), /It’s sold from 24 October/);
  assert.equal(preorderGuide("me6")?.prerelease?.deckCards, 40);
});

test("Build & Battle verdict: the cheaper product per pack is named only when the numbers say so", () => {
  const me5 = SET_BY_CODE.get("me5")!;
  const v = perPackVerdict([card("me5", "Build & Battle Box", 2500), card("me5", "Booster Box", 15049)], me5, REGIONS.us)!;
  assert.equal(v, `In Pitch Black today, the booster box works out cheaper per pack (${money(perPackCents(15049, 36), "US")}) than the Build & Battle Box (${money(625, "US")}).`);
  const bbWins = perPackVerdict([card("me5", "Build & Battle Box", 1600), card("me5", "Booster Bundle", 3000)], me5, REGIONS.au)!;
  assert.match(bbWins, /the Build & Battle Box is the cheapest per pack of the two \(A\$4\.00\)/);
  assert.equal(perPackVerdict([card("me5", "Booster Bundle", 3000)], me5, REGIONS.au), null, "no box, no verdict");
});

test("no growth-pack placeholder survives anywhere in the app's source", () => {
  const walk = (dir: URL): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(new URL(`${e.name}/`, dir)) : /\.(tsx?|md)$/.test(e.name) ? [new URL(e.name, dir).pathname] : []));
  for (const f of walk(new URL("../src/", import.meta.url))) {
    assert.doesNotMatch(readFileSync(f, "utf8"), /\[VERIFY|\[live price|\[live count|\[publish date\]/i, f);
  }
});

// ─── The old site's URLs ───────────────────────────────────────────────────────

type Redirect = { source: string; destination: string; permanent: boolean };
const require = createRequire(import.meta.url);
const config = require("../next.config.js") as { redirects: () => Promise<Redirect[]> };
const APP = new URL("../src/app/", import.meta.url);
// Routes this release adds in sibling workstreams (deals, cheapest per pack). On the merged tree their page.tsx exists too.
const RELEASE_ROUTES = new Set(["deals", "cheapest-packs"]);

/** Does a destination path land on a page this app serves? */
function served(path: string): boolean {
  if (path === "/about") return existsSync(new URL("(site)/about/page.tsx", APP));
  const [region, section, slug, ...rest] = path.split("/").filter(Boolean);
  if (!REGIONS[region as Region] || rest.length) return false;
  if (!section) return existsSync(new URL("[region]/page.tsx", APP));
  if (section === "guides") return slug ? !!guideFor(slug, region as Region) : existsSync(new URL("[region]/guides/page.tsx", APP));
  if (section === "sets" && slug) return SET_BY_SLUG.has(slug) && existsSync(new URL("[region]/sets/[set]/page.tsx", APP));
  if (slug) return false;
  return existsSync(new URL(`[region]/${section}/page.tsx`, APP)) || RELEASE_ROUTES.has(section);
}

/** Next's first matching redirect for a path, matched exactly as Next matches a redirect's source (its own path matcher). */
const nextMatch = require("next/dist/shared/lib/router/utils/path-match") as {
  getPathMatch: (source: string, opts: { strict: boolean; removeUnnamedParams: boolean; sensitive: boolean }) => (path: string) => false | object;
};
function firstMatch(rules: Redirect[], path: string): Redirect | null {
  for (const rule of rules) if (nextMatch.getPathMatch(rule.source, { strict: true, removeUnnamedParams: true, sensitive: false })(path)) return rule;
  return null;
}

test("legacy redirects: every specific source was a real old guide or blog post, and every destination is a page we serve", async () => {
  const rules = await config.redirects();
  const articles = readFileSync(new URL("../../dexcompare/src/lib/articles.ts", import.meta.url), "utf8");
  const old = new Map([...articles.matchAll(/slug: "([^"]+)",\s*category: "(guide|blog)"/g)].map((m) => [m[1], m[2]]));
  assert.ok(old.size > 30, "read the old site's articles");
  for (const rule of rules) {
    assert.equal(rule.permanent, true, rule.source);
    const m = /^\/(guides|blog)\/([a-z0-9-]+)$/.exec(rule.source);
    if (m) assert.equal(old.get(m[2]), m[1] === "guides" ? "guide" : "blog", `${rule.source}: not an old ${m[1]} URL`);
    if (!rule.destination.includes(":")) assert.ok(served(rule.destination), `${rule.source} → ${rule.destination}: no such page`);
  }
  assert.match(rules.at(-1)!.source, /^\/guides\/:path\(/, "the blanket rule stays last");
  assert.equal(rules.at(-1)!.destination, "/about");
  const to = (p: string) => firstMatch(rules, p)?.destination;
  assert.equal(to("/guides"), "/au/guides");
  assert.equal(to("/guides/pokemon-sealed-products-explained"), "/au/guides/pokemon-sealed-products-explained");
  assert.equal(to("/guides/where-to-buy-pokemon-cards"), "/au/stores");
  assert.equal(to("/guides/how-to-buy-pokemon-sealed-product-for-less"), "/au/cheapest-packs");
  assert.equal(to("/guides/pokemon-card-sets-and-eras-explained"), "/au/sets");
  assert.equal(to("/blog/are-booster-boxes-worth-it"), "/au/guides/are-pokemon-booster-boxes-worth-it");
  assert.equal(to("/blog/cheapest-way-to-buy-pokemon-cards"), "/au/cheapest-packs");
  assert.equal(to("/blog/pokemon-30th-celebration-preorder-guide"), "/au/sets/30th-celebration");
  assert.equal(to("/blog/pitch-black-preorder-guide"), "/au/sets/pitch-black");
  assert.equal(to("/blog/chaos-rising-restock-playbook"), "/au/sets/chaos-rising");
  assert.equal(to("/deals"), "/au/deals");
  assert.equal(to("/guides/how-to-spot-fake-pokemon-cards"), "/about", "a singles-only guide still goes to About");
  assert.equal(to("/blog/pokemon-cards-as-an-investment"), undefined, "a singles-only blog post is left alone");
  assert.equal(to("/au/guides/pokemon-tcg-msrp"), undefined, "the new hub is never redirected");
  // The by-country guide lives at /guides/<slug>: the blanket rule skips it, and only it.
  assert.equal(to("/guides/pokemon-booster-box-prices-by-country"), undefined, "the by-country guide is served, not redirected");
  assert.ok(existsSync(new URL("(site)/guides/[slug]/page.tsx", APP)));
  assert.equal(to("/guides/pokemon-booster-box-prices-by-country-old"), "/about");
  assert.equal(to("/guides/pokemon-booster-box-prices-by-country/x"), "/about");
  assert.equal(to("/guides/how-to-grade-pokemon-cards/deep/path"), "/about");
});
