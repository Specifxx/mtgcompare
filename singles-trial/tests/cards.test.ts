import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  INDEX_START,
  addHistory,
  cardIndexable,
  cardTitle,
  cardValue,
  cardsOfGroup,
  cleanName,
  dayIndex,
  mergeSet,
  movers,
  numberKey,
  numberOrder,
  releaseForIndexing,
  searchCards,
  skipGroup,
  valueAt,
  type CardRow,
  type SearchRow,
  type SetFile,
  type SetsFile,
  type TopFile,
  type HistoryFile,
} from "../src/lib/cards";
import { cardEntries, indexFiles, setEntries, urlsetXml } from "../src/lib/sitemap";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const fx = (p: string) => JSON.parse(readFileSync(join(ROOT, "tests/fixtures", p), "utf8")).results;

test("a card has a number or a rarity; sealed product, code cards and tokens are not cards", () => {
  const cards = cardsOfGroup(fx("tcgcsv/3/604/products.json"), fx("tcgcsv/3/604/prices.json"));
  assert.deepEqual(cards.map((c) => c.n).sort(), ["Alakazam", "Charizard", "Energy Retrieval", "Pikachu", "Pikachu (Red Cheeks)"]);
  const zard = cards.find((c) => c.n === "Charizard")!;
  assert.deepEqual(zard.p, { Holofoil: 41250, "1st Edition Holofoil": 520000 });
  assert.equal(cardValue(zard.p), 520000);
  assert.equal(zard.no, "004/102");
  // A rarity without a number is a card unless its name says it is a product.
  assert.equal(cardsOfGroup([{ productId: 1, name: "Elite Trainer Box", extendedData: [{ name: "Rarity", value: "Promo" }] }], []).length, 0);
  assert.equal(cardsOfGroup([{ productId: 1, name: "Deck Box Dragon", extendedData: [{ name: "Number", value: "7" }] }], []).length, 1);
});

test("the number TCGplayer appends to a name is dropped from the name", () => {
  const cards = cardsOfGroup(fx("tcgcsv/3/23237/products.json"), fx("tcgcsv/3/23237/prices.json"));
  assert.ok(cards.some((c) => c.n === "Charizard ex" && c.no === "199/165"));
  assert.ok(cards.some((c) => c.n === "Erika's Invitation"));
});

test("a number inside a name leaves it only when it is the card's own number (real TCGplayer names)", () => {
  assert.equal(cleanName("Alolan Exeggutor - 2a/131", "002a/131"), "Alolan Exeggutor");
  assert.equal(cleanName("Slowking - 21/122 (Cosmos Holo)", "021/122"), "Slowking (Cosmos Holo)");
  assert.equal(cleanName("Druddigon - 70/106(Cosmos Holo)", "070/106"), "Druddigon (Cosmos Holo)");
  assert.equal(cleanName("Rocket's Mewtwo - 8 [Winner]", "008/009"), "Rocket's Mewtwo [Winner]");
  assert.equal(cleanName("Umbreon - 059 (Cosmos Holo)", "059/131"), "Umbreon (Cosmos Holo)");
  assert.equal(cleanName("Professor Turo's Scenario - 171/182", "177/182"), "Professor Turo's Scenario - 171/182");
  assert.equal(cleanName("Basic Fire Energy - Armarouge 10", "002"), "Basic Fire Energy - Armarouge 10");
  assert.equal(cleanName("Mew ex", "151/165"), "Mew ex");
  assert.equal(cardsOfGroup([{ productId: 1, name: "Arcanine", extendedData: [{ name: "Rarity", value: "Unconfirmed" }] }], [])[0].r, null);
});

test("a set code shared by several sets searches all of them", () => {
  const sets = new Map([["a", { name: "Nintendo Promos", abbr: "PR" }], ["b", { name: "Alternate Art Promos", abbr: "PR" }]]);
  const rows: SearchRow[] = [["a", "pikachu-1", "Pikachu", "001", 500, 1, 1], ["b", "eevee-1", "Eevee", "001", 400, 1, 2]];
  assert.deepEqual(searchCards(rows, sets, "PR 1").hits.map((h) => h.s), ["pikachu-1", "eevee-1"]);
});

test("groups without cards are skipped", () => {
  assert.equal(skipGroup({ name: "Base Set Art Series" }), true);
  assert.equal(skipGroup({ name: "Base Set" }), false);
});

test("slugs: name-number, frozen, two printings never share one", () => {
  const today = cardsOfGroup(fx("tcgcsv/3/604/products.json"), fx("tcgcsv/3/604/prices.json"));
  const day1 = mergeSet([], today, "2026-11-18");
  const slugs = day1.map((c) => c.s);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.ok(slugs.includes("charizard-004-102"));
  assert.ok(slugs.includes("pikachu-058-102") && slugs.includes("pikachu-red-cheeks-058-102"));
  assert.deepEqual(day1.map((c) => c.no), ["001/102", "004/102", "058/102", "058/102", "081/102"]);
  // The next day a renamed card keeps its slug and first day.
  const renamed = today.map((c) => (c.n === "Charizard" ? { ...c, n: "Charizard (Shadowless)" } : c));
  const day2 = mergeSet(day1, renamed, "2026-11-19");
  const z = day2.find((c) => c.id === 42382)!;
  assert.equal(z.s, "charizard-004-102");
  assert.equal(z.since, "2026-11-18");
  assert.equal(numberOrder("2", "10"), -8);
  assert.ok(numberOrder("10", "TG01") < 0);
});

const row = (id: number, cents: number, ix: 0 | 1 = 0): CardRow => ({ id, s: `c${id}`, n: `Card ${id}`, no: String(id), r: null, p: cents ? { Normal: cents } : {}, ix, since: "2026-11-18" });

test("Google is rationed: the first run releases INDEX_START, then `growth` a day, most valuable first, US$1 and up", () => {
  const all = Array.from({ length: 3000 }, (_, i) => row(i + 1, i < 2500 ? 100 + i : 50));
  assert.equal(releaseForIndexing(all, 250), INDEX_START);
  assert.equal(all.filter(cardIndexable).length, INDEX_START);
  assert.ok(all.find((c) => c.id === 2500)!.ix === 1, "the most valuable first");
  assert.equal(all.find((c) => c.id === 2600)!.ix, 0, "under US$1 is never released");
  assert.equal(releaseForIndexing(all, 250), 250);
  assert.equal(releaseForIndexing(all, 0), 0, "0 pauses the release");
  assert.equal(all.filter(cardIndexable).length, INDEX_START + 250);
  // A released card that falls under the gate loses its place.
  const top = all.find((c) => c.id === 2500)!;
  top.p = { Normal: 10 };
  releaseForIndexing(all, 0);
  assert.equal(top.ix, 0);
});

const SETS = new Map([
  ["base-set", { name: "Base Set", abbr: "BS" }],
  ["sv-scarlet-violet-151", { name: "SV: Scarlet & Violet 151", abbr: "MEW" }],
  ["legend-of-blue-eyes", { name: "Legend of Blue Eyes White Dragon", abbr: "LOB" }],
]);
const ROWS: SearchRow[] = [
  ["base-set", "charizard-004-102", "Charizard", "004/102", 520000, 1, 42382],
  ["base-set", "pikachu-058-102", "Pikachu", "058/102", 310, 1, 42400],
  ["sv-scarlet-violet-151", "charizard-ex-199-165", "Charizard ex", "199/165", 25133, 1, 517045],
  ["sv-scarlet-violet-151", "porygon2-137-165", "Porygon2", "137/165", 50, 0, 517002],
  ["sv-scarlet-violet-151", "mew-ex-151-165", "Mew ex", "151/165", 600, 1, 517001],
  ["legend-of-blue-eyes", "blue-eyes-white-dragon-lob-001", "Blue-Eyes White Dragon", "LOB-001", 9000, 1, 21715],
];
const find = (q: string) => searchCards(ROWS, SETS, q).hits.map((h) => h.s);

test("search: by name, set code, collector number, and names that look like numbers", () => {
  assert.equal(find("charizard")[0], "charizard-004-102");
  assert.deepEqual(find("charizard").length, 2);
  assert.deepEqual(find("charizard 199"), ["charizard-ex-199-165"]);
  assert.deepEqual(find("charizard 4/102"), ["charizard-004-102"]);
  assert.deepEqual(find("BS 58"), ["pikachu-058-102"]);
  assert.deepEqual(find("#58"), ["pikachu-058-102"]);
  assert.deepEqual(find("mew 151/165"), ["mew-ex-151-165"]);
  assert.deepEqual(find("porygon2"), ["porygon2-137-165"]);
  assert.deepEqual(find("LOB-001"), ["blue-eyes-white-dragon-lob-001"]);
  assert.deepEqual(find("blue eyes"), ["blue-eyes-white-dragon-lob-001"]);
  assert.equal(find("mew")[0], "mew-ex-151-165", "a name that is also a set code is still found by name");
  assert.deepEqual(find("pikachu base set"), ["pikachu-058-102"]);
  assert.deepEqual(find("zzzz"), []);
  assert.deepEqual(find("a"), []);
  assert.equal(numberKey("004/102"), "4");
  assert.equal(numberKey("TG01/TG30"), "tg1");
  assert.equal(numberKey("LOB-EN001"), "en1");
});

test("titles fit 60 characters with the brand and keep the whole name", () => {
  const brand = "TCG Singles DB";
  const t = cardTitle({ n: "Charizard ex", no: "199/165" }, { name: "SV: Scarlet & Violet 151", abbr: "MEW" }, brand);
  assert.ok(`${t} | ${brand}`.length <= 60, t);
  assert.match(t, /^Charizard ex/);
  assert.match(t, /199\/165/);
});

test("history adds a point only when the value moves; movers compare with a week ago", () => {
  const c = row(1, 1000);
  let h: HistoryFile = addHistory({}, [c, row(2, 50)], "2026-11-18");
  assert.deepEqual(h["1"], [[dayIndex("2026-11-18"), 1000]]);
  assert.equal(h["2"], undefined, "cards under US$1 are not followed");
  h = addHistory(h, [{ ...c, p: { Normal: 1010 } }], "2026-11-19");
  assert.equal(h["1"].length, 1, "1% is not a move");
  h = addHistory(h, [{ ...c, p: { Normal: 1500 } }], "2026-11-26");
  assert.equal(h["1"].length, 2);
  assert.equal(valueAt(h["1"], dayIndex("2026-11-20")), 1000);
  assert.equal(valueAt(h["1"], dayIndex("2026-11-17")), null);
  const m = movers([{ set: "s", s: "c1", n: "Card 1", no: "1", r: null, id: 1, v: 1500, pts: h["1"] }], "2026-11-26");
  assert.equal(m.up.length, 1);
  assert.equal(m.up[0].was, 1000);
  assert.equal(m.up[0].days, 7);
  assert.equal(m.down.length, 0);
  // A card first seen today has nothing to compare with.
  assert.equal(movers([{ set: "s", s: "c1", n: "x", no: "", r: null, id: 1, v: 1500, pts: [[dayIndex("2026-11-26"), 1500]] }], "2026-11-26").up.length, 0);
});

test("the import end to end, two days: files, frozen URLs, history, movers, the release", () => {
  const out = mkdtempSync(join(tmpdir(), "tsdb-"));
  const run = (fixtures: string, day: string) =>
    execFileSync("npx", ["tsx", "scripts/import.ts"], { cwd: ROOT, env: { ...process.env, TCGCSV_FIXTURE_DIR: join(ROOT, "tests/fixtures", fixtures), DATA_DIR: out, IMPORT_DAY: day, CARD_INDEX_GROWTH: "" }, encoding: "utf8" });
  run("tcgcsv", "2026-11-18");
  const read = <T>(f: string) => JSON.parse(readFileSync(join(out, f), "utf8")) as T;
  const sets = read<SetsFile>("cards/pokemon/sets.json");
  assert.deepEqual(sets.sets.map((s) => s.slug), ["sv-scarlet-violet-151", "base-set"], "newest first; the art series is skipped");
  assert.equal(read<SetFile>("cards/pokemon/sets/base-set.json").cards.length, 5);
  const meta = read<{ games: Record<string, { cards: number; indexed: number }> }>("meta.json");
  assert.equal(meta.games.pokemon.cards, 9);
  assert.equal(meta.games.pokemon.indexed, 7, "cards at US$1 or more");
  assert.equal(read<TopFile>("cards/pokemon/top.json").top[0].n, "Charizard");
  assert.equal(read<TopFile>("cards/pokemon/top.json").up.length, 0, "no movers on the first day");
  run("day2", "2026-11-26");
  const s2 = read<SetFile>("cards/pokemon/sets/sv-scarlet-violet-151.json");
  assert.equal(s2.cards.length, 5);
  assert.equal(s2.cards.find((c) => c.id === 517045)!.since, "2026-11-18");
  assert.equal(s2.cards.find((c) => c.id === 517099)!.since, "2026-11-26");
  const top = read<TopFile>("cards/pokemon/top.json");
  assert.deepEqual(top.up.map((m) => m.n), ["Mew ex"]);
  assert.deepEqual(top.down.map((m) => m.n), ["Erika's Invitation"]);
  assert.equal(read<HistoryFile>("history/pokemon/sv-scarlet-violet-151.json")["517001"].length, 2);
  assert.ok(existsSync(join(out, "cards/pokemon/search.json")));
});

test("the sitemap lists released cards only", () => {
  const cards: CardRow[] = [row(1, 500, 1), row(2, 500, 0), row(3, 50, 1)];
  const sets = [{ slug: "a", name: "A", abbr: null, groupId: 1, released: null, cards: 3, indexed: 1 }, { slug: "b", name: "B", abbr: null, groupId: 2, released: null, cards: 2, indexed: 0 }];
  assert.deepEqual(cardEntries("pokemon", sets, () => cards, 1), [{ path: "/pokemon/a/c1" }]);
  assert.deepEqual(setEntries("pokemon", sets).map((e) => e.path), ["/pokemon/a"]);
  assert.deepEqual(indexFiles([{ slug: "pokemon", indexed: 10_001 }, { slug: "yugioh", indexed: 0 }]), ["pages", "pokemon-sets", "pokemon-cards-1", "pokemon-cards-2"]);
  assert.match(urlsetXml("https://x.test", [{ path: "/a&b" }]), /<loc>https:\/\/x\.test\/a&amp;b<\/loc>/);
});
