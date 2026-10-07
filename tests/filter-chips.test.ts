import { test } from "node:test";
import assert from "node:assert/strict";
import { withArticle, activeChips, canonical, clearFilters, priceInput, removeChip, toggle, values } from "../src/lib/filter-chips";

const sp = (s: string) => new URLSearchParams(s);
const labels = { set: (s: string) => ({ "op01-romance-dawn": "Romance Dawn (OP01)" })[s], symbol: "A$", adjective: "Australian" };

test("values merge CSV and repeated keys", () => {
  assert.deepEqual(values(sp("color=red&color=blue,green&color=red"), "color"), ["red", "blue", "green"]);
  assert.deepEqual(values(sp(""), "set"), []);
});

test("canonical: fixed order, CSV, defaults and page dropped, unknown keys kept", () => {
  const c = canonical(sp("page=3&sort=value&per=48&color=red&color=blue&q=luffy&utm_source=x&min="));
  assert.equal(c.toString(), "q=luffy&color=red%2Cblue&utm_source=x");
  assert.equal(canonical(sp("sort=price-asc&per=100")).toString(), "sort=price-asc&per=100");
});

test("toggle a value on and off (colours case-insensitively)", () => {
  assert.equal(toggle(sp("color=red"), "color", "blue").get("color"), "red,blue");
  assert.equal(toggle(sp("color=Red,blue"), "color", "red").get("color"), "blue");
  assert.equal(toggle(sp("rarity=SEC"), "rarity", "SEC").has("rarity"), false);
});

test("chips: one per value, labelled, price as a range, q never a chip", () => {
  const chips = activeChips(sp("q=luffy&set=op01-romance-dawn&color=red&rarity=SEC&printing=manga&type=Leader&priced=1&min=5"), labels);
  assert.deepEqual(
    chips.map((c) => c.label),
    ["Romance Dawn (OP01)", "Red", "Secret Rare (SEC)", "Leader", "Manga", "Has an Australian listing", "From A$5"],
  );
  assert.equal(activeChips(sp("max=20"), labels)[0].label, "Up to A$20");
  assert.equal(activeChips(sp("min=5&max=20"), labels)[0].label, "A$5–A$20");
  assert.deepEqual(activeChips(sp("q=zoro&sort=name"), labels), []);
  assert.equal(activeChips(sp("set=op99-unknown"), labels)[0].label, "OP99-UNKNOWN");
});

test("removing chips and clearing", () => {
  assert.equal(canonical(removeChip(sp("color=red,blue&rarity=SR"), { key: "color", value: "red" })).toString(), "color=blue&rarity=SR");
  assert.equal(removeChip(sp("min=5&max=10&color=red"), { key: "price", value: "" }).toString(), "color=red");
  assert.equal(removeChip(sp("priced=1&color=red"), { key: "priced", value: "" }).toString(), "color=red");
  assert.equal(clearFilters(sp("q=luffy&color=red&sort=name&per=24&page=2")).toString(), "q=luffy&sort=name&per=24");
});

test("price boxes", () => {
  assert.equal(priceInput(""), "");
  assert.equal(priceInput(" 5 "), "5");
  assert.equal(priceInput("A$12.499"), "12.5");
  assert.equal(priceInput("abc"), null);
  assert.equal(priceInput("-3"), null);
});

test("market adjectives take the right article", () => {
  assert.deepEqual(["US", "Australian", "UK", "Singapore", "Canadian", "European"].map(withArticle), ["a US", "an Australian", "a UK", "a Singapore", "a Canadian", "a European"]);
});
