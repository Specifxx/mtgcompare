import { test } from "node:test";
import assert from "node:assert/strict";
import { KEYWORDS, KEYWORD_BY_SLUG, KEYWORD_INDEX_MIN, cardKeywords, isIndexableKeyword, keywordLabel, keywordSlug, splitKeywordText } from "../src/lib/keywords";

test("slugs are unique, hyphenated and match Scryfall's token form", () => {
  assert.equal(new Set(KEYWORDS.map((k) => k.slug)).size, KEYWORDS.length);
  for (const k of KEYWORDS) assert.match(k.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, k.slug);
  assert.equal(keywordSlug("First strike"), "first-strike");
  assert.equal(keywordSlug("Jump-start"), "jump-start");
  assert.equal(keywordSlug("Choose a Background"), "choose-a-background");
});

test("every definition has a summary, a body and no One Piece bracket marker", () => {
  for (const k of KEYWORDS) {
    assert.ok(k.summary.length > 20 && k.body.length >= 1 && k.markers.length >= 1, k.slug);
    assert.doesNotMatch([k.name, k.summary, ...k.body].join(" "), /\[|DON!!|Leader|One Piece/, k.slug);
  }
});

test("cardKeywords reads Scryfall's list: Baneslayer Angel has four", () => {
  assert.deepEqual(cardKeywords([]), []);
  assert.deepEqual(cardKeywords(["flying", "first-strike", "lifelink", "protection"]), ["flying", "first-strike", "lifelink", "protection"]);
  // a keyword with no definition is kept, after the known ones
  assert.deepEqual(cardKeywords(["flying", "gravestorm"]), ["flying", "gravestorm"]);
  assert.deepEqual(cardKeywords(null), []);
});

test("cardKeywords reads whole words in rules text", () => {
  const sylvan = "Flying, first strike, lifelink, protection from Demons and from Dragons";
  assert.deepEqual(cardKeywords(sylvan), ["flying", "first-strike", "lifelink", "protection"]);
  // "double strike" is one keyword, not "strike"; "landcycling" is not "cycling"
  assert.deepEqual(cardKeywords("Double strike"), ["double-strike"]);
  assert.deepEqual(cardKeywords("Plainscycling {2}, landcycling {1}"), ["landcycling"]);
  // no match inside another word
  assert.deepEqual(cardKeywords("Counter target spell. Reachable lands untap."), []);
});

test("splitKeywordText alternates text and keyword hits", () => {
  assert.deepEqual(splitKeywordText("Flying, haste"), ["", "Flying", ", ", "haste", ""]);
  assert.deepEqual(splitKeywordText("Destroy target creature."), ["Destroy target creature."]);
});

test("labels and the indexing threshold", () => {
  assert.equal(keywordLabel("first-strike"), "First strike");
  assert.equal(keywordLabel("choose-a-background"), "Choose a background");
  assert.ok(KEYWORD_BY_SLUG.has("deathtouch"));
  assert.equal(isIndexableKeyword(KEYWORD_INDEX_MIN - 1), false);
  assert.equal(isIndexableKeyword(KEYWORD_INDEX_MIN), true);
});
