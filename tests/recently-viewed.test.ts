import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_RECENT_CARDS, MAX_RECENT_SEARCHES, parseRecentCards, parseRecentSearches, withRecentCard, withRecentSearch, type RecentCard } from "../src/lib/recently-viewed";

const card = (slug: string): RecentCard => ({ slug, name: slug.toUpperCase(), variant: null, setCode: "OP01", number: "OP01-001", img: null });

test("recent cards: newest first, one per slug, capped", () => {
  let list: RecentCard[] = [];
  list = withRecentCard(list, card("a"));
  list = withRecentCard(list, card("b"));
  list = withRecentCard(list, card("a")); // a re-view moves it to the front
  assert.deepEqual(list.map((c) => c.slug), ["a", "b"]);
  for (let i = 0; i < 30; i++) list = withRecentCard(list, card(`x${i}`));
  assert.equal(list.length, MAX_RECENT_CARDS);
  assert.equal(list[0].slug, "x29");
});

test("recent searches: trimmed, case-insensitive dedupe, blanks ignored, capped", () => {
  let s: string[] = [];
  s = withRecentSearch(s, "  luffy ");
  s = withRecentSearch(s, "Zoro");
  s = withRecentSearch(s, "LUFFY");
  s = withRecentSearch(s, "   ");
  assert.deepEqual(s, ["LUFFY", "Zoro"]);
  for (const t of ["a", "b", "c", "d", "e", "f"]) s = withRecentSearch(s, t);
  assert.equal(s.length, MAX_RECENT_SEARCHES);
  assert.equal(s[0], "f");
  assert.equal(withRecentSearch([], "big    mom")[0], "big mom");
});

test("stored values are parsed defensively", () => {
  assert.deepEqual(parseRecentCards(null), []);
  assert.deepEqual(parseRecentCards("not json"), []);
  assert.deepEqual(parseRecentCards('{"slug":"a"}'), []);
  const parsed = parseRecentCards(JSON.stringify([card("a"), { slug: "" }, { name: "x" }, 5, { slug: "b", name: "B", setCode: "OP02" }]));
  assert.deepEqual(parsed.map((c) => c.slug), ["a", "b"]);
  assert.equal(parsed[1].img, null);
  assert.equal(parsed[1].variant, null);
  assert.deepEqual(parseRecentSearches('["a", "", 3, "b"]'), ["a", "b"]);
  assert.deepEqual(parseRecentSearches("{}"), []);
});
