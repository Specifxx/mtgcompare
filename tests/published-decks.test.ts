import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DECK_DAILY_LIMIT,
  DECK_MAX_UNMATCHED,
  DEFAULT_PUBLISH_FORMAT,
  PUBLISHED_DECKS_TAG,
  PUBLISH_FORMATS,
  changeSincePublished,
  checkPublishText,
  commanderDeckPath,
  deckShapeError,
  deckSlug,
  deckTotals,
  inPriceBand,
  isPublishFormat,
  massEntry,
} from "../src/lib/published-decks";
import { prepareDeckWith, publishDeck, publishError, publishesToday, type PreparedDeck } from "../src/lib/published-decks-server";
import { checkDeck } from "../src/lib/commander-rules";
import { parseDeckList } from "../src/lib/deck";
import { pricedCard } from "../src/lib/deck-price";
import { DECKS, REAL_PRINTINGS, entriesFor, fixtureDeckData, realCard } from "./helpers/deck-watch-harness";

// ─────────────────────────────────────────────────────────────────────────────
// The public deck library (RiftCompare's tests/public-decks.test.ts, for MTG
// Compare): the pure rules (a Commander-style deck that obeys its format), the
// publish route's spam protections and the pages' egress shape. The decks are
// real: Atraxa, Praetors' Voice with 99 cards, and the Thrasios + Tymna
// partner pair, resolved by the real resolver over the real printings,
// facts and prices of tests/helpers/deck-watch-harness.ts.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(p, "utf8");
const priced = (us: number | null, au: number | null = null) => ({ low: { US: us, AU: au } });
const data = fixtureDeckData();
const lowOf = (name: string) => REAL_PRINTINGS[name]![4]![1]!;

test("deck totals sum qty x each market's cheapest price, null when any card is unpriced there", () => {
  const t = deckTotals([
    { qty: 3, card: priced(199, 280) },
    { qty: 1, card: priced(1749, null) },
  ]);
  assert.equal(t.US, 3 * 199 + 1749);
  assert.equal(t.AU, null, "one card has no AU price: never a partial sum");
  assert.equal(deckTotals([]).US, null);
  assert.equal(deckTotals([{ qty: 1, card: undefined }]).US, null);
  assert.equal(deckTotals([{ qty: 2, card: { low: { US: null }, usd: 187 } }]).US, 374, "the US also counts the unit's TCGplayer price when no listing is tracked for it");
  assert.equal(deckTotals([{ qty: 2, card: { low: { AU: null }, usd: 187 } }]).AU, null, "other markets do not");
});

test("price bands: under $50, under $100, $200+; unpriced decks only in 'any'", () => {
  assert.ok(inPriceBand(4999, "u50") && !inPriceBand(5000, "u50"));
  assert.ok(inPriceBand(9999, "u100") && !inPriceBand(10000, "u100"));
  assert.ok(inPriceBand(20000, "200plus") && !inPriceBand(19999, "200plus"));
  assert.ok(inPriceBand(null, "all") && !inPriceBand(null, "u50"));
});

test("change since publish", () => {
  assert.equal(changeSincePublished(10000, 11050), 10.5);
  assert.equal(changeSincePublished(null, 100), null);
  assert.equal(changeSincePublished(0, 100), null);
});

test("Mass Entry is one 'qty Name [SET]' per line, the set code TCGplayer reads for Magic", () => {
  assert.equal(massEntry([{ qty: 4, name: "Lightning Bolt", setCode: "m11" }, { qty: 1, name: "Sol Ring" }, { qty: 1, name: "Fire // Ice", setCode: null }]), "4 Lightning Bolt [M11]\n1 Sol Ring\n1 Fire // Ice");
});

test("slugs: readable title plus an id suffix; a commander's library page is filed under its Oracle slug", () => {
  assert.equal(deckSlug("Atraxa Superfriends!", "abc123ff"), "atraxa-superfriends-c123ff");
  assert.equal(deckSlug("!!!", "abc123ff"), "deck-c123ff");
  assert.equal(commanderDeckPath("atraxa-praetors-voice"), "/decks/commander/atraxa-praetors-voice");
  assert.equal(PUBLISHED_DECKS_TAG, "published-decks");
});

test("the formats a deck is published in: the ones that lead with a commander and whose rules are confirmed", () => {
  assert.deepEqual([...PUBLISH_FORMATS].sort(), ["brawl", "commander", "duel", "oathbreaker", "paupercommander", "predh", "standardbrawl"]);
  assert.equal(DEFAULT_PUBLISH_FORMAT, "commander");
  for (const f of ["modern", "pauper", "competitivebrawl", "gladiator", "oldschool", "", null, undefined]) assert.equal(isPublishFormat(f), false, String(f));
});

test("the deck shape: a Commander-style format, at most three unmatched lines, a report with no error", () => {
  const ok = checkDeck("commander", entriesFor(DECKS.atraxa));
  assert.equal(deckShapeError({ format: "commander", report: ok, unmatched: 0 }), null);
  assert.equal(DECK_MAX_UNMATCHED, 3);
  assert.equal(deckShapeError({ format: "commander", report: ok, unmatched: 3 }), null);
  assert.match(deckShapeError({ format: "commander", report: ok, unmatched: 4 }) ?? "", /4 lines didn't match a card/);
  assert.match(deckShapeError({ format: "modern", report: ok, unmatched: 0 }) ?? "", /Commander-style format: Commander, Duel Commander, PreDH, Pauper Commander, Brawl, Standard Brawl, Oathbreaker/);
  assert.match(deckShapeError({ format: null, report: ok, unmatched: 0 }) ?? "", /Commander-style format/);
  assert.match(deckShapeError({ format: "commander", report: null, unmatched: 0 }) ?? "", /couldn't be checked/);
  const bad = checkDeck("commander", entriesFor(DECKS.atraxa.replace("7 Swamp", "6 Swamp\n1 Lightning Bolt")));
  assert.equal(deckShapeError({ format: "commander", report: bad, unmatched: 0 }), "Outside the commander's colour identity: Lightning Bolt.", "the first error of the report");
});

test("spam protection on title and description", () => {
  assert.equal(checkPublishText("Hi", "").ok, false);
  assert.equal(checkPublishText("Great deck", "buy at cheapcards.com now").ok, false);
  assert.equal(checkPublishText("Great deck", "see https://x.y").ok, false);
  assert.equal(checkPublishText("BUY MY CARDS NOW", "").ok, false);
  assert.equal(checkPublishText("Great deck", "aaaaaaaaaaaaaaa").ok, false);
  assert.equal(checkPublishText("x".repeat(81), "").ok, false);
  assert.equal(checkPublishText("Great deck", "x ".repeat(600)).ok, false, "a description over 1000 characters");
  assert.deepEqual(checkPublishText("  Atraxa  Counters ", "  Proliferate everything. "), { ok: true, title: "Atraxa Counters", description: "Proliferate everything." });
});

// ── a prepared deck ──

const ATRAXA_LINES = parseDeckList(DECKS.atraxa);
const atraxaTotal = ATRAXA_LINES.reduce((n, l) => n + l.qty * lowOf(l.name), 0);

test("a prepared Commander deck: the commander found, the 99 resolved, the identity and the report read from the facts, the total from the real lows", async () => {
  const d = await prepareDeckWith(DECKS.atraxa, data);
  assert.equal(d.format, "commander");
  assert.deepEqual(d.commander, { cardId: 484652, name: "Atraxa, Praetors' Voice", slug: "atraxa-praetors-voice" });
  assert.equal(d.partner, null);
  assert.equal(d.identity, 23, "white, blue, black, green");
  assert.equal(d.cardCount, 100, "the commander counts toward the 100");
  assert.equal(d.lines.length, ATRAXA_LINES.length, "one line per printing");
  assert.equal(d.lines[0]!.cardId, 484652, "the commander leads the stored lines");
  assert.equal(d.cardIds.length, new Set(d.cardIds).size, "distinct product ids");
  assert.deepEqual(d.unmatched, []);
  assert.equal(d.report!.ok, true);
  assert.equal(publishError(d), null);
  assert.equal(d.totals.US, atraxaTotal, "each market's cheapest price, Normal units");
  assert.equal(d.totals.AU, null, "no AU price anywhere: no partial total");
  assert.ok(d.list.startsWith("Commander\n1 Atraxa, Praetors' Voice (MUL) 33\n\nDeck\n"), "the canonical list, sections and all");
  const again = await prepareDeckWith(d.list, data);
  assert.deepEqual(again.lines, d.lines, "the canonical list reads back to the same units");
  assert.equal(again.list, d.list);
});

test("a prepared deck keeps finishes: a Foil copy is a unit of its own (finish 1), priced at its own low", async () => {
  const text = DECKS.atraxa.replace("1 Atraxa, Praetors' Voice", "1 Atraxa, Praetors' Voice (MUL) 33 *F*");
  const d = await prepareDeckWith(text, data);
  assert.deepEqual(d.lines[0], { cardId: 484652, qty: 1, finish: 1 });
  assert.ok(d.lines.slice(1).every((l) => l.finish === undefined), "Normal units carry no finish");
  assert.equal(d.totals.US, atraxaTotal - REAL_PRINTINGS["Atraxa, Praetors' Voice"]![4]![1]! + REAL_PRINTINGS["Atraxa, Praetors' Voice"]![5]![1]!, "the Foil low of the commander");
  assert.ok(d.list.includes("1 Atraxa, Praetors' Voice (MUL) 33 *F*"));
  assert.equal(realCard("Atraxa, Praetors' Voice", "F").marketUsd, REAL_PRINTINGS["Atraxa, Praetors' Voice"]![5]![0]);
});

test("a commander filed in the sideboard (an MTGO or Moxfield export) is found there and moved to the Commander section of the stored list", async () => {
  const list = `${DECKS.atraxa.replace("Commander\n1 Atraxa, Praetors' Voice\n\nDeck\n", "")}\n\nSideboard\n1 Atraxa, Praetors' Voice`;
  const d = await prepareDeckWith(list, data);
  assert.equal(d.commander!.name, "Atraxa, Praetors' Voice");
  assert.equal(publishError(d), null);
  assert.ok(d.list.startsWith("Commander\n1 Atraxa, Praetors' Voice (MUL) 33"));
  assert.equal(d.cardCount, 100);
});

const PARTNERS = `Commander\n1 Thrasios, Triton Hero\n1 Tymna the Weaver\n\nDeck\n${DECKS.atraxa.replace(/^Commander\n1 Atraxa, Praetors' Voice\n\nDeck\n/, "").replace("7 Swamp", "6 Swamp")}`;

test("a partner pair: the first is the commander, the second the partner, the identity is both, and the oracle text is what pairs them", async () => {
  const d = await prepareDeckWith(PARTNERS, data);
  assert.deepEqual(d.commander, { cardId: 632702, name: "Thrasios, Triton Hero", slug: "thrasios-triton-hero" });
  assert.deepEqual(d.partner, { cardId: 632197, name: "Tymna the Weaver" });
  assert.equal(d.identity, 23);
  assert.equal(d.cardCount, 100);
  assert.equal(publishError(d), null);
  const stranger = await prepareDeckWith(PARTNERS.replace("1 Tymna the Weaver", "1 Atraxa, Praetors' Voice"), data);
  assert.match(publishError(stranger) ?? "", /can't be commanders together/);
});

test("publishError: a card outside the colours, a banned card, a second copy, a short list, no commander and too many unmatched lines are refused with the reason", async () => {
  const prep = (text: string, format?: "commander" | "duel") => prepareDeckWith(text, data, { format });
  assert.equal(publishError(await prep(DECKS.atraxa.replace("7 Swamp", "6 Swamp\n1 Lightning Bolt"))), "Outside the commander's colour identity: Lightning Bolt.");
  assert.equal(publishError(await prep(DECKS.atraxa.replace("7 Swamp", "6 Swamp\n1 Mana Crypt"))), "Banned in Commander: Mana Crypt.");
  assert.match(publishError(await prep(DECKS.atraxa.replace("7 Swamp", "6 Swamp\n1 Sol Ring"))) ?? "", /singleton format: one copy of each card, except basic lands: Sol Ring \(2\)/);
  assert.match(publishError(await prep(DECKS.atraxa.replace("7 Swamp", "6 Swamp"))) ?? "", /exactly 100 cards, the commander included \(this list has 99\)/);
  assert.match(publishError(await prep(DECKS.atraxa.replace("Commander\n1 Atraxa, Praetors' Voice\n\nDeck\n", "1 Atraxa, Praetors' Voice\n"))) ?? "", /Add your commander/);
  const junk = await prep(DECKS.atraxa.replace("7 Swamp", "3 Swamp\n1 zzz one\n1 zzz two\n1 zzz three\n1 zzz four"));
  assert.equal(junk.unmatched.length, 4);
  assert.match(publishError(junk) ?? "", /4 lines didn't match a card/);
  assert.match(publishError(await prepareDeckWith(DECKS.modern, data) as PreparedDeck) ?? "", /./, "a Modern list is no Commander deck");
});

// ── publishing ──

interface Created { data: Record<string, unknown> }
function fakeDb(opts: { existing?: boolean; today?: number } = {}) {
  const created: Created[] = [], asked: unknown[] = [];
  const db = {
    publishedDeck: {
      findFirst: async (a: unknown) => { asked.push(a); return opts.existing ? { slug: "atraxa-aaaaaa" } : null; },
      create: async (a: Created) => { created.push(a); },
      count: async () => opts.today ?? 0,
    },
  } as unknown as Parameters<typeof publishDeck>[1];
  return { db, created, asked };
}
const input = (text: string, over: Partial<Parameters<typeof publishDeck>[0]> = {}) => ({ title: "Atraxa counters", description: "Proliferate everything.", text, userId: "u1", authorName: "Bill", source: "user" as const, ...over });

test("publishDeck stores the commander by product id and Oracle slug, the identity, the canonical list, the units and the day's total, and returns the commander's page", async () => {
  const { db, created } = fakeDb();
  const res = await publishDeck(input(DECKS.atraxa), db, data);
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.commanderSlug, "atraxa-praetors-voice");
  assert.match(res.slug, /^atraxa-counters-[0-9a-f]{6}$/);
  assert.equal(created.length, 1);
  const row = created[0]!.data;
  assert.equal(row.slug, res.slug);
  assert.equal(row.userId, "u1");
  assert.equal(row.authorName, "Bill");
  assert.equal(row.format, "commander");
  assert.equal(row.commanderCardId, 484652);
  assert.equal(row.commanderName, "Atraxa, Praetors' Voice");
  assert.equal(row.commanderSlug, "atraxa-praetors-voice");
  assert.equal(row.partnerCardId, null);
  assert.equal(row.partnerName, null);
  assert.equal(row.identity, 23);
  assert.equal(row.cardCount, 100);
  assert.equal(row.source, "user");
  assert.equal((row.cardIds as number[]).length, ATRAXA_LINES.length);
  assert.deepEqual((row.lines as { cardId: number; qty: number }[])[0], { cardId: 484652, qty: 1 });
  assert.equal(((row.publishedTotals as { US: number }).US), atraxaTotal);
  assert.ok((row.list as string).startsWith("Commander\n1 Atraxa, Praetors' Voice (MUL) 33"));
  assert.equal("userId" in row && "status" in row, false, "status is the database default ('live')");
});

test("publishDeck: a partner pair is stored as commander and partner; an admin import has no user and is not deduplicated", async () => {
  const { db, created, asked } = fakeDb();
  const res = await publishDeck(input(PARTNERS, { userId: null, authorName: "Player, Event", source: "import" }), db, data);
  assert.equal(res.ok, true);
  const row = created[0]!.data;
  assert.deepEqual([row.commanderCardId, row.partnerCardId, row.partnerName, row.identity, row.source, row.userId], [632702, 632197, "Tymna the Weaver", 23, "import", null]);
  assert.equal(asked.length, 0, "no duplicate lookup without a user");
});

test("publishDeck never writes a refused deck: a rule broken, a duplicate list by the same user, a format that is not Commander-style", async () => {
  const bolt = fakeDb();
  const refused = await publishDeck(input(DECKS.atraxa.replace("7 Swamp", "6 Swamp\n1 Lightning Bolt")), bolt.db, data);
  assert.deepEqual(refused, { ok: false, error: "Outside the commander's colour identity: Lightning Bolt." });
  const dup = fakeDb({ existing: true });
  assert.deepEqual(await publishDeck(input(DECKS.atraxa), dup.db, data), { ok: false, error: "You've already published this exact list." });
  const modern = fakeDb();
  const res = await publishDeck(input(DECKS.modern, { format: "modern" }), modern.db, data);
  assert.equal(res.ok, false);
  assert.match((res as { error: string }).error, /Commander-style format/);
  const noText = fakeDb();
  assert.equal((await publishDeck(input(""), noText.db, data)).ok, false);
  assert.equal(bolt.created.length + dup.created.length + modern.created.length + noText.created.length, 0);
});

test("publishDeck judges the list by the format the player chose: Sol Ring is banned in Duel Commander, and Standard Brawl is 60 cards", async () => {
  const duel = fakeDb();
  const refusal = await publishDeck(input(DECKS.atraxa, { format: "duel" }), duel.db, data);
  assert.equal(refusal.ok, false);
  assert.match((refusal as { error: string }).error, /^Banned in Duel Commander: .*Sol Ring/);
  assert.equal(duel.created.length, 0);
  const brawl = fakeDb();
  const res = await publishDeck(input(DECKS.atraxa, { format: "standardbrawl" }), brawl.db, data);
  assert.equal(res.ok, false);
  assert.match((res as { error: string }).error, /exactly 60 cards/);
});

test("publishesToday is counted in the database, by account, over the last 24 hours", async () => {
  const asked: { where: { userId: string; createdAt: { gte: Date } } }[] = [];
  const db = { publishedDeck: { count: async (a: (typeof asked)[number]) => { asked.push(a); return 3; } } } as unknown as Parameters<typeof publishesToday>[1];
  assert.equal(await publishesToday("u1", db), 3);
  assert.equal(asked[0]!.where.userId, "u1");
  assert.ok(Math.abs(Date.now() - 86_400_000 - asked[0]!.where.createdAt.gte.getTime()) < 5_000);
});

test("pricedCard is what a deck total needs of a unit: its lows per market and its TCGplayer figure", () => {
  const c = realCard("Sol Ring");
  assert.deepEqual(pricedCard(c), { low: c.low, usd: lowOf("Sol Ring") });
  assert.equal(pricedCard(realCard("Atraxa, Praetors' Voice", "F")).usd, REAL_PRINTINGS["Atraxa, Praetors' Voice"]![5]![1]);
});

// ── the library loaders (src/lib/data/decks.ts): Neon-backed, cached, a failed read throws ──

test("the library loaders: live decks only, newest first, capped, one select; a deck's lines are read defensively; a failed read throws and is never an empty library", async () => {
  const cacheKey = require.resolve("next/cache"), dbKey = require.resolve("../src/lib/db"), decksKey = require.resolve("../src/lib/data/decks");
  const savedCache = require.cache[cacheKey], savedDb = require.cache[dbKey], savedDecks = require.cache[decksKey];
  delete require.cache[decksKey]; // loaded once already through the data barrel, with the real cache: load it again against the stand-ins
  const wrapped: { keys: string[]; opts: { tags: string[]; revalidate: number } }[] = [];
  const calls: { m: string; args: Record<string, unknown> }[] = [];
  let fail = false;
  const stored = { id: "d1", slug: "atraxa-aaaaaa", title: "Atraxa counters", authorName: null, commanderName: "Atraxa, Praetors' Voice", commanderSlug: "atraxa-praetors-voice", commanderCardId: 484652, partnerCardId: null, identity: 23, lines: [{ cardId: 484652, qty: 1, finish: 1 }, { cardId: 719218, qty: 1 }, { cardId: -4, qty: 1 }, { cardId: 5, qty: 0 }, "junk", null], cardCount: 100, publishedTotals: { US: 47981 }, createdAt: new Date("2026-10-07T12:00:00Z") };
  const rows = (m: string) => async (args: Record<string, unknown>) => { calls.push({ m, args }); if (fail) throw new Error("neon is down"); return m === "findMany" ? [stored] : { ...stored, format: "commander", partnerName: null, description: "Proliferate.", list: "Commander\n1 Atraxa, Praetors' Voice (MUL) 33" }; };
  require.cache[cacheKey] = { id: cacheKey, filename: cacheKey, loaded: true, exports: { unstable_cache: (fn: unknown, keys: string[], opts: never) => { wrapped.push({ keys, opts }); return fn; }, revalidateTag: () => undefined } } as never;
  require.cache[dbKey] = { id: dbKey, filename: dbKey, loaded: true, exports: { prisma: { publishedDeck: { findMany: rows("findMany"), findFirst: rows("findFirst") } } } } as never;
  try {
    const decks = await import("../src/lib/data/decks");
    const lib = await decks.getLibraryDecks();
    assert.equal(lib.length, 1);
    assert.deepEqual(lib[0]!.lines, [{ cardId: 484652, qty: 1, finish: "F" }, { cardId: 719218, qty: 1 }], "bad entries dropped, finish 1 is the Foil unit");
    assert.equal(lib[0]!.createdAt, "2026-10-07T12:00:00.000Z");
    assert.deepEqual(lib[0]!.publishedTotals, { US: 47981 });
    assert.equal(decks.LIBRARY_DECKS_MAX, 200);
    const q = calls[0]!.args as { where: unknown; orderBy: unknown; take: number; select: Record<string, boolean> };
    assert.deepEqual([q.where, q.orderBy, q.take], [{ status: "live" }, { createdAt: "desc" }, 200]);
    assert.equal(q.select.list, undefined, "the library row carries no list text");
    const page = await decks.getPublishedDeck("atraxa-aaaaaa");
    assert.deepEqual([page!.format, page!.description, page!.partnerName, page!.list.split("\n")[0]], ["commander", "Proliferate.", null, "Commander"]);
    assert.deepEqual((calls[1]!.args as { where: unknown }).where, { slug: "atraxa-aaaaaa", status: "live" });
    await decks.getDecksUsingCard(719218);
    assert.equal(wrapped.length, 3, "three cached loaders");
    assert.ok(wrapped.every((w) => w.opts.tags.join() === "published-decks" && w.opts.revalidate === 21_600));
    fail = true;
    await assert.rejects(decks.getLibraryDecks(), /neon is down/, "THROWS inside the cache: a failed read is never stored as an empty library");
    assert.deepEqual(decks.deckLinesOf("not an array"), []);
    assert.deepEqual(decks.deckRowOf({ ...stored, publishedTotals: [1] } as never).publishedTotals, {}, "a malformed totals value is an empty object");
  } finally {
    if (savedCache) require.cache[cacheKey] = savedCache; else delete require.cache[cacheKey];
    if (savedDb) require.cache[dbKey] = savedDb; else delete require.cache[dbKey];
    if (savedDecks) require.cache[decksKey] = savedDecks; else delete require.cache[decksKey];
  }
});

// ── what the files promise ──

test("publishing: signed-in only, DB daily cap, burst limit, honeypot, on-demand revalidation", () => {
  const api = read("src/app/api/decks/route.ts");
  assert.match(api, /if \(!user\) return NextResponse\.json\(\{ error: "Sign in to publish a deck\." \}, \{ status: 401 \}\)/);
  assert.match(api, /rateLimit\(`deck-publish:\$\{user\.id\}`, 3, 10 \* 60_000\)/);
  assert.match(api, /body\?\.website/);
  assert.match(api, /revalidateTag\(PUBLISHED_DECKS_TAG\)/);
  assert.match(api, /revalidatePath\("\/decks"\)/);
  assert.match(api, /revalidatePath\(commanderDeckPath\(res\.commanderSlug\)\)/);
  assert.equal(DECK_DAILY_LIMIT, 10);
  const srv = read("src/lib/published-decks-server.ts");
  assert.match(srv, /publishedDeck\.count\(/);
  const admin = read("src/app/api/admin/decks/route.ts");
  assert.match(admin, /requireAdminApi\(req, \{ mutation: true \}\)/);
  assert.match(admin, /adminLog\(/);
});

test("the deck engine reads the published files and Neon's deck rows only: no catalogue in memory, no database in a page", () => {
  for (const f of ["src/lib/deck.ts", "src/lib/deck-price.ts", "src/lib/commander-rules.ts", "src/lib/published-decks.ts", "src/lib/deck-watch-pure.ts"]) {
    const src = read(f).replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(src, /from "\.\/db"|from "@\/lib\/db"|@prisma\/client/, `${f} touches no database`);
    assert.doesNotMatch(src, /getCatalog\b|indexCards|deckIndex/, `${f} holds no catalogue`);
  }
  for (const f of ["src/lib/deck.ts", "src/lib/commander-rules.ts", "src/lib/published-decks.ts", "src/lib/deck-watch-pure.ts"]) {
    assert.doesNotMatch(read(f), /from "\.\/data"|from "@\/lib\/data/, `${f} is client-safe: no data layer`);
  }
  const lib = read("src/lib/data/decks.ts");
  assert.match(lib, /status: "live"/);
  assert.doesNotMatch(lib.replace(/\/\/.*$/gm, ""), /catch\s*\(/, "no try/catch inside the cached callbacks: a failed read throws");
});

test("deck pages: ISR, no build-time prewarming, SEO title, JSON-LD, noindex when empty", () => {
  for (const f of ["src/app/decks/page.tsx", "src/app/decks/[slug]/page.tsx", "src/app/decks/commander/[commander]/page.tsx"]) {
    const s = read(f);
    assert.match(s, /export const revalidate = 3600;/, f);
    // An EMPTY generateStaticParams is what makes a dynamic segment ISR; one
    // that returns params would prewarm database-backed pages at build.
    const gsp = /export async function generateStaticParams\(\) \{([\s\S]*?)\n\}/.exec(s);
    if (gsp) assert.match(gsp[1]!, /^\s*return \[\];\s*$/, f);
    assert.doesNotMatch(s, /from "@\/lib\/db"/, `${f} reads through data loaders`);
  }
  const page = read("src/app/decks/[slug]/page.tsx");
  assert.match(page, /deck — \$\{cost \? `\$\{cost\} to build` : deck\.title\} \| MTG Compare/);
  assert.match(page, /"@type": "CreativeWork"/);
  assert.match(read("src/app/decks/page.tsx"), /robots|noindex/i, "an empty library is noindexed");
  assert.match(read("src/app/sitemap.ts"), /\/decks\/\$\{d\.slug\}/);
});

test("/deck opens on the tool: the builder comes before the explanatory text", () => {
  const s = read("src/app/deck/page.tsx");
  assert.ok(s.indexOf("<HubIntro") > s.indexOf("<DeckBuilder"));
});
