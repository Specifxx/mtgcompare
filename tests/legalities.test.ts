// Legality has five states (invariants C8 and C19, owner WP01a): L legal, N not legal, B banned, R restricted, ? unknown, one character per format in Oracle.legal. UNKNOWN IS NOT "NOT LEGAL":
// a product with no Scryfall join, an older file with fewer characters and a status Scryfall has not shown us yet all read as unknown, which renders as nothing. The legality objects below are
// Scryfall's own `legalities` of real cards (default_cards, 2026-10-07).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as C from "../src/lib/constants";

const KEYS = ["standard", "future", "historic", "timeless", "gladiator", "pioneer", "modern", "legacy", "pauper", "vintage", "penny", "commander", "oathbreaker", "standardbrawl", "brawl", "competitivebrawl", "alchemy", "paupercommander", "duel", "oldschool", "premodern", "predh", "tlr"] as const;
// compact form: one status letter per key, in the order of KEYS (l legal, n not_legal, b banned, r restricted)
const STATUS: Record<string, string> = { l: "legal", n: "not_legal", b: "banned", r: "restricted" };
const real = (letters: string): Record<string, string> => Object.fromEntries(KEYS.map((k, i) => [k, STATUS[letters[i]!]!]));
const CARDS: Record<string, { legalities: Record<string, string>; legal: string }> = Object.fromEntries(
  Object.entries({
    "Lightning Bolt":                      { letters: "nnbllnllllnllnllnllnlll", legal: "NNBLLNLLLLNLLNLLNLLLLL" },
    "Sol Ring":                            { letters: "nnnnnnnbnrnlbnnnnnbnnlb", legal: "NNNNNNNBNRNLBNNNNNBNLB" },
    "Black Lotus":                         { letters: "nnnnnnnbnrnbbnnnnnbrnbb", legal: "NNNNNNNBNRNBBNNNNNBNBB" },
    "Mana Crypt":                          { letters: "nnnnnnnbnrnbbnnnnnbnnbb", legal: "NNNNNNNBNRNBBNNNNNBNBB" },
    "The One Ring":                        { letters: "nnbllnblnlnllnllnnbnnnn", legal: "NNBLLNBLNLNLLNLLNNBNNN" },
    "Library of Alexandria":               { letters: "nnbllnnbnrnbbnllnnbnnbb", legal: "NNBLLNNBNRNBBNLLNNBNBB" },
    "Who // What // When // Where // Why": { letters: "nnnnnnnnnnnnnnnnnnnnnnn", legal: "NNNNNNNNNNNNNNNNNNNNNN" },
  }).map(([name, c]) => [name, { legalities: real(c.letters), legal: c.legal }]),
);

test("legalString turns Scryfall's legalities object into the 22 characters, in FORMATS order; oldschool is read and dropped", () => {
  for (const [name, c] of Object.entries(CARDS)) {
    const out = C.legalString(c.legalities);
    assert.equal(out.legal, c.legal, name);
    assert.equal(out.legal.length, C.FORMATS.length, name);
    assert.deepEqual([out.unknownKeys, out.unknownStatuses], [[], 0], `${name}: nothing outside the vocabulary`);
  }
  assert.deepEqual(Object.keys(CARDS["Black Lotus"]!.legalities), [...KEYS], "Scryfall's 23 keys: the 22 formats and oldschool");
});
test("Black Lotus: banned in Legacy and Commander, restricted in Vintage, not legal anywhere else, and the oldschool key never reaches the string", () => {
  const lotus = CARDS["Black Lotus"]!.legal;
  assert.deepEqual([C.legalityOf(lotus, "vintage"), C.legalityOf(lotus, "legacy"), C.legalityOf(lotus, "commander"), C.legalityOf(lotus, "modern"), C.legalityOf(lotus, "standard")], ["restricted", "banned", "banned", "not_legal", "not_legal"]);
  assert.deepEqual([C.isPlayable(lotus, "vintage"), C.isPlayable(lotus, "legacy"), C.isPlayable(lotus, "commander")], [true, false, false], "restricted is playable (one copy); banned is not");
  assert.equal(C.legalString(CARDS["Black Lotus"]!.legalities).legal.length, 22);
});
test("real cards across formats: Lightning Bolt is legal in Modern and Pauper, not in Standard; Sol Ring is legal in Commander only among the big formats", () => {
  const bolt = CARDS["Lightning Bolt"]!.legal, ring = CARDS["Sol Ring"]!.legal;
  assert.deepEqual(["standard", "pioneer", "modern", "legacy", "vintage", "pauper", "commander"].map((f) => C.legalityOf(bolt, f as C.Format)), ["not_legal", "not_legal", "legal", "legal", "legal", "legal", "legal"]);
  assert.deepEqual(["modern", "legacy", "vintage", "commander", "pauper"].map((f) => C.legalityOf(ring, f as C.Format)), ["not_legal", "banned", "restricted", "legal", "not_legal"]);
  assert.deepEqual(C.FORMAT_UI.filter((f) => C.isPlayable(ring, f)), ["vintage", "commander"]);
  assert.equal(C.legalityOf(CARDS["The One Ring"]!.legal, "modern"), "banned");
});
test("an Un-set card is not legal in any format: five characters of N, no format is playable", () => {
  const unh = CARDS["Who // What // When // Where // Why"]!.legal;
  assert.ok(C.FORMATS.every((f) => C.legalityOf(unh, f) === "not_legal" && !C.isPlayable(unh, f)));
});
test("UNKNOWN IS NOT NOT-LEGAL: a missing string, a short string, a '?' and a status we have not seen all read as unknown", () => {
  assert.equal(C.legalityOf(undefined, "modern"), "unknown");
  assert.equal(C.legalityOf(null, "modern"), "unknown");
  assert.equal(C.legalityOf("", "modern"), "unknown");
  assert.equal(C.legalityOf("L", "tlr"), "unknown", "a file written before a format was appended has no character for it");
  assert.equal(C.legalityOf("L", "standard"), "legal");
  assert.equal(C.legalityOf("?".repeat(22), "legacy"), "unknown");
  assert.equal(C.legalityOf("Z".repeat(22), "legacy"), "unknown", "an unrecognised character is unknown too");
  for (const f of C.FORMATS) { assert.notEqual(C.legalityOf(undefined, f), "not_legal"); assert.equal(C.isPlayable(undefined, f), false, "and unknown is not playable either"); }
  const odd = C.legalString({ standard: "suspended", modern: "legal", brandnew: "legal" });
  assert.equal(odd.legal[0], "?", "a status outside the four is '?'");
  assert.equal(odd.legal[6], "L");
  assert.deepEqual(odd.unknownKeys, ["brandnew"], "an unknown format key is returned, never fatal");
  assert.equal(odd.unknownStatuses, 21, "the suspended status plus the 20 formats the object did not mention are counted");
  assert.equal(C.legalString(undefined).legal, "?".repeat(22));
});
test("the five characters and the Scryfall statuses they come from", () => {
  assert.deepEqual(C.LEGAL_CHARS, { L: "legal", N: "not_legal", B: "banned", R: "restricted", "?": "unknown" });
  assert.deepEqual(C.LEGAL_FROM_SCRYFALL, { legal: "L", not_legal: "N", banned: "B", restricted: "R" });
  assert.equal(C.legalSql("modern"), 'substr("legal", 7, 1)', "SQL fragments count from 1");
  assert.equal(C.legalSql("standard"), 'substr("legal", 1, 1)');
});

// ── C19: a legality badge on a printing is shown only when the printing is playable as printed ──
interface Fx { productId: number; name: string; groupKind: string; expect: { cls: number | "sealed" } }
const fixtures: Fx[] = JSON.parse(fs.readFileSync(path.resolve(__dirname, "fixtures/magic-products.json"), "utf8"));
test("C19: gold-border, silver-border, oversized and Un-set printings carry NOTPLAY and are not playable as printed; tokens, art cards and helpers never are", () => {
  let notPlay = 0, playable = 0;
  for (const f of fixtures) {
    if (f.expect.cls === "sealed") continue;
    const flags = (C.NOTPLAY_SET_KINDS as readonly string[]).includes(f.groupKind) ? C.CARD_FLAGS.NOTPLAY : 0;
    const ok = C.playableAsPrinted({ flags, cls: f.expect.cls });
    assert.equal(ok, flags === 0 && f.expect.cls === C.CARD_CLASS.CARD, `${f.productId} ${f.name}`);
    if (ok) playable++; else notPlay++;
  }
  assert.ok(notPlay >= 15 && playable >= 30, `${notPlay} not playable, ${playable} playable`);
  const byId = (id: number): Fx => fixtures.find((f) => f.productId === id)!;
  assert.equal(byId(97396).groupKind, "gold-border", "Air Elemental (CE): Collector's Edition");
  assert.equal(byId(158462).groupKind, "gold-border", "Armageddon, World Championship Decks");
  assert.equal(byId(208535).groupKind, "unset", "Who // What // When // Where // Why");
  assert.equal(C.playableAsPrinted({ flags: 0, cls: C.CARD_CLASS.TOKEN }), false);
  assert.equal(C.playableAsPrinted({ flags: 0, cls: C.CARD_CLASS.CARD }), true);
});
test("the oracle-level grid still exists for a NOTPLAY printing: legality is a fact of the oracle, the badge is a fact of the printing", () => {
  assert.equal(C.legalityOf(CARDS["Black Lotus"]!.legal, "vintage"), "restricted", "Black Lotus Collector's Edition is not playable as printed, its oracle is restricted in Vintage");
  assert.equal(C.playableAsPrinted({ flags: C.CARD_FLAGS.NOTPLAY, cls: 0 }), false);
});

// ── the whole snapshot, when the lab data is on this machine ──
const SLIM = process.env.MTG_LAB ? path.join(process.env.MTG_LAB, "scryfall/slim.ndjson") : "";   // MTG_LAB = the research snapshot directory (scryfall/, tcgcsv/, ...); without it the corpus tests skip, they never fail
test("every legalities object of the 118,601 Scryfall rows has exactly the 23 known keys and only the four statuses (skipped without MTG_LAB)", { skip: !SLIM || !fs.existsSync(SLIM) ? "set MTG_LAB to the snapshot directory" : false }, () => {
  const keys = new Set<string>(), statuses = new Set<string>();
  let rows = 0;
  for (const line of fs.readFileSync(SLIM, "utf8").split("\n")) {
    if (!line) continue;
    const r = JSON.parse(line) as { legalities: Record<string, string> };
    rows++;
    for (const [k, v] of Object.entries(r.legalities)) { keys.add(k); statuses.add(v); }
  }
  assert.ok(rows > 100_000);
  assert.deepEqual([...keys].sort(), [...KEYS].sort(), "a new format key means FORMATS needs an appended entry");
  assert.deepEqual([...statuses].sort(), ["banned", "legal", "not_legal", "restricted"]);
});
