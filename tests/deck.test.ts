// The decklist parser, resolver and pricer (src/lib/deck.ts) behind /deck,
// /api/deck/price and the Buy List Planner's paste box.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkDeck,
  formatDeckLine,
  indexCards,
  isSectionHeader,
  marketTotals,
  mergeLines,
  normalizeNumber,
  parseDeckList,
  resolveDeck,
  resolveLine,
  splitByCheapestStore,
  type ResolvableCard,
} from "../src/lib/deck";

const card = (id: number, name: string, number: string | null, printing = "standard", cardType: string | null = "Character", variant: string | null = null): ResolvableCard => ({
  id, name, number, printing, variant, cardType,
});

const CARDS = [
  card(100, "Roronoa Zoro", "OP01-001", "standard", "Leader"),
  card(101, "Roronoa Zoro", "OP01-001", "alt", "Leader", "Parallel"),
  card(200, "Nami", "OP01-016"),
  card(201, "Nami", "OP01-016", "alt", null, "Parallel"),
  card(202, "Nami", "OP01-016", "manga", null, "Manga"),
  card(300, "Nami", "ST01-007"),
  card(400, "Shanks", "OP01-120", "standard"),
  card(402, "Shanks", "OP01-120", "manga", null, "Manga"),
  card(401, "Shanks", "OP01-120", "alt", null, "Parallel"),
  card(500, "Monkey.D.Luffy", "OP01-024"),
  card(600, "Promo Luffy", "P-001", "promo"),
  card(700, "DON!! Card", null, "don", "DON!!"),
];
const IDX = indexCards(CARDS);

test("parses every common One Piece export line", () => {
  const lines = parseDeckList(
    [
      "Leader",
      "1xOP01-001",
      "Characters (12)",
      "4xOP01-016",
      "4 x ST01-007",
      "4 OP01-120",
      "OP01-024 x3",
      "2 Monkey.D.Luffy (OP01-024)",
      "1 op01024",
      "P-001",
      "Events:",
      "4 Nami",
      "DON!! x10",
      "Total: 51",
      "// a comment",
      "# another",
    ].join("\n"),
  );
  assert.deepEqual(
    lines.map((l) => [l.qty, l.number ?? null, l.name, l.leader]),
    [
      [1, "OP01-001", "", true],
      [4, "OP01-016", "", false],
      [4, "ST01-007", "", false],
      [4, "OP01-120", "", false],
      [3, "OP01-024", "", false],
      [2, "OP01-024", "Monkey.D.Luffy", false],
      [1, "OP01-024", "", false],
      [1, "P-001", "", false],
      [4, null, "Nami", false],
    ],
  );
});

test("Leader: lines, parallels and exact printing pins", () => {
  const [a, b, c, d] = parseDeckList("Leader: Roronoa Zoro (OP01-001)\n1 Leader OP01-001\n4xOP01-120_p1\n4xOP01-120 #402");
  assert.equal(a.leader, true);
  assert.equal(a.number, "OP01-001");
  assert.equal(a.name, "Roronoa Zoro");
  assert.equal(b.leader, true);
  assert.equal(c.parallel, 1);
  assert.equal(c.number, "OP01-120");
  assert.equal(d.productId, 402);
});

test("a Leader header covers one card, not the rest of an unheaded list", () => {
  const lines = parseDeckList("Leader\n1xOP01-001\n4xOP01-016\n4xOP01-120");
  assert.deepEqual(lines.map((l) => l.leader), [true, false, false]);
});

test("section headers are never cards; card names that look like words are", () => {
  for (const h of ["Leader", "Characters (32)", "Events", "Stages: 2", "DON!!", "DON!! x10", "Main Deck", "Total: 51 cards", "Counter:"]) assert.ok(isSectionHeader(h), h);
  for (const c of ["Nami", "4xOP01-016", "Monkey.D.Luffy"]) assert.ok(!isSectionHeader(c), c);
});

test("normalizeNumber reads typos and missing dashes", () => {
  assert.equal(normalizeNumber("op01016"), "OP01-016");
  assert.equal(normalizeNumber("OP-01-016"), "OP01-016");
  assert.equal(normalizeNumber("prb01-001"), "PRB01-001");
  assert.equal(normalizeNumber("p-7"), null);
  assert.equal(normalizeNumber("P-042"), "P-042");
});

test("quantities are clamped to 1..99", () => {
  const [a, b] = parseDeckList("0 OP01-016\n999xOP01-016");
  assert.equal(a.qty, 1);
  assert.equal(b.qty, 99);
});

test("a number resolves to its base printing; _pN and #id pick another", () => {
  const [base, par, pin] = parseDeckList("4xOP01-120\n4xOP01-120_p1\n4xOP01-120 #402").map((l) => resolveLine(l, IDX));
  assert.equal(base.card?.id, 400);
  assert.equal(base.how, "number");
  assert.deepEqual(base.options.map((c) => c.id), [400, 401, 402]);
  assert.equal(par.card?.id, 401); // first parallel by TCGplayer id
  assert.equal(pin.card?.id, 402);
  assert.equal(pin.how, "pinned");
});

test("name-only lines are guesses: flagged ambiguous when several numbers share the name", () => {
  const [nami, luffy, nobody] = parseDeckList("4 Nami\n4 Monkey.D.Luffy\n4 Gol.D.Roger").map((l) => resolveLine(l, IDX));
  assert.equal(nami.how, "name");
  assert.equal(nami.card?.id, 200); // OP01-016: the number with the most printings
  assert.equal(nami.ambiguous, true);
  assert.ok(nami.options.some((c) => c.id === 300));
  assert.equal(luffy.ambiguous, false);
  assert.equal(nobody.card, null);
  assert.equal(nobody.how, "none");
});

test("a Leader line prefers the Leader card of that name; DON!! cards never resolve", () => {
  const [zoro] = parseDeckList("Leader: Roronoa Zoro").map((l) => resolveLine(l, IDX));
  assert.equal(zoro.card?.id, 100);
  const [don] = parseDeckList("1 #700").map((l) => resolveLine(l, IDX));
  assert.equal(don.card, null);
});

test("formatDeckLine round-trips through the parser and resolver", () => {
  const text = [formatDeckLine(4, CARDS[6], false), formatDeckLine(2, CARDS[7], true)].join("\n");
  assert.equal(text, "4xOP01-120\n2xOP01-120 #402");
  const r = resolveDeck(parseDeckList(text), IDX);
  assert.deepEqual(r.map((x) => [x.line.qty, x.card?.id]), [[4, 400], [2, 402]]);
});

test("mergeLines adds repeated printings together", () => {
  const r = mergeLines(resolveDeck(parseDeckList("2xOP01-016\n2xOP01-016\n1 Nobody"), IDX));
  assert.equal(r.length, 2);
  assert.equal(r[0].line.qty, 4);
  assert.equal(r[1].card, null);
});

test("marketTotals sums qty × cheapest listing per market and counts unpriced copies", () => {
  const t = marketTotals(
    [
      { qty: 4, low: { US: 100, AU: null } },
      { qty: 1, low: { US: 2500, AU: 3000 } },
    ],
    ["US", "AU"] as const,
  );
  assert.deepEqual(t.US, { cents: 2900, pricedQty: 5, totalQty: 5 });
  assert.deepEqual(t.AU, { cents: 3000, pricedQty: 1, totalQty: 5 });
});

test("splitByCheapestStore groups each line under its cheapest store", () => {
  const o = (source: string, priceCents: number) => ({ source, priceCents, url: `https://${source}`, condition: null });
  const s = splitByCheapestStore([
    { key: "a", qty: 4, offers: [o("store:x", 100), o("store:y", 90)] },
    { key: "b", qty: 1, offers: [o("store:x", 500)] },
    { key: "c", qty: 2, offers: [o("store:y", 50)] },
    { key: "d", qty: 1, offers: [] },
  ]);
  assert.deepEqual(s.missing, ["d"]);
  assert.equal(s.totalCents, 4 * 90 + 500 + 2 * 50);
  assert.equal(s.groups[0].source, "store:y");
  assert.equal(s.groups[0].copies, 6);
  assert.deepEqual(s.groups[1].picks.map((p) => p.key), ["b"]);
});

test("checkDeck: one Leader, 50 main-deck cards, four copies a number", () => {
  const c = checkDeck([
    { qty: 1, number: "OP01-001", isLeader: true },
    { qty: 4, number: "OP01-016", isLeader: false },
    { qty: 2, number: "OP01-016", isLeader: false },
    { qty: 44, number: "OP01-024", isLeader: false },
  ]);
  assert.equal(c.leaders, 1);
  assert.equal(c.mainCards, 50);
  assert.deepEqual(c.overLimit, ["OP01-016", "OP01-024"]);
});

test("the /deck share metadata prices under the deck API's per-IP budget", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const page = fs.readFileSync(path.resolve(__dirname, "../src/app/deck/page.tsx"), "utf8");
  const meta = page.slice(page.indexOf("export async function generateMetadata"), page.indexOf("const FAQS"));
  const limit = meta.indexOf("rateLimit(`deck-price:");
  assert.ok(limit > 0, "metadata checks the limit");
  assert.ok(limit < meta.indexOf("await priceDeck("), "before any card is loaded");
});
