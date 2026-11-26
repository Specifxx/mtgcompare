// A new set's first pre-orders make the morning import's data commit a release (lib/new-set-release.ts, owner 2026-11-26).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { newlyListedSets, type Snapshot } from "../src/lib/new-set-release";

const SETS = [
  { code: "nau", name: "Nauctis: The Sunken Realm", releaseDate: "2027-02-05" },
  { code: "mdd", name: "Marvel: Darkhold Destiny", releaseDate: "2027-04-09" },
  { code: "trk", name: "Star Trek", releaseDate: "2026-11-13" },
];
const products = [
  { id: "p1", setCode: "nau" },
  { id: "p2", setCode: "mdd" },
  { id: "p3", setCode: "mdd" },
  { id: "p4", setCode: "trk" },
];
const snap = (offers: [string, string][]): Snapshot => ({ products, offers: offers.map(([productId, store]) => ({ productId, store })) });

test("an upcoming set with no offer before and one now is newly listed, newest first, with the sources that list it", () => {
  const before = snap([["p1", "a"]]);
  const after = snap([["p1", "a"], ["p2", "b"], ["p3", "c"], ["p3", "b"]]);
  assert.deepEqual(newlyListedSets(before, after, SETS, "2026-11-26"), [
    { code: "mdd", name: "Marvel: Darkhold Destiny", releaseDate: "2027-04-09", products: 2, stores: ["b", "c"] },
  ]);
});

test("a set already listed, one still unlisted, and a released set never ask for a release", () => {
  const before = snap([["p1", "a"]]);
  assert.deepEqual(newlyListedSets(before, snap([["p1", "a"], ["p1", "b"]]), SETS, "2026-11-26"), []);
  assert.deepEqual(newlyListedSets(snap([]), snap([["p4", "a"]]), SETS, "2026-11-26"), []);
  // Release day itself still counts.
  assert.equal(newlyListedSets(snap([]), snap([["p4", "a"]]), SETS, "2026-11-13").length, 1);
});

test("the morning import releases on a new set's first listing, and only through the step's output", () => {
  const yml = fs.readFileSync(".github/workflows/sealed-import.yml", "utf8");
  assert.match(yml, /id: newset[\s\S]*run: npx tsx scripts\/new-set-release\.ts/);
  assert.match(yml, /steps\.newset\.outputs\.release == 'release'/);
  // The step runs before the publish that reads its output.
  assert.ok(yml.indexOf("id: newset") < yml.indexOf("name: Publish it to main"));
});
