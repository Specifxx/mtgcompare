// Invariant C14 (owner WP01a): a collector number is a LOCATOR, never an identity. A lookup by (Scryfall set code, nkey) returns a LIST of one to three products (a base, its Foil Etched twin, a Surge Foil
// variant), and the words a person types ("foil etched", "surge", "(b)") choose between them; when they do not, the list is the answer (the chooser page of /card/<set>/<number>). The loader
// resolveBySetNumber is WP02's; what it stands on is here: nkey, nsort, displayNumber and the vocabulary of treatment words. All data is real: Scryfall printings and TCGplayer product names of 2026-10-07.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as C from "../src/lib/constants";
import * as K from "../src/lib/catalog";

// ── the key ──
test("nkey is the lookup key: the star printing and the plain printing share it, a letter or a prefix is identity", () => {
  // Birds of Paradise, 7th Edition: 231 (nonfoil) and 231★ (foil) are two Scryfall printings of ONE TCGplayer product
  assert.equal(C.nkey("231"), C.nkey("231★"));
  assert.notEqual(C.nkey("551a"), C.nkey("551"), "551a is another card");
  assert.notEqual(C.nkey("A39"), C.nkey("39"));
  assert.notEqual(C.nkey("KHC-29"), C.nkey("29"));
  assert.equal(C.nkey("029/281"), C.nkey("29"), "TCGplayer writes 029/281, Scryfall 29");
  assert.equal(C.nkey("0205"), "205");
  assert.equal(C.nkey("Z"), "z", "no digits: lower-cased, kept");
  assert.equal(C.nkey("—"), "—".toLowerCase(), "nothing is invented for an odd number");
});

// ── the natural order of a set ──
test("nsort orders a real set the way a collector reads it (Unfinity's A/B pairs, Secret Lair, a prefixed promo number)", () => {
  const unf = ["1", "2", "9", "10", "11", "99", "100", "230", "230a", "230b", "231", "586"];
  assert.deepEqual([...unf].reverse().sort((a, b) => C.nsort(a) - C.nsort(b)), unf);
  const sld = ["1", "2", "10", "99", "160", "160★", "161", "1079", "1675", "2138"];
  assert.deepEqual([...sld].reverse().sort((a, b) => C.nsort(a) - C.nsort(b)), sld);
  const mixed = ["99", "165p", "165s", "A39", "KHC-29"];
  assert.deepEqual([...mixed].sort((a, b) => C.nsort(a) - C.nsort(b)).slice(0, 3), ["99", "165p", "165s"], "plain numbers first, prefixed after");
  assert.ok(C.nsort(null) > C.nsort("KHC-29"), "no number sorts last: 8.6% of singles (pre-1998 sets, World Championship Decks, playtest cards)");
  assert.equal(C.nsort("160★") - C.nsort("160"), 1);
  assert.equal(C.nsort("230b") - C.nsort("230a"), 1);
});

// ── a lookup returns a list ──
interface Cand { id: number; name: string }
/** (Scryfall set, collector number) -> TCGplayer products that carry that printing: base id, etched id, and the variants that TCGplayer files under the same number. REAL ids and names. */
const LOCATORS: Record<string, Cand[]> = {
  "sld|160": [{ id: 251775, name: "Griselbrand" }, { id: 251776, name: "Griselbrand (Foil Etched)" }],
  "mh2|267": [{ id: 238617, name: "Counterspell" }, { id: 240803, name: "Counterspell (Foil Etched)" }],
  "mh2|290": [{ id: 240138, name: "Fire // Ice" }, { id: 240807, name: "Fire // Ice (Foil Etched)" }],
  "mh2|433": [{ id: 239613, name: "Sword of Hearth and Home (Retro Frame)" }, { id: 239615, name: "Sword of Hearth and Home (Retro Frame) (Foil Etched)" }],
  "mh2|488": [{ id: 239577, name: "Mountain (488)" }, { id: 239576, name: "Mountain (488) (Foil Etched)" }],
  "mkm|72": [{ id: 535972, name: "Sudden Setback (a)" }, { id: 537180, name: "Sudden Setback (b)" }],
  "msc|63": [{ id: 697293, name: "War Machine, Avenging Arsenal" }, { id: 697908, name: "War Machine, Avenging Arsenal (Surge Foil)" }],
  "7ed|231": [{ id: 2831, name: "Birds of Paradise" }],
  "acr|203": [{ id: 541332, name: "Ezio Auditore da Firenze (Foil Etched)" }],
  "mh3|1": [{ id: 550846, name: "Breaker of Creation" }],
};
const lookup = (sc: string, number: string): Cand[] => LOCATORS[`${sc}|${C.nkey(number)}`] ?? [];
test("a lookup by (set, number) returns a LIST of one to three products, never assumed unique; any spelling of the number finds it", () => {
  for (const [key, list] of Object.entries(LOCATORS)) { assert.ok(list.length >= 1 && list.length <= 3, key); assert.equal(new Set(list.map((c) => c.id)).size, list.length); }
  assert.deepEqual(lookup("sld", "160").map((c) => c.id), [251775, 251776]);
  assert.deepEqual(lookup("sld", "160★").map((c) => c.id), [251775, 251776], "the star printing is found by the same key");
  assert.deepEqual(lookup("7ed", "231★").map((c) => c.id), [2831]);
  assert.deepEqual(lookup("mh2", "0267").map((c) => c.id), [238617, 240803], "leading zeros");
  assert.deepEqual(lookup("mh2", "999"), [], "none: the chooser page 404s");
  assert.equal(Object.values(LOCATORS).filter((l) => l.length === 2).length, 7);
});

// ── the words choose ──
/** The resolution a deck line or a CSV row gets: the treatment words (and a version letter) narrow the list; no words prefers the plain product; what stays ambiguous stays a list. */
function choose(cands: readonly Cand[], words: string): Cand[] {
  const wanted = new Set<string>(); let version: string | null = null;
  for (const w of words.split(/\s+/).filter(Boolean)) {
    const key = C.TREATMENT_BY_SYNONYM.get(C.fold(w)) ?? C.TREATMENT_BY_SYNONYM.get(C.fold(`${w} foil`));
    if (key) wanted.add(key); else if (/^\(?[a-f]\)?$/i.test(w)) version = w.replace(/[()]/g, "").toLowerCase();
  }
  const parsed = cands.map((c) => ({ c, p: K.parseTcgName(c.name, { setCodes: new Set(), groupKind: "expansion" }) }));
  let pool = parsed.filter(({ p }) => [...wanted].every((k) => p.treat.includes(k as C.TreatmentKey)) && (version === null || p.version?.toLowerCase() === version));
  if (wanted.size === 0 && version === null) { const plain = pool.filter(({ p }) => !p.treat.some((k) => C.FOIL_PATTERN_KEYS.has(k))); if (plain.length) pool = plain; }
  return pool.map(({ c }) => c).sort((a, b) => a.id - b.id);
}
test("'foil etched' picks the etched twin, no words picks the plain product (Counterspell, Griselbrand, Fire // Ice, a basic land)", () => {
  assert.deepEqual(choose(lookup("mh2", "267"), "").map((c) => c.id), [238617]);
  assert.deepEqual(choose(lookup("mh2", "267"), "foil etched").map((c) => c.id), [240803]);
  assert.deepEqual(choose(lookup("mh2", "267"), "etched").map((c) => c.id), [240803]);
  assert.deepEqual(choose(lookup("sld", "160"), "").map((c) => c.id), [251775]);
  assert.deepEqual(choose(lookup("sld", "160"), "etched").map((c) => c.id), [251776]);
  assert.deepEqual(choose(lookup("mh2", "290"), "etched").map((c) => c.id), [240807]);
  assert.deepEqual(choose(lookup("mh2", "488"), "").map((c) => c.id), [239577]);
});
test("a treatment word narrows within a family: retro frame alone cannot tell the base from its etched twin; retro etched can", () => {
  const sword = lookup("mh2", "433");
  assert.deepEqual(choose(sword, "retro").map((c) => c.id), [239613, 239615], "still ambiguous: the list is the answer");
  assert.deepEqual(choose(sword, "retro etched").map((c) => c.id), [239615]);
  assert.deepEqual(choose(sword, "").map((c) => c.id), [239613], "no words: the plain one");
});
test("a Surge Foil variant shares its base's number and is chosen by its word; the version letters of Murders at Karlov Manor choose between (a) and (b)", () => {
  const msc = lookup("msc", "63");
  assert.deepEqual(choose(msc, "").map((c) => c.id), [697293]);
  assert.deepEqual(choose(msc, "surge").map((c) => c.id), [697908]);
  assert.deepEqual(choose(msc, "surge foil").map((c) => c.id), [697908]);
  const mkm = lookup("mkm", "72");
  assert.deepEqual(choose(mkm, "").map((c) => c.id), [535972, 537180], "no word separates (a) from (b): the chooser");
  assert.deepEqual(choose(mkm, "a").map((c) => c.id), [535972]);
  assert.deepEqual(choose(mkm, "(b)").map((c) => c.id), [537180]);
});
test("every candidate in the lists parses to the keys the chooser relies on: the vocabulary has a word for each way two products differ", () => {
  const diff = new Set<string>();
  for (const list of Object.values(LOCATORS)) {
    if (list.length < 2) continue;
    const parsed = list.map((c) => K.parseTcgName(c.name, { setCodes: new Set(), groupKind: "expansion" }));
    const a = new Set(parsed.flatMap((p) => p.treat)), common = [...a].filter((k) => parsed.every((p) => p.treat.includes(k)));
    const only = [...a].filter((k) => !common.includes(k));
    const versions = parsed.map((p) => p.version);
    assert.ok(only.length > 0 || new Set(versions).size === versions.length, `${list.map((c) => c.name).join(" | ")}: nothing separates them`);
    for (const k of only) diff.add(k);
  }
  assert.deepEqual([...diff].sort(), ["etched", "surge"]);
});

// ── the whole snapshot, when the lab data is on this machine ──
const LAB = process.env.MTG_LAB;
const SLIM = LAB ? path.join(LAB, "scryfall/slim.ndjson") : "";
test("over all Scryfall printings: a (set, nkey) names one or two products by id and etched id, and every star pair is one product (skipped without MTG_LAB)", { skip: !SLIM || !fs.existsSync(SLIM) ? "set MTG_LAB to the snapshot directory" : false }, () => {
  const lists = new Map<string, Set<number>>(), numbers = new Map<string, Set<string>>();
  for (const line of fs.readFileSync(SLIM, "utf8").split("\n")) {
    if (!line) continue;
    const r = JSON.parse(line) as { set: string; collector_number: string; games?: string[]; tcgplayer_id: number | null; tcgplayer_etched_id: number | null };
    if (!(r.games ?? []).includes("paper")) continue;
    const k = `${r.set}|${C.nkey(r.collector_number)}`;
    (numbers.get(k) ?? numbers.set(k, new Set()).get(k)!).add(r.collector_number);
    for (const id of [r.tcgplayer_id, r.tcgplayer_etched_id]) if (id) (lists.get(k) ?? lists.set(k, new Set()).get(k)!).add(id);
  }
  const sizes = new Map<number, number>();
  for (const s of lists.values()) sizes.set(s.size, (sizes.get(s.size) ?? 0) + 1);
  assert.deepEqual([...sizes.keys()].sort(), [1, 2], "by id and etched id a locator names one or two products");
  assert.ok(sizes.get(2)! > 800, `${sizes.get(2)} two-product locators`);
  assert.deepEqual([...(lists.get("sld|160") ?? [])].sort(), [251775, 251776]);
  assert.deepEqual([...(lists.get("7ed|231") ?? [])], [2831]);
  assert.deepEqual([...(numbers.get("7ed|231") ?? [])].sort(), ["231", "231★"]);
  assert.ok([...numbers.values()].filter((s) => s.size > 1).length > 1000, "stars and letters make many raw numbers share one key");
});
