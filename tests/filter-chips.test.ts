import { test } from "node:test";
import assert from "node:assert/strict";
import { withArticle, activeChips, canonical, clearFilters, priceInput, removeChip, toggle, values } from "../src/lib/filter-chips";
import { DEFAULT_FLOOR_CENTS, NO_SET, isFiltered, parseBrowse, toCardQuery } from "../src/lib/browse";
import { COLORS } from "../src/lib/constants";
import type { SetLite } from "../src/lib/data";

const sp = (s: string) => new URLSearchParams(s);
const labels = { set: (s: string) => ({ "mh3-modern-horizons-3": "Modern Horizons 3 (MH3)" })[s], symbol: "US$", adjective: "Australian" };

test("values merge CSV and repeated keys", () => {
  assert.deepEqual(values(sp("color=white&color=blue,green&color=white"), "color"), ["white", "blue", "green"]);
  assert.deepEqual(values(sp(""), "set"), []);
});

test("canonical: fixed order, CSV, defaults and page dropped, unknown keys kept", () => {
  const c = canonical(sp("page=3&sort=value&per=48&color=white&color=blue&q=sol+ring&utm_source=x&min=&cmode=any"));
  assert.equal(c.toString(), "q=sol+ring&color=white%2Cblue&utm_source=x");
  assert.equal(canonical(sp("sort=price-asc&per=100")).toString(), "sort=price-asc&per=100");
  assert.equal(canonical(sp("format=modern&finish=foil&treat=borderless&rarity=M")).toString(), "rarity=M&treat=borderless&finish=foil&format=modern", "rarity, treatment, finish, format: the panel's order");
});

test("toggle a value on and off (colors and rarities case-insensitively)", () => {
  assert.equal(toggle(sp("color=white"), "color", "blue").get("color"), "white,blue");
  assert.equal(toggle(sp("color=White,blue"), "color", "white").get("color"), "blue");
  assert.equal(toggle(sp("rarity=M"), "rarity", "m").has("rarity"), false);
});

test("chips: one per value, labelled, price as a range, q never a chip", () => {
  const chips = activeChips(sp("q=sol+ring&set=mh3-modern-horizons-3&color=white&rarity=M&treat=borderless&type=creature&finish=foil&format=modern&priced=1&min=5"), labels);
  assert.deepEqual(
    chips.map((c) => c.label),
    ["Modern Horizons 3 (MH3)", "White", "Mythic Rare", "Creature", "Borderless", "Foil prices", "Playable in Modern", "Has an Australian listing", "From US$5"],
  );
  assert.equal(activeChips(sp("max=20"), labels)[0].label, "Up to US$20");
  assert.equal(activeChips(sp("min=5&max=20"), labels)[0].label, "US$5–US$20");
  assert.deepEqual(activeChips(sp("q=sheoldred&sort=name"), labels), []);
  assert.equal(activeChips(sp("set=zzz-unknown"), labels)[0].label, "ZZZ-UNKNOWN");
  assert.deepEqual(activeChips(sp("color=colorless,multicolor,u"), labels).map((c) => c.label), ["Colorless", "Multicolor", "Blue"]);
  assert.equal(activeChips(sp("color=white,blue&cmode=exact"), labels).at(-1)!.label, "Exactly these colors");
});

test("removing chips and clearing", () => {
  assert.equal(canonical(removeChip(sp("color=white,blue&rarity=R"), { key: "color", value: "white" })).toString(), "color=blue&rarity=R");
  assert.equal(removeChip(sp("min=5&max=10&color=red"), { key: "price", value: "" }).toString(), "color=red");
  assert.equal(removeChip(sp("priced=1&color=red"), { key: "priced", value: "" }).toString(), "color=red");
  assert.equal(removeChip(sp("finish=foil&color=red"), { key: "finish", value: "" }).toString(), "color=red");
  assert.equal(clearFilters(sp("q=sol+ring&color=red&sort=name&per=24&page=2")).toString(), "q=sol+ring&sort=name&per=24");
});

test("price boxes", () => {
  assert.equal(priceInput(""), "");
  assert.equal(priceInput(" 5 "), "5");
  assert.equal(priceInput("US$12.499"), "12.5");
  assert.equal(priceInput("abc"), null);
  assert.equal(priceInput("-3"), null);
});

test("market adjectives take the right article", () => {
  assert.deepEqual(["US", "Australian", "UK", "Singapore", "Canadian", "European"].map(withArticle), ["a US", "an Australian", "a UK", "a Singapore", "a Canadian", "a European"]);
});

// ── the URL as a CardQuery (src/lib/browse.ts) ─────────────────────────────────────────────────────────────────────────────────

const SETS: SetLite[] = [
  { id: 23219, slug: "mh3-modern-horizons-3", tok: "mh3", code: "MH3", name: "Modern Horizons 3", tcgName: "Modern Horizons 3", kind: "expansion", releasedOn: "2024-06-14", bucket: false, cardCount: 900, trackedCount: 300, sealedCount: 20 },
  { id: 3170, slug: "7ed-seventh-edition", tok: "7ed", code: "7ED", name: "Seventh Edition", tcgName: "Seventh Edition", kind: "core", releasedOn: "2001-04-11", bucket: false, cardCount: 350, trackedCount: 40, sealedCount: 4 },
];

test("parseBrowse: every filter the panel writes, validated against the closed vocabularies", () => {
  const q = parseBrowse({ color: ["white", "Blue", "c", "bogus"], min: "1.50", sort: "nope", per: "100", page: "-3", rarity: "M,rare,zz", type: "Creature,instant", treat: "borderless,notatreatment", finish: "foil", format: "modern", keyword: "Double Strike", set: "mh3,7ed-seventh-edition", priced: "1", identity: "WUB", cmode: "exact" });
  assert.deepEqual(q.colors, ["white", "blue", "colorless"]);
  assert.deepEqual(q.rarities, ["M", "R"]);
  assert.deepEqual(q.types, ["creature", "instant"]);
  assert.deepEqual(q.treats, ["borderless"]);
  assert.equal(q.finish, "F");
  assert.equal(q.format, "modern");
  assert.equal(q.keyword, "double-strike");
  assert.equal(q.identity, "wub");
  assert.equal(q.colorMode, "exact");
  assert.equal(q.min, 150);
  assert.equal(q.sort, "value");
  assert.equal(q.per, 100);
  assert.equal(q.page, 1);
  assert.equal(q.priced, true);
  assert.equal(parseBrowse({ sort: "popular" }).sort, "popular");
  assert.equal(parseBrowse({ finish: "etched" }).finish, null, "etched is a treatment, not a finish");
  assert.equal(parseBrowse({ page: "500" }).page, 100);
});

test("toCardQuery: sets by slug or code, colors (any, exact, colorless, multicolor), identity, unit view, price in cents; an unknown set matches nothing", () => {
  const q = toCardQuery(parseBrowse({ set: "mh3,7ed-seventh-edition", color: "white,blue", cmode: "exact", rarity: "M", finish: "foil", format: "modern", min: "5", max: "20", priced: "1", identity: "wub", type: "creature" }), SETS, "AU");
  assert.deepEqual(q.setIds, [23219, 3170]);
  assert.deepEqual(q.colors, { mask: COLORS.White.bit | COLORS.Blue.bit, mode: "exact" });
  assert.deepEqual(q.identity, { mask: COLORS.White.bit | COLORS.Blue.bit | COLORS.Black.bit });
  assert.deepEqual([q.rarities, q.finish, q.format, q.minCents, q.maxCents, q.pricedIn, q.types], [["M"], "F", { key: "modern", playable: true }, 500, 2000, "AU", ["creature"]]);
  assert.deepEqual(toCardQuery(parseBrowse({ color: "colorless" }), SETS, "US").colors, { mask: 0, mode: "colorless" });
  assert.deepEqual(toCardQuery(parseBrowse({ color: "multicolor" }), SETS, "US").colors, { mask: 0, mode: "multi" });
  assert.deepEqual(toCardQuery(parseBrowse({ color: "red,colorless" }), SETS, "US").colors, { mask: COLORS.Red.bit, mode: "within" });
  assert.deepEqual(toCardQuery(parseBrowse({ set: "no-such-set" }), SETS, "US").setIds, [NO_SET]);
  assert.equal(toCardQuery(parseBrowse({ q: "sol ring" }), SETS, "US").q, "sol ring", "free text is the planner's, not resolved here");
});

test("the default list leaves THIN rows out (the index floor); a search, a set, a named minimum or floor:false lifts it", () => {
  assert.equal(DEFAULT_FLOOR_CENTS, 50);
  assert.equal(toCardQuery(parseBrowse({}), SETS, "US").minCents, 50);
  assert.equal(toCardQuery(parseBrowse({ q: "sol ring" }), SETS, "US").minCents, undefined);
  assert.equal(toCardQuery(parseBrowse({ set: "mh3" }), SETS, "US").minCents, undefined);
  assert.equal(toCardQuery(parseBrowse({ min: "0.01" }), SETS, "US").minCents, 1);
  assert.equal(toCardQuery(parseBrowse({}), SETS, "US", { floor: false }).minCents, undefined);
  assert.equal(isFiltered(parseBrowse({ sort: "name", per: "24" })), false);
  assert.equal(isFiltered(parseBrowse({ format: "modern" })), true);
});
