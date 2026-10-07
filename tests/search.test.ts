import { test } from "node:test";
import assert from "node:assert/strict";
import { numberQuery, searchCards } from "../src/lib/search";
import { parseBrowse } from "../src/lib/browse";
import type { CardLite, SetLite } from "../src/lib/data";

const low = { US: null, AU: null, UK: null, SG: null, CA: null, EU: null };
const stores = { US: 0, AU: 0, UK: 0, SG: 0, CA: 0, EU: 0 };
const mk = (id: number, name: string, number: string, printing = "standard", marketUsd = 100): CardLite => ({
  id, slug: `s${id}`, name, number, setId: 1, rarity: "SR", variant: printing === "standard" ? null : "Parallel", printing, colors: ["Red"], cardType: "Character",
  cost: 1, power: 1000, counter: null, life: null, hasImage: true, marketUsd, low, stores, change7d: null, change30d: null, high90Usd: null,
});
const cards = [mk(1, "Monkey.D.Luffy", "OP01-024"), mk(2, "Monkey.D.Luffy", "OP01-024", "alt", 9000), mk(3, "Roronoa Zoro", "OP01-025"), mk(4, "Nami", "OP01-016")];
const sets = new Map<number, SetLite>([[1, { id: 1, slug: "op01-romance-dawn", code: "OP01", name: "Romance Dawn", kind: "booster", releasedOn: "2022-12-02", cardCount: 4, sealedCount: 0 }]]);

test("card number queries", () => {
  assert.equal(numberQuery("op01 024"), "OP01-024");
  assert.equal(numberQuery("OP01024"), "OP01-024");
  assert.equal(numberQuery("p-011"), "P-011");
  assert.equal(numberQuery("luffy"), null);
  assert.deepEqual(searchCards(cards, sets, "OP01-024").map((c) => c.id), [1, 2]);
});

test("name search: every word must match, dots ignored", () => {
  assert.deepEqual(searchCards(cards, sets, "monkey d luffy").map((c) => c.id).sort(), [1, 2]);
  assert.deepEqual(searchCards(cards, sets, "zoro romance").map((c) => c.id), [3]);
  assert.deepEqual(searchCards(cards, sets, "kaido"), []);
});

test("browse params", () => {
  const q = parseBrowse({ color: ["red", "Blue"], min: "1.50", sort: "nope", per: "100", page: "-3" });
  assert.deepEqual(q.colors, ["Red", "Blue"]);
  assert.equal(q.min, 150);
  assert.equal(q.sort, "value");
  assert.equal(q.per, 100);
  assert.equal(q.page, 1);
});

// ── Search upgrades (RiftCompare parity, ux track) ───────────────────────────
import { editDistance, queryVariants, splitNumber, squash, suggestNames } from "../src/lib/search";

const more = [
  ...cards,
  mk(5, 'Eustass"Captain"Kid', "OP01-051"),
  mk(6, "Charlotte Linlin", "OP03-114"),
  mk(7, "Kaido & Linlin", "OP08-119", "standard", 50),
  mk(8, "Marshall.D.Teach", "OP09-081"),
  mk(9, "Monkey.D.Luffy", "OP05-119", "manga", 90000),
  mk(10, "Sanji", "OP01-013"),
  mk(11, "Nami", "OP01-016", "sp", 500),
];

test("punctuation and squashed names", () => {
  assert.equal(squash("Monkey.D.Luffy"), "monkeydluffy");
  const ids = (q: string) => searchCards(more, sets, q).map((c) => c.id);
  assert.ok(ids("Monkey.D.Luffy").includes(1));
  assert.ok(ids("monkeydluffy").includes(1));
  assert.deepEqual(ids("captain kid"), [5]);
  assert.deepEqual(ids("eustasscaptainkid"), [5]);
});

test("a word matches the start of a word, not the middle of a short one", () => {
  // "sp" is the SP printing, not "Sanji"'s "s…p" and not every name containing "sp".
  const ids = searchCards(more, sets, "nami sp").map((c) => c.id);
  assert.deepEqual(ids, [11]);
  // Four letters or more may match inside a word.
  assert.ok(searchCards(more, sets, "linlin").map((c) => c.id).includes(7));
});

test("card number anywhere in the query, narrowed by the other words", () => {
  assert.deepEqual(splitNumber("OP05-119 manga"), { number: "OP05-119", rest: "manga" });
  assert.deepEqual(splitNumber("luffy"), { number: null, rest: "luffy" });
  assert.deepEqual(searchCards(more, sets, "OP05-119 manga").map((c) => c.id), [9]);
  assert.deepEqual(searchCards(more, sets, "op05119").map((c) => c.id), [9]);
});

test("One Piece nicknames add results, never remove them", () => {
  assert.ok(queryVariants("big mom").includes("linlin"));
  assert.deepEqual(searchCards(more, sets, "big mom").map((c) => c.id).sort((a, b) => a - b), [6, 7]);
  assert.deepEqual(searchCards(more, sets, "blackbeard").map((c) => c.id), [8]);
  // The original words are always tried too.
  assert.ok(queryVariants("roronoa zoro").includes("roronoa zoro"));
});

test("ranking: exact names first, then by print and value", () => {
  const r = searchCards(more, sets, "nami").map((c) => c.id);
  assert.deepEqual(r.slice(0, 2).sort(), [11, 4].sort());
  const l = searchCards(more, sets, "monkey d luffy").map((c) => c.id);
  assert.deepEqual(l.slice().sort((a, b) => a - b), [1, 2, 9]);
  // Same name and value: the standard print first.
  const tie = searchCards([mk(20, "Nami", "OP01-016", "alt", 100), mk(21, "Nami", "OP01-016", "standard", 100)], sets, "nami").map((c) => c.id);
  assert.deepEqual(tie, [21, 20]);
});

test("did you mean: real names within a small edit distance", () => {
  assert.equal(editDistance("lufy", "luffy"), 1);
  assert.equal(editDistance("teh", "the"), 1);
  assert.ok(editDistance("kaido", "zoro", 2) > 2);
  const names = more.map((c) => c.name);
  assert.deepEqual(suggestNames(names, "lufy"), ["Monkey.D.Luffy"]);
  assert.deepEqual(suggestNames(names, "charlote linlin"), ["Charlotte Linlin"]);
  assert.deepEqual(suggestNames(names, "xx"), []);
  assert.deepEqual(suggestNames(names, "qwertyuiop"), []);
});
