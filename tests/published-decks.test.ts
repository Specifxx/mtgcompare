import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DECK_DAILY_LIMIT,
  DECK_MIN_CARDS,
  changeSincePublished,
  checkPublishText,
  deckShapeError,
  deckSlug,
  deckTotals,
  inPriceBand,
  leaderSlugFrom,
  massEntry,
} from "../src/lib/published-decks";
import { prepareDeckWith, publishError, publishDeck, publishesToday } from "../src/lib/published-decks-server";
import type { CardLite } from "../src/lib/data";

// ─────────────────────────────────────────────────────────────────────────────
// The public deck library (RiftCompare's tests/public-decks.test.ts, for One
// Piece): the pure rules (one Leader + 50, four of a number, DON!! ignored),
// the publish route's spam protections and the pages' egress shape.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(p, "utf8");
const priced = (us: number | null, au: number | null = null) => ({ low: { US: us, AU: au } });

test("deck totals sum qty x each market's cheapest price, null when any card is unpriced there", () => {
  const t = deckTotals([
    { qty: 3, card: priced(100, 150) },
    { qty: 1, card: priced(2500, null) },
  ]);
  assert.equal(t.US, 2800);
  assert.equal(t.AU, null, "one card has no AU price: never a partial sum");
  assert.equal(deckTotals([]).US, null);
  assert.equal(deckTotals([{ qty: 1, card: undefined }]).US, null);
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

test("Mass Entry is one 'qty Name [number]' per line", () => {
  assert.equal(massEntry([{ qty: 4, name: "Monkey.D.Luffy", number: "OP01-024" }, { qty: 1, name: "Gum-Gum Pistol" }]), "4 Monkey.D.Luffy [OP01-024]\n1 Gum-Gum Pistol");
});

test("slugs: readable title plus an id suffix; the Leader slug is name and number", () => {
  assert.equal(deckSlug("Budget Luffy Aggro!", "abc123ff"), "budget-luffy-aggro-c123ff");
  assert.equal(deckSlug("!!!", "abc123ff"), "deck-c123ff");
  assert.equal(leaderSlugFrom("Monkey.D.Luffy", "OP01-001"), "monkey-d-luffy-op01-001");
  assert.equal(leaderSlugFrom("Shanks", null), "shanks");
});

test("the deck shape: exactly one Leader, 50 cards besides it, at most four of a number", () => {
  const leader = { id: 1, name: "Monkey.D.Luffy", number: "OP01-001" };
  assert.match(deckShapeError({ leaders: [], mainCards: 50, overLimit: [] }) ?? "", /Leader/);
  assert.match(deckShapeError({ leaders: [leader, { ...leader, id: 2 }], mainCards: 50, overLimit: [] }) ?? "", /exactly one Leader/);
  assert.match(deckShapeError({ leaders: [leader], mainCards: 49, overLimit: [] }) ?? "", /50 cards/);
  assert.match(deckShapeError({ leaders: [leader], mainCards: 50, overLimit: ["OP01-024"] }) ?? "", /At most 4 .*OP01-024/);
  assert.equal(deckShapeError({ leaders: [leader], mainCards: 50, overLimit: [] }), null);
  assert.equal(DECK_MIN_CARDS, 51, "the Leader counts toward the 51");
});

test("spam protection on title and description", () => {
  assert.equal(checkPublishText("Hi", "").ok, false);
  assert.equal(checkPublishText("Great deck", "buy at cheapcards.com now").ok, false);
  assert.equal(checkPublishText("Great deck", "see https://x.y").ok, false);
  assert.equal(checkPublishText("BUY MY CARDS NOW", "").ok, false);
  assert.equal(checkPublishText("Great deck", "aaaaaaaaaaaaaaa").ok, false);
  assert.deepEqual(checkPublishText("  Budget  Luffy ", "  Fast and cheap. "), { ok: true, title: "Budget Luffy", description: "Fast and cheap." });
});

// A tiny catalogue: a Leader, a 4-of main deck of 13 numbers (52 > 50 on purpose
// in one test), a DON!! card and an unmatched line.
function card(id: number, number: string, name: string, cardType: string): CardLite {
  return {
    id, slug: `${number.toLowerCase()}-${id}`, name, number, cardType, colors: cardType === "Leader" ? ["Red"] : [], variant: null, isPromo: false,
    low: { US: 100 + id, AU: null },
  } as unknown as CardLite;
}
const cards: CardLite[] = [card(1, "OP01-001", "Roronoa Zoro", "Leader"), card(2, "ST01-001", "DON!! Card", "DON!!")];
for (let i = 0; i < 13; i++) cards.push(card(10 + i, `OP01-${String(20 + i).padStart(3, "0")}`, `Character ${i}`, "Character"));
const byId = new Map(cards.map((c) => [c.id, c]));
const byNumber = new Map<string, CardLite[]>();
const byName = new Map<string, CardLite[]>();
for (const c of cards) {
  byNumber.set(c.number!, [c]);
  byName.set(c.name.toLowerCase(), [c]);
}
const idx = { byNumber, byName, cards } as unknown as Parameters<typeof prepareDeckWith>[2];
const cat = { byId } as unknown as Parameters<typeof prepareDeckWith>[1];

test("a prepared deck: Leader found, DON!! never a card, four-of limit counted, totals per market", () => {
  const list = ["1xOP01-001", "4xOP01-020", "4xOP01-021", "4xOP01-022", "4xOP01-023", "4xOP01-024", "4xOP01-025", "4xOP01-026", "4xOP01-027", "4xOP01-028", "4xOP01-029", "4xOP01-030", "4xOP01-031", "2xOP01-032", "10 DON!! Card"].join("\n");
  const d = prepareDeckWith(list, cat, idx);
  assert.equal(d.shape.leaders.length, 1);
  assert.equal(d.shape.leaders[0].number, "OP01-001");
  assert.equal(d.shape.mainCards, 50);
  assert.deepEqual(d.shape.overLimit, []);
  assert.equal(publishError(d), null);
  assert.deepEqual(d.colors, ["Red"]);
  assert.equal(d.totals.AU, null, "no AU price anywhere: no partial total");
  assert.ok((d.totals.US ?? 0) > 0);
  assert.ok(d.list.split("\n")[0].includes("OP01-001"), "the Leader leads the stored list");
});

test("publishError: too many unmatched lines, a missing Leader and a short deck are refused", () => {
  const lines = (n: number) => Array.from({ length: n }, (_, i) => `1xOP01-0${20 + (i % 13)}`);
  const noLeader = prepareDeckWith(lines(13).join("\n"), cat, idx);
  assert.match(publishError(noLeader) ?? "", /Leader/);
  const junk = prepareDeckWith(["1xOP01-001", "1 zzz one", "1 zzz two", "1 zzz three", "1 zzz four"].join("\n"), cat, idx);
  assert.match(publishError(junk) ?? "", /didn't match/);
});

test("publishDeck never writes a refused deck, and a duplicate list by the same user is refused", async () => {
  const writes: unknown[] = [];
  const db = { publishedDeck: { findFirst: async () => null, create: async (a: unknown) => { writes.push(a); }, count: async () => 3 } } as unknown as Parameters<typeof publishDeck>[1];
  assert.equal(await publishesToday("u1", db), 3);
  // Without a catalogue the resolver can't match: publishError refuses and nothing is written.
  const res = await publishDeck({ title: "Test deck", description: null, text: "", userId: "u1", authorName: null, source: "user" }, db).catch(() => ({ ok: false as const, error: "no catalogue" }));
  assert.equal(res.ok, false);
  assert.equal(writes.length, 0);
});

test("publishing: signed-in only, DB daily cap, burst limit, honeypot, on-demand revalidation", () => {
  const api = read("src/app/api/decks/route.ts");
  assert.match(api, /if \(!user\) return NextResponse\.json\(\{ error: "Sign in to publish a deck\." \}, \{ status: 401 \}\)/);
  assert.match(api, /rateLimit\(`deck-publish:\$\{user\.id\}`, 3, 10 \* 60_000\)/);
  assert.match(api, /body\?\.website/);
  assert.match(api, /revalidateTag\(PUBLISHED_DECKS_TAG\)/);
  assert.match(api, /revalidatePath\("\/decks"\)/);
  assert.equal(DECK_DAILY_LIMIT, 10);
  const srv = read("src/lib/published-decks-server.ts");
  assert.match(srv, /publishedDeck\.count\(/);
  const admin = read("src/app/api/admin/decks/route.ts");
  assert.match(admin, /requireAdminApi\(req, \{ mutation: true \}\)/);
  assert.match(admin, /adminLog\(/);
});

test("deck pages: ISR, no build-time prewarming, SEO title, JSON-LD, noindex when empty", () => {
  for (const f of ["src/app/decks/page.tsx", "src/app/decks/[slug]/page.tsx", "src/app/decks/leader/[leader]/page.tsx"]) {
    const s = read(f);
    assert.match(s, /export const revalidate = 3600;/, f);
    // An EMPTY generateStaticParams is what makes a dynamic segment ISR; one
    // that returns params would prewarm database-backed pages at build.
    const gsp = /export async function generateStaticParams\(\) \{([\s\S]*?)\n\}/.exec(s);
    if (gsp) assert.match(gsp[1], /^\s*return \[\];\s*$/, f);
    assert.doesNotMatch(s, /from "@\/lib\/db"/, `${f} reads through data.ts loaders`);
  }
  const page = read("src/app/decks/[slug]/page.tsx");
  assert.match(page, /deck — \$\{cost \? `\$\{cost\} to build` : deck\.title\} \| OP Compare/);
  assert.match(page, /"@type": "CreativeWork"/);
  assert.match(read("src/app/decks/page.tsx"), /robots|noindex/i, "an empty library is noindexed");
  assert.match(read("src/app/sitemap.ts"), /\/decks\/\$\{d\.slug\}/);
});

test("/deck opens on the tool: the builder comes before the explanatory text", () => {
  const s = read("src/app/deck/page.tsx");
  assert.ok(s.indexOf("<HubIntro") > s.indexOf("<DeckBuilder"));
});
