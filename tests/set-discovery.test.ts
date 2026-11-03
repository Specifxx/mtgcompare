// New sets find themselves (lib/set-discovery.ts, scripts/discover-sets.ts, data/sets/discovered.json): which Scryfall sets are
// taken, how they are named and labelled, and that a name inside another set's name is refused rather than guessed.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  boostersOf,
  candidates,
  cleanSetName,
  isUniversesBeyond,
  mergeDiscovered,
  nameInside,
  seriesOf,
  setSlug,
  ubByFranchise,
  type DiscoveredSet,
  type ScryfallSet,
} from "../src/lib/set-discovery";
import { HAND_SETS, SETS } from "../src/lib/sets";

const TODAY = "2026-11-03";
const sf = (code: string, name: string, released_at: string, set_type = "expansion", extra: Partial<ScryfallSet> = {}): ScryfallSet => ({
  code,
  name,
  released_at,
  set_type,
  digital: false,
  parent_set_code: null,
  ...extra,
});
const KNOWN = HAND_SETS.map((s) => ({ code: s.code, name: s.name, slug: s.slug }));

test("an upcoming paper expansion is taken; known, digital, child, token and far-off sets are not", () => {
  const all = [
    sf("trk", "Star Trek", "2026-11-13"), // known
    sf("zzz", "Dawn of Zephyr", "2027-01-22"),
    sf("zzc", "Dawn of Zephyr Commander", "2027-01-22", "commander", { parent_set_code: "zzz" }),
    sf("yzz", "Alchemy: Zephyr", "2027-01-27", "alchemy", { digital: true }),
    sf("tzzz", "Dawn of Zephyr Tokens", "2027-01-22", "token", { parent_set_code: "zzz" }),
    sf("sld", "Secret Lair Drop", "2026-12-01", "box"),
    sf("far", "Far Future", "2027-09-01"),
    sf("old", "Long Released", "2026-06-01"),
  ];
  const { take, skipped } = candidates(all, KNOWN, TODAY);
  assert.deepEqual(
    take.map((c) => c.set.code),
    ["zzz"],
  );
  assert.deepEqual(skipped, []);
});

test("a name inside a known set's name is refused (a bare title would flip sets), and a too-short or duplicate name too", () => {
  const all = [sf("mrv", "Marvel", "2026-12-04"), sf("abc", "Hob", "2026-12-04"), sf("st2", "Star Trek", "2026-12-04")];
  const { take, skipped } = candidates(all, KNOWN, TODAY);
  assert.deepEqual(take, []);
  assert.deepEqual(
    skipped.map((s) => s.code),
    ["mrv", "abc", "st2"],
  );
  assert.ok(nameInside("Marvel", "Marvel Super Heroes"));
  assert.ok(nameInside("The Hobbit", "Hobbit"));
  assert.ok(!nameInside("Lorwyn Eclipsed", "Lorwyn"));
  assert.ok(!nameInside("Strixhaven Remastered", "Secrets of Strixhaven"));
});

test("names lose Wizards' product-line prefix; slugs match lib/sets.ts", () => {
  assert.equal(cleanSetName("Magic: The Gathering | Star Trek"), "Star Trek");
  assert.equal(cleanSetName("Universes Beyond: Fallout"), "Fallout");
  assert.equal(cleanSetName("Lorwyn Eclipsed"), "Lorwyn Eclipsed");
  assert.equal(setSlug("The Brothers' War"), "the-brothers-war");
  for (const s of HAND_SETS) assert.equal(setSlug(s.name), s.slug, s.name);
});

test("series and booster lines come from the set type; Universes Beyond only from the cards' stamps", () => {
  assert.equal(seriesOf({ set_type: "expansion", name: "X" }, false), "Standard");
  assert.equal(seriesOf({ set_type: "expansion", name: "X" }, true), "Universes Beyond");
  assert.equal(seriesOf({ set_type: "masters", name: "X Remastered" }, false), "Masters & Horizons");
  assert.equal(seriesOf({ set_type: "draft_innovation", name: "Modern Horizons 4" }, false), "Masters & Horizons");
  assert.equal(seriesOf({ set_type: "draft_innovation", name: "Jumpstart 2027" }, false), "Supplemental");
  assert.equal(seriesOf({ set_type: "commander", name: "Commander Legends 3" }, false), "Commander");
  assert.deepEqual(boostersOf({ set_type: "expansion", name: "X" }), ["play", "collector"]);
  assert.deepEqual(boostersOf({ set_type: "draft_innovation", name: "Jumpstart 2027" }), ["jumpstart"]);
  assert.equal(boostersOf({ set_type: "commander", name: "Commander Legends 3" }), undefined);
  assert.equal(isUniversesBeyond(0, 0), null);
  assert.equal(isUniversesBeyond(100, 90), true);
  assert.equal(isUniversesBeyond(100, 3), false);
});

test("a set keeps its first slug and first-seen day; its date and series follow Scryfall; unknown stamps keep the old series", () => {
  const before: DiscoveredSet[] = [
    { code: "zzz", name: "Dawn of Zephyr", slug: "dawn-of-zephyr", releaseDate: "2027-01-22", series: "Universes Beyond", boosters: ["play", "collector"], scryfallType: "expansion", firstSeen: "2026-10-01" },
  ];
  const take = [{ set: sf("zzz", "Dawn of the Zephyr", "2027-01-29"), name: "Dawn of the Zephyr" }];
  const [d] = mergeDiscovered(before, take, new Map([["zzz", null]]), new Set(["zzz"]), new Set(), TODAY);
  assert.equal(d.slug, "dawn-of-zephyr");
  assert.equal(d.firstSeen, "2026-10-01");
  assert.equal(d.releaseDate, "2027-01-29");
  assert.equal(d.name, "Dawn of the Zephyr");
  assert.equal(d.series, "Universes Beyond");
  // Gone from Scryfall, or hand-written into lib/sets.ts: dropped. Out of the window but still listed: kept.
  assert.deepEqual(mergeDiscovered(before, [], new Map(), new Set(), new Set(), TODAY), []);
  assert.deepEqual(mergeDiscovered(before, [], new Map(), new Set(["zzz"]), new Set(["zzz"]), TODAY), []);
  assert.equal(mergeDiscovered(before, [], new Map(), new Set(["zzz"]), new Set(), TODAY).length, 1);
});

test("data/sets/discovered.json is well formed and SETS stays newest first with unique codes and slugs", () => {
  const file = JSON.parse(fs.readFileSync("data/sets/discovered.json", "utf8")) as DiscoveredSet[];
  assert.ok(Array.isArray(file));
  for (const d of file) {
    assert.match(d.code, /^[a-z0-9]{2,6}$/);
    assert.match(d.releaseDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(d.slug, /^[a-z0-9-]+$/);
  }
  assert.equal(new Set(SETS.map((s) => s.code)).size, SETS.length);
  assert.equal(new Set(SETS.map((s) => s.slug)).size, SETS.length);
  for (let i = 1; i < SETS.length; i++) assert.ok(SETS[i - 1].releaseDate >= SETS[i].releaseDate, SETS[i].code);
});

test("Mystery Booster and Un-sets are left for a hand-written row; Horizons and Jumpstart releases are taken", () => {
  const all = [
    sf("mbc", "Mystery Booster Commander Edition", "2026-10-19", "draft_innovation"),
    sf("unx", "Unthinkable", "2027-01-08", "funny"),
    sf("mh4", "Modern Horizons 4", "2027-03-12", "draft_innovation"),
    sf("j27", "Jumpstart 2027", "2027-03-12", "draft_innovation"),
  ];
  const { take, skipped } = candidates(all, KNOWN, TODAY);
  assert.deepEqual(
    take.map((c) => c.set.code),
    ["mh4", "j27"],
  );
  assert.deepEqual(
    skipped.map((s) => s.code),
    ["mbc", "unx"],
  );
});

test("before previews, a set is Universes Beyond only when it opens with a known Universes Beyond franchise", () => {
  assert.equal(ubByFranchise("Marvel: Darkhold Destiny", HAND_SETS), true);
  assert.equal(ubByFranchise("Nauctis: The Sunken Realm", HAND_SETS), null);
  assert.equal(ubByFranchise("Secrets of Ravnica", HAND_SETS), null);
});
