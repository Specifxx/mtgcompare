// The three Star Trek posts of 2026-10-16 (src/lib/blog/posts/star-trek-release-date.tsx, star-trek-commander-decks.tsx,
// star-trek-mechanics.tsx, from the owner's growth pack): each builds from the release's catalogue rows (PostContext.releases)
// and its per-commit lookups (PostContext.starTrek); prints no price the data does not hold, Wizards' US MSRPs aside, each
// beside the word MSRP; keeps no placeholder of the pack; links only to pages that exist; and says so, never breaks, when the
// catalogue holds nothing yet. Rendered to markup so the sentences are read as a visitor reads them. The quotes of Wizards and
// Scryfall were checked word for word against both sources on 16 October 2026 (DECISIONS.md, "Three Star Trek posts").
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { POSTS, postHref } from "../src/lib/blog";
import { starTrekCommanderDecks } from "../src/lib/blog/posts/star-trek-commander-decks";
import { starTrekMechanics } from "../src/lib/blog/posts/star-trek-mechanics";
import { starTrekReleaseDate } from "../src/lib/blog/posts/star-trek-release-date";
import { CONTENTS, NAMED_CARDS, PRECONS, SCRYFALL_TEXT, SEASON, SHOCK_LANDS, WIZARDS_SAYS, deckProducts } from "../src/lib/blog/star-trek";
import type { Post, PostBody, PostContext, ReleaseView, StarTrekView } from "../src/lib/blog/types";
import { fold } from "../src/lib/constants";
import { COUNTRY_LIST, type Country } from "../src/lib/country";
import type { CardLite, OracleMini, SealedLite, SetLite } from "../src/lib/data";
import { money } from "../src/lib/format";
import { headline } from "../src/lib/price";
import { STAR_TREK, lineOf, longDateOf } from "../src/lib/preorders";

// The posts are TSX compiled with the classic runtime under tsx: React must be a global to build one.
(globalThis as { React?: unknown }).React = React;

const ROOT = path.resolve(__dirname, "..");
const NEW = [starTrekReleaseDate, starTrekCommanderDecks, starTrekMechanics];
const NONE = { US: null, AU: null, UK: null, SG: null, CA: null, EU: null };
const ZERO = { US: 0, AU: 0, UK: 0, SG: 0, CA: 0, EU: 0 };
type Per<T> = Partial<Record<Country, T>>;

// ── fixtures: the shapes of the live catalogue on 2026-10-16 (slugs and names as the catalogue holds them; prices are test inputs, none equal to an MSRP) ──
const set = (id: number, tok: string, name: string, kind: SetLite["kind"]): SetLite => ({ id, tok, slug: `${tok}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, code: tok.toUpperCase(), name, tcgName: name, kind, releasedOn: "2026-11-13", bucket: false, cardCount: 0, trackedCount: 0, sealedCount: 0 });
const TRK = set(24766, "trk", "Star Trek", "expansion"), TRC = set(24770, "trc", "Commander: Star Trek", "commander");
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const sealed = (id: number, name: string, kind: SealedLite["kind"], setId: number, low: Per<number> = {}, stores: Per<number> = {}): SealedLite => ({ id, slug: slugify(name), name, setId, kind, packCount: null, releasedOn: "2026-11-13", presale: true, marketUsd: null, lowTcg: null, low: { ...NONE, ...low }, stores: { ...ZERO, ...stores }, change7d: null });
const DECKS = PRECONS.map((p) => p.name);
const PRODUCTS: SealedLite[] = [
  sealed(1, "Star Trek - Play Booster Display", "Booster Box", TRK.id, { US: 13899, AU: 26995 }, { US: 7, AU: 2 }),
  sealed(2, "Star Trek - Play Booster Pack", "Booster Pack", TRK.id, { US: 549 }, { US: 3 }),
  sealed(3, "Star Trek - Collector Booster Display", "Booster Box", TRK.id, { US: 54999 }, { US: 4 }),
  sealed(4, "Star Trek - Beam Me Up Bundle", "Bundle", TRK.id, { US: 9449 }, { US: 2 }),
  sealed(5, "Star Trek - Prerelease Pack", "Prerelease Pack", TRK.id),
  sealed(10, "Star Trek Commander Deck - Federation Fleet", "Commander Deck", TRC.id, { US: 6499 }, { US: 2 }),
  sealed(11, "Star Trek Commander Deck - Landing Party", "Commander Deck", TRC.id, { US: 6299 }, { US: 1 }),
  sealed(12, "Star Trek Commander Deck - Klingon Fury", "Commander Deck", TRC.id, { US: 5999 }, { US: 0 }),
  sealed(13, "Star Trek Commander Deck - We Are the Borg", "Commander Deck", TRC.id, { US: 6849, AU: 11995 }, { US: 3, AU: 1 }),
  sealed(14, "Star Trek Commander Deck - Federation Fleet (Collector's Edition)", "Commander Deck", TRC.id, { US: 18999 }, { US: 2 }),
  sealed(15, "Star Trek Commander Deck - We Are the Borg (Collector's Edition)", "Commander Deck", TRC.id),
  sealed(16, "Star Trek Commander Deck Case", "Case", TRC.id, { US: 21999 }, { US: 4 }),
];
/** flags 64: TCGplayer has a scan (CARD_FLAGS.TCGIMG). */
const card = (id: number, name: string, setv: SetLite, number: string, marketUsd: number | null, low: Per<number> = {}, variant: string | null = null): CardLite =>
  ({ id, slug: `${slugify(name)}-${setv.tok}-${number}${variant ? `-${slugify(variant)}` : ""}`, name, alt: null, setId: setv.id, sc: setv.tok, setCode: setv.code, number, rarity: "R", cls: 0, treat: [], label: variant, flags: 64, oracleNo: null, scryId: null, colorMask: 0, mv: 0, ptype: 0, marketUsd, headFinish: "N", valueUsd: marketUsd, lowOnly: false, n: { market: marketUsd, low: low.US ?? null }, f: null, tracked: 1, listed: true, top: false, thin: false, low: { ...NONE, ...low }, stores: { ...ZERO, ...Object.fromEntries(Object.entries(low).map(([k, v]) => [k, v ? 2 : 0])) }, change7d: null, change30d: null, high90Usd: null, colors: [], variant, printing: "standard", cost: null, cardType: "Creature", hasImage: true }) as CardLite;
const TRK_CARDS = [card(101, "Set Phasers to...", TRK, "34", null), card(102, "Hoshi Sato, Exolinguist", TRK, "64", 412, { US: 499 }), card(103, "Seven of Nine", TRK, "252", 1798), card(104, "U.S.S. Enterprise-D, Galaxy-Class", TRK, "273", 2533, { US: 2899, AU: 4500 })];
const TRC_CARDS = [card(201, "Captain Kirk, Boldly Going", TRC, "85", 1250, { US: 1399 })];
const SHOCKS = [card(301, "Blood Crypt", TRK, "278", 1475, { US: 1549 }), card(302, "Breeding Pool", TRK, "401", null, {}, "LCARS")];
const oracle = (no: number, name: string): OracleMini => ({ no, slug: slugify(name), name, nameKey: fold(name), colors: 0, identity: 0, typeLine: "", nPrint: 1, legal: "", flags: 0 });
const ORACLES = new Map(["Seven of Nine", "Hoshi Sato, Exolinguist", "Captain Kirk, Boldly Going"].map((n, i) => [fold(n), oracle(i + 1, n)] as const));
const TREK: StarTrekView = { oracles: ORACLES, shocks: SHOCKS, keywords: [{ slug: "face-a-dilemma", label: "Face a dilemma", count: 1 }, { slug: "station", label: "Station", count: 33 }] };

const view = (over: Partial<ReleaseView> = {}): ReleaseView => ({ release: STAR_TREK, sets: [TRK, TRC], releasedOn: "2026-11-13", out: false, sealed: PRODUCTS, cards: [{ set: TRK, items: TRK_CARDS, total: 35 }, { set: TRC, items: TRC_CARDS, total: 1 }], ...over });
const ctx = (releases: ReleaseView[], starTrek: StarTrekView | null = TREK, country: Country = "US") => ({ releases, starTrek, country, top: [] }) as unknown as PostContext;
const html = (b: PostBody) => renderToStaticMarkup(createElement("div", null, ...b.summary, b.lede, ...b.sections.map((s) => createElement("section", { id: s.id }, createElement("h2", null, s.title), s.body))));
const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");
const faqText = (p: Post) => (p.faq ?? []).map((f) => `${f.q} ${f.a}`).join(" ");

// ── prices: every figure a post prints is one the data holds (or Wizards' MSRP, said as such) ───────────────────────────────
const MONEY = /(?:US\$|A\$|S\$|C\$|£|€)\d[\d,]*(?:\.\d{2})?/g;
function heldPrices(country: Country): Set<string> {
  const out = new Set<string>();
  for (const p of PRODUCTS) for (const m of COUNTRY_LIST) if (p.low[m.code] != null) out.add(money(p.low[m.code], m.code));
  for (const c of [...TRK_CARDS, ...TRC_CARDS, ...SHOCKS]) {
    if (c.marketUsd != null) out.add(money(c.marketUsd, "US"));
    const h = headline(c, country);
    if (h.cents != null) out.add(money(h.cents, country));
  }
  // the one sum a post adds up: the four regular decks, each at its cheapest listing in the market
  const decks = deckProducts(PRODUCTS).map((d) => d.deck?.low[country] ?? null);
  if (decks.every((x) => x != null)) out.add(money(decks.reduce((t, x) => t! + x!, 0), country));
  return out;
}
const MSRPS = new Set((STAR_TREK.msrp?.rows ?? []).map((r) => money(r.usdCents, "US")));
/** `msrpTable`: the text is a table whose column is headed "US MSRP", so an MSRP figure needs no word beside it. */
function assertOnlyHeldPrices(t: string, country: Country, where: string, msrpTable = false) {
  const held = heldPrices(country);
  for (const m of t.matchAll(MONEY)) {
    const figure = m[0], before = t.slice(Math.max(0, m.index! - 90), m.index!);
    if (MSRPS.has(figure) && (msrpTable || /MSRP/.test(before + t.slice(m.index!, m.index! + 40)))) continue;
    assert.ok(held.has(figure), `${where}: ${figure} is not a price the data holds (…${before.slice(-60)}${figure})`);
  }
}

// ── links: every internal link lands on a page that exists ──────────────────────────────────────────────────────────────────
function linksOf(h: string): string[] {
  return [...h.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!.replace(/&amp;/g, "&")).filter((x) => x.startsWith("/"));
}
const staticRoute = (p: string) => fs.existsSync(path.join(ROOT, "src/app", p, "page.tsx"));
function assertResolves(href: string, c: PostContext, where: string) {
  const [pathPart, anchor] = href.split("#") as [string, string | undefined];
  const clean = pathPart.split("?")[0]!;
  let m: RegExpMatchArray | null;
  if ((m = clean.match(/^\/(blog|guides)\/([^/]+)$/))) {
    const post = POSTS.find((p) => postHref(p) === clean);
    assert.ok(post, `${where}: ${href} is not a post`);
    if (anchor) assert.ok(post!.build(c).sections.some((s) => s.id === anchor), `${where}: ${href} has no section #${anchor}`);
  } else if ((m = clean.match(/^\/sets\/([^/]+)$/))) assert.ok([TRK, TRC].some((s) => s.slug === m![1]), `${where}: ${href} is not a set`);
  else if ((m = clean.match(/^\/sealed\/([^/]+)$/))) assert.ok(PRODUCTS.some((p) => p.slug === m![1]), `${where}: ${href} is not a product`);
  else if ((m = clean.match(/^\/card\/([^/]+)$/))) assert.ok([...TRK_CARDS, ...TRC_CARDS, ...SHOCKS].some((x) => x.slug === m![1]), `${where}: ${href} is not a card`);
  else if ((m = clean.match(/^\/cards\/name\/([^/]+)$/))) assert.ok([...(c.starTrek?.oracles.values() ?? [])].some((o) => o.slug === m![1]), `${where}: ${href} is not an Oracle card of the data`);
  else if ((m = clean.match(/^\/keywords\/([^/]+)$/))) assert.ok((c.starTrek?.keywords ?? []).some((k) => k.slug === m![1]), `${where}: ${href} is not a keyword page`);
  else assert.ok(staticRoute(clean), `${where}: ${href} is not a page`);
}

test("the three posts: blog posts of 2026-10-16, registered first, newest first, with FAQs, short titles and real related links", () => {
  assert.deepEqual(POSTS.slice(0, 3), NEW);
  assert.deepEqual(NEW.map(postHref), ["/blog/magic-star-trek-release-date-products", "/blog/magic-star-trek-commander-decks", "/blog/magic-star-trek-mechanics-explained"]);
  for (const p of NEW) {
    assert.equal(p.category, "blog", p.slug);
    assert.equal(p.date, "2026-10-16", p.slug);
    const title = p.title({ cat: { pricesAt: "2026-10-16" } });
    assert.ok(title.length <= 60, `${p.slug}: ${title.length} characters`);
    assert.ok(p.description.length >= 120 && p.description.length <= 230, `${p.slug}: description ${p.description.length}`);
    assert.ok((p.faq?.length ?? 0) >= 4, p.slug);
    assert.ok(p.related.length === 3 && p.related.every((r) => staticRoute(r.href)), p.slug);
    assert.ok(p.related.some((r) => r.href === STAR_TREK.path), p.slug);
    for (const f of p.faq ?? []) for (const m of f.a.matchAll(/\]\(([^)]*)\)/g)) assertResolves(m[1]!, ctx([view()]), `${p.slug} FAQ`);
  }
});

test("no placeholder of the growth pack survives, in the source or in what a visitor reads", () => {
  const files = ["src/lib/blog/posts/star-trek-release-date.tsx", "src/lib/blog/posts/star-trek-commander-decks.tsx", "src/lib/blog/posts/star-trek-mechanics.tsx", "src/lib/blog/star-trek.ts"];
  for (const f of files) assert.doesNotMatch(fs.readFileSync(path.join(ROOT, f), "utf8"), /\[VERIFY|\[live price|VERIFY-slug|TODO|TBD/i, f);
  for (const p of NEW) for (const c of [ctx([view()]), ctx([]), ctx([view({ out: true })], null)]) {
    const t = text(html(p.build(c))) + faqText(p);
    assert.doesNotMatch(t, /\[VERIFY|\[live price|VERIFY-slug|\bTBD\b/i, p.slug);
    assert.doesNotMatch(t, /\bofficially\b/i, "the site-claims rule: no 'officially ... Wizards'");
  }
});

test("every internal link of the three posts lands on a page that exists, in every state", () => {
  for (const p of NEW) for (const [label, c] of [["full", ctx([view()])], ["AU", ctx([view()], TREK, "AU")], ["empty", ctx([], null)], ["released", ctx([view({ out: true })])]] as const) {
    const links = linksOf(html(p.build(c)));
    assert.ok(links.length >= 3, `${p.slug} (${label}) links somewhere`);
    for (const href of links) assertResolves(href, c, `${p.slug} (${label})`);
  }
  // the guides link one another, the two posts of 2026-10-14 and the pre-order page
  const all = NEW.map((p) => html(p.build(ctx([view()])))).join(" ");
  for (const href of ["/blog/where-to-buy-magic-star-trek", "/blog/magic-star-trek-spoilers", "/star-trek-preorders", "/keywords", "/commanders", "/release-dates", "/sets/trk-star-trek", ...NEW.map(postHref)]) assert.ok(all.includes(`href="${href}`), href);
});

test("no price the data does not hold: live figures come from the catalogue, the only other figures are Wizards' US MSRPs, each beside the word MSRP", () => {
  for (const country of ["US", "AU", "UK"] as const) for (const p of NEW) {
    const b = p.build(ctx([view()], TREK, country));
    assertOnlyHeldPrices(text(html({ ...b, sections: b.sections.filter((s) => s.id !== "products") })), country, `${p.slug} (${country})`);
    for (const s of b.sections.filter((x) => x.id === "products")) {
      const t = text(renderToStaticMarkup(createElement("div", null, s.body)));
      assert.match(t, /Product US MSRP What is inside/, "the products table heads its MSRP column");
      assertOnlyHeldPrices(t, country, `${p.slug} products (${country})`, true);
    }
  }
  for (const p of NEW) {
    const f = faqText(p);
    for (const m of f.matchAll(MONEY)) assert.ok(MSRPS.has(m[0]) && /MSRP/.test(f.slice(Math.max(0, m.index! - 90), m.index! + 20)), `${p.slug} FAQ: ${m[0]}`);
  }
  // nothing priced when the catalogue holds nothing: the MSRPs are the only figures
  for (const p of NEW) for (const m of text(html(p.build(ctx([], null)))).matchAll(MONEY)) assert.ok(MSRPS.has(m[0]), `${p.slug} (empty): ${m[0]}`);
});

test("release date and products: Wizards' dates, legality, contents and US MSRPs with their source; live prices in the visitor's market; the shock lands as the data holds them", () => {
  const b = starTrekReleaseDate.build(ctx([view()]));
  assert.deepEqual(b.sections.map((s) => s.id), ["dates", "set-codes", "products", "booster-fun", "prices", "which-to-buy"]);
  const out = html(b), t = text(out);
  assert.match(t, /Magic: The Gathering Star Trek releases on 13 November 2026 , 28 days from today|Magic: The Gathering Star Trek releases on 13 November 2026/);
  assert.match(t, /Prerelease events run from 6 to 12 November 2026, and the MTG Arena release is 10 November 2026, according to Wizards of the Coast/);
  assert.match(t, /Prerelease events, in stores 6 to 12 November 2026 MTG Arena release 10 November 2026 Tabletop release 13 November 2026/);
  assert.match(t, /Full preview season Not announced by Wizards as of 16 October 2026/);
  assert.match(t, /Wizards of the Coast's Collecting Star Trek article says that prerelease events run from 6 to 12 November 2026, and that the MTG Arena release is 10 November 2026/);
  assert.match(t, /TRK is legal in every format, Standard included|Legal in all formats, Standard included/);
  assert.match(t, /The Beginner Box was cancelled/);
  // the MSRP table: Wizards' eight figures, none for the Prerelease Pack, and the source with its date
  assert.match(t, /Play Booster US\$6\.99 a booster 14 Magic cards: 7 commons/);
  assert.match(t, /Collector's Edition Commander Deck \(four\) US\$159\.99 a deck/);
  assert.match(t, /Prerelease Pack None published 6 Play Boosters/);
  assert.match(t, /Wizards' suggested US prices from its Collecting Star Trek article of 14 July 2026 \(read 16 October 2026\)/);
  assert.match(out, /href="https:\/\/magic\.wizards\.com\/en\/news\/feature\/collecting-star-trek"/);
  assert.match(t, /US MSRPs run from US\$6\.99 for a Play Booster to US\$159\.99 for a Collector's Edition Commander Deck/);
  // live: the visitor's market only, cheapest listing first, TCGplayer-only rows said so
  assert.match(t, /We track 12 Star Trek products; 10 have a live pre-order in the United States today/);
  assert.match(t, /Star Trek - Play Booster Pack US\$5\.49 3 Star Trek Commander Deck - Klingon Fury US\$59\.99 TCGplayer only/);
  const au = text(html(starTrekReleaseDate.build(ctx([view()], TREK, "AU"))));
  assert.match(au, /2 Star Trek products with a live pre-order in Australia today, in AUD/);
  // the shock lands: the main set's printings in the data, with only the prices they have
  assert.match(t, /2 shock land printings from TRK are in our data so far/);
  assert.match(t, /Blood Crypt Non-foil TRK · 278 US\$14\.75 US\$15\.49/);
  assert.match(t, /Breeding Pool LCARS · Non-foil TRK · 401 — —/);
  assert.match(t, /Magic Presents: To Boldly Go, a season-long Sealed league in stores 13 November 2026 to 28 January 2027/);
  // every product line has its contents, and the contents name the lines Wizards prices
  for (const row of STAR_TREK.msrp!.rows) assert.ok(CONTENTS.some((c) => c.line === row.line), row.line);
  assert.equal(SEASON.arena, "2026-11-10");
  assert.ok(STAR_TREK.facts.some((f) => f.text.includes(longDateOf(SEASON.arena))), "the Arena date agrees with the registry's fact");
});

test("commander decks: Wizards' four names and contents, colours and themes as reported (attributed), each deck's live price, and the Commander set's cards as they are listed", () => {
  const b = starTrekCommanderDecks.build(ctx([view()]));
  assert.deepEqual(b.sections.map((s) => s.id), ["in-the-box", "decks", "federation-fleet", "landing-party", "klingon-fury", "we-are-the-borg", "commander-cards", "regular-or-collectors", "all-four", "upgrades"]);
  const out = html(b), t = text(out);
  assert.match(t, /Wizards of the Coast lists four Star Trek Commander decks: Federation Fleet, Landing Party, Klingon Fury and We Are the Borg/);
  assert.match(t, /Wizards' US MSRP is US\$74\.99 a deck and US\$159\.99 for a Collector's Edition/);
  assert.match(t, /In the United States the cheapest regular deck we track today is Klingon Fury at US\$59\.99 \(TCGplayer's lowest listing\)/);
  assert.match(t, /Federation Fleet Jeskai \(white, blue and red\) starships and card draw, from the Picard and Janeway eras US\$64\.99 US\$189\.99/);
  assert.match(t, /We Are the Borg Esper \(white, blue and black\) artifact creatures, built around the new assimilate mechanic US\$68\.49 No listing yet/);
  assert.match(t, /Landing Party Bant \(green, white and blue\) landfall and away-team exploration, from the original series US\$62\.99 Not in our data yet/);
  assert.match(t, /The colours and themes are what fan trackers report \( playgroup\.gg's Star Trek tracker , read 16 October 2026\)/);
  assert.match(t, /Its face commander and decklist are not public yet/);
  assert.doesNotMatch(t, /led by|face commander is (?!not)/i, "no face commander is named");
  assert.match(t, /Bought separately at today's cheapest in the United States, the four regular decks come to US\$256\.46/);
  assert.match(t, /the listing does not say how many decks it holds/);
  // the TRC cards in the data, and the two revealed TRC legends named from Scryfall with their name page only when the data has the card
  assert.match(t, /1 TRC card is in our data so far/);
  assert.match(out, /href="\/cards\/name\/captain-kirk-boldly-going"/);
  assert.match(out, /<em>Borg Queen, Perfection Manifest<\/em>/, "not in the data: named, not linked");
  for (const [i, p] of PRECONS.entries()) assert.equal(p.name, DECKS[i]);
  // nothing in the catalogue yet: the four decks are still there, said as not in our data
  const empty = text(html(starTrekCommanderDecks.build(ctx([], null))));
  assert.match(empty, /No Star Trek Commander deck is in our catalogue yet/);
  assert.match(empty, /Federation Fleet Jeskai[^]*Not in our data yet Not in our data yet/);
  assert.match(empty, /No Commander: Star Trek singles are in our data yet/);
});

test("mechanics: Wizards' descriptions and Scryfall's card text quoted word for word, links only where the data has the page", () => {
  const b = starTrekMechanics.build(ctx([view()]));
  assert.deepEqual(b.sections.map((s) => s.id), ["summary", "assimilate", "federation", "face-a-dilemma", "station", "together", "more"]);
  const out = html(b), t = text(out);
  for (const q of Object.values(WIZARDS_SAYS)) assert.ok(t.includes(q.replace(/[“”]/g, '"')) || t.includes(q), q.slice(0, 40));
  for (const name of ["Borg Queen, Perfection Manifest", "Seven of Nine", "Hoshi Sato, Exolinguist", "Saavik, Stoic Student", "U.S.S. Enterprise-D, Galaxy-Class", "Set Phasers to . . .", "Consider the Prime Directive"] as const) {
    assert.ok(t.includes(SCRYFALL_TEXT[name]!), `${name}'s text is quoted as Scryfall prints it`);
  }
  // the reminder texts the pack could not confirm, as the cards print them
  assert.match(SCRYFALL_TEXT["Borg Queen, Perfection Manifest"]!, /\(Put it onto the battlefield under your control with a \+1\/\+1 counter\. It's a Borg artifact creature and loses all other creature types\.\)/);
  assert.match(SCRYFALL_TEXT["Seven of Nine"]!, /^Whenever you face a dilemma, draw a card\. \(You face a dilemma as you choose one or more modes for a spell or ability\.\)$/);
  assert.match(SCRYFALL_TEXT["U.S.S. Enterprise-D, Galaxy-Class"]!, /^Station \(Tap another creature you control: Put charge counters equal to its power on this Spacecraft\./);
  assert.match(t, /Only your own choices count for Seven of Nine/);
  // links: a name page only for a card the data has, a keyword page only where one exists
  assert.match(out, /href="\/cards\/name\/seven-of-nine"/);
  assert.match(out, /<em>Borg Queen, Perfection Manifest<\/em>/);
  assert.match(out, /href="\/keywords\/face-a-dilemma"/);
  assert.match(out, /href="\/keywords\/station"/);
  assert.doesNotMatch(out, /href="\/keywords\/assimilate"/, "no card with assimilate in this data: no link to a page that would 404");
  assert.doesNotMatch(out, /href="\/keywords\/federation"/, "an ability word has no keyword page");
  assert.match(t, /33 cards in our data have station/);
  // every named card the posts may link is in the lookup list the context resolves
  for (const n of ["Seven of Nine", "Borg Queen, Perfection Manifest", "Captain Kirk, Boldly Going"]) assert.ok((NAMED_CARDS as readonly string[]).includes(n), n);
  assert.equal(SHOCK_LANDS.length, 10);
});

test("nothing in the catalogue yet, a section that could not be read, and release day: every post builds and says so", () => {
  for (const p of NEW) for (const c of [ctx([], null), ctx([view({ sets: [], sealed: [], cards: [] })], null), ctx([view()], null)]) {
    const b = p.build(c);
    assert.ok(b.lede && b.sections.every((s) => s.id && s.title), p.slug);
    assert.ok(b.heroCards.length <= 3, p.slug);
  }
  assert.deepEqual(starTrekReleaseDate.build(ctx([], null)).heroCards, []);
  const none = text(html(starTrekReleaseDate.build(ctx([], null))));
  assert.match(none, /No Star Trek product is in our catalogue yet/);
  assert.match(none, /The shock land prices could not be read just now/);
  assert.match(none, /No store we track in the United States lists a Star Trek pre-order yet/);
  assert.match(text(html(starTrekReleaseDate.build(ctx([view()], { ...TREK, shocks: [] })))), /None of the Star Trek shock lands is in our data yet/);
  const mech = html(starTrekMechanics.build(ctx([], null)));
  assert.doesNotMatch(mech, /href="\/(?:cards\/name|keywords)\//, "no lookups: names and mechanics in plain text");
  // release day
  const out = text(html(starTrekReleaseDate.build(ctx([view({ out: true })]))));
  assert.match(out, /Magic: The Gathering Star Trek released on 13 November 2026/);
  assert.match(out, /Star Trek prices in the United States today/);
  assert.doesNotMatch(out, /pre-order prices in/);
  assert.match(text(html(starTrekCommanderDecks.build(ctx([view({ out: true })])))), /They released with the set on 13 November 2026/);
});

test("the products of the catalogue fall under Wizards' lines, and each deck finds its regular and Collector's Edition product", () => {
  assert.equal(lineOf(STAR_TREK, "Star Trek - Play Booster Pack")?.name, "Play Booster");
  const decks = deckProducts(PRODUCTS);
  assert.deepEqual(decks.map((d) => [d.name, d.deck?.id ?? null, d.collectors?.id ?? null]), [["Federation Fleet", 10, 14], ["Landing Party", 11, null], ["Klingon Fury", 12, null], ["We Are the Borg", 13, 15]]);
  const extra = deckProducts([...PRODUCTS, sealed(20, "Star Trek Commander Deck - A Fifth Deck", "Commander Deck", TRC.id)]);
  assert.deepEqual(extra.map((d) => d.name), [...DECKS, "A Fifth Deck"], "a deck the catalogue holds beyond Wizards' four is listed too");
});
