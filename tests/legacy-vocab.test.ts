// The One Piece vocabulary must not survive in the Magic site (the 95 files that import the kept names compile whatever they mean, so only a text search finds the stragglers). Owner WP19 (ratchet).
// Offenders are derived from the filesystem; no shared allow-list. Before milestone M2 each package may only reduce its own count (tests/fixtures/ratchet-baseline.json, one key per package); with RATCHET_STRICT=1 the count is zero.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, ratchet, stripComments, summary, walk } from "./helpers/ratchet";

const CODE = (f: string) => /\.(tsx?|js|cjs|mjs)$/.test(f);
const LEGACY: [string, RegExp][] = [
  ["OP rarity codes", /["'](?:SEC|SR|UC|TR|PR)["']\s*[,\])}:]|(?:rarity|r)\s*===?\s*["'](?:SEC|SR|UC|TR|PR|L)["']/],   // "L" is Land in MTG; flagged only as a comparison
  ["OP printing keys", /\bprinting\s*(?:===?|!==?)\s*["'](?:alt|manga|sp|treasure|parallel|reprint|foil)["']|PRINTING_KEYS\.includes\(["'](?:manga|sp)["']\)/],
  ["Leader / DON!! / Counter / Life", /\bDON!!|["']Leader["']|\bcardType\s*(?:===?|!==?)\s*["'](?:Leader|Character|Event|Stage)["']|\.counter\b.*\b(?:life|power)\b/],
  ["OP set codes", /\b(?:OP|ST|EB|PRB)\d{2}(?:-\d{2,3})?\b/],
  ["OP set kinds", /kind\s*(?:===?|!==?)\s*["'](?:booster|extra|premium|starter|collection|event)["']|\[\s*["']booster["']\s*,\s*["']extra["']/],
  ["OP brand and game", /\b(?:OP Compare|OpCompare|opcompare|One Piece|ONE PIECE|onepiece|Straw Hat|Specifxx\/OpCompare)\b/],
  ["OP card slot", /\bslot\s*[:=]\s*["']?(?:headline|alt|manga)|\.slot\b/],
];
const files = [...walk("src", CODE), ...walk("scripts", CODE)].filter((f) => !f.startsWith("src/lib/blog/posts/") || process.env.LEGACY_INCLUDE_POSTS === "1");
const text = new Map(files.map((f) => [f, stripComments(fs.readFileSync(path.join(ROOT, f), "utf8"))]));

for (const [name, re] of LEGACY) {
  test(`legacy vocabulary: ${name}`, () => {
    const offenders = files.filter((f) => re.test(text.get(f)!));
    const r = ratchet(`legacy-vocab:${name}`, offenders);
    if (!r.ok) assert.fail(r.failures.join("\n"));
    if (offenders.length) console.log(`  [legacy-vocab] ${name}: ${summary(r)}`);
  });
}
test("legacy routes and directories are gone (no /leaders, no /cards/printing)", () => {
  const dirs = ["src/app/leaders", "src/app/decks/leader", "src/app/cards/printing"].filter((d) => fs.existsSync(path.join(ROOT, d)));
  const r = ratchet("legacy-vocab:routes", dirs);
  if (!r.ok) assert.fail(r.failures.join("\n"));
});
