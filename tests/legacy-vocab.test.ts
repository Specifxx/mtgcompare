// The One Piece vocabulary must not survive in the Magic site (the 95 files that import the kept names compile whatever they mean, so only a text search finds the stragglers). Owner WP19 (ratchet).
// Offenders are derived from the filesystem; no shared allow-list. Before milestone M2 each package may only reduce its own count (tests/fixtures/ratchet-baseline.json, one key per package); with RATCHET_STRICT=1 the count is zero.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, ratchet, stripComments, summary, walk } from "./helpers/ratchet";

const CODE = (f: string) => /\.(tsx?|js|cjs|mjs)$/.test(f);
// The brand in prose, AND in URLs and identifiers: TCGplayer's product-line slug (one-piece-card-game), a constant (TCGPLAYER_ONE_PIECE) and a helper (onePieceEbayQuery)
// carried the old game through the spaced spelling's net until 2026-10-09, the house banners linking One Piece's search under "Shop Magic singles & sealed".
const OP_BRAND = /\b(?:OP Compare|OpCompare|opcompare|One Piece|ONE PIECE|onepiece|Straw Hat|Specifxx\/OpCompare)\b|one-piece|ONE_PIECE|onePiece/;
const LEGACY: [string, RegExp][] = [
  ["OP rarity codes", /["'](?:SEC|SR|UC|TR|PR)["']\s*[,\])}:]|(?:rarity|r)\s*===?\s*["'](?:SEC|SR|UC|TR|PR|L)["']/],   // "L" is Land in MTG; flagged only as a comparison
  ["OP printing keys", /\bprinting\s*(?:===?|!==?)\s*["'](?:alt|manga|sp|treasure|parallel|reprint|foil)["']|PRINTING_KEYS\.includes\(["'](?:manga|sp)["']\)/],
  ["Leader / DON!! / Counter / Life", /\bDON!!|["']Leader["']|\bcardType\s*(?:===?|!==?)\s*["'](?:Leader|Character|Event|Stage)["']|\.counter\b.*\b(?:life|power)\b/],
  ["OP set codes", /\b(?:OP|ST|EB|PRB)\d{2}(?:-\d{2,3})?\b/],
  ["OP set kinds", /kind\s*(?:===?|!==?)\s*["'](?:booster|extra|premium|starter|collection|event)["']|\[\s*["']booster["']\s*,\s*["']extra["']/],
  ["OP brand and game", OP_BRAND],
  ["OP card slot", /\bslot\s*[:=]\s*["']?(?:headline|alt|manga)|\.slot\b/],
  // the example copy of the old site: characters and places of the series (the six OP colours are not scanned: Purple and Yellow appear in no quoted string of src today, and Red, Green, Blue, Black are Magic colours too)
  ["OP characters and world", /\b(?:Luffy|Zoro|Sanji|Usopp|Shanks|Kaido|Straw Hats?|Going Merry|Thousand Sunny|Grand Line|Wano Country|Marineford|Whitebeard|Blackbeard|Devil Fruits?|Poneglyphs?|Celestial Dragons?|Monkey D\.|Roronoa|Trafalgar Law)\b/],
];
// The blog posts are WP17's rewrite (wave 6): until then they are the One Piece posts of the baseline, so the ratchet leaves them out; the strict run (M2, Annex C check 19) and LEGACY_INCLUDE_POSTS=1 read them.
const POSTS_IN = process.env.RATCHET_STRICT === "1" || process.env.LEGACY_INCLUDE_POSTS === "1";
const files = [...walk("src", CODE), ...walk("scripts", CODE)].filter((f) => !f.startsWith("src/lib/blog/posts/") || POSTS_IN);
// The one place the old brand is named on purpose: the owner's sister sites (REQUIREMENTS: "OP Compare" is linked from About and the footer; src/lib/site.ts says so). Only that array is exempt, not the file:
// a stray "One Piece" anywhere else in site.ts still counts. (REQ-WP16-10 c.)
const EXEMPT: Record<string, RegExp[]> = { "src/lib/site.ts": [/export const SISTER_SITES = \[[\s\S]*?\] as const;/] };
const scanned = (f: string): string => (EXEMPT[f] ?? []).reduce((t, re) => t.replace(re, ""), stripComments(fs.readFileSync(path.join(ROOT, f), "utf8")));
const text = new Map(files.map((f) => [f, scanned(f)]));

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

test("the comment stripper keeps code that looks like a comment, and removes comments", () => {
  // the failure that hid 151 files from every scan: a header of star-slash-star opened a "block comment" that ran to the next end-of-comment, forty lines on
  const src = ['const h = { Accept: "*' + '/*" };', "const a = 1; /* gone */ const b = 2; // gone too", "const url = 'https://x.test/a'; const re = /[/*]+/g; const t = `a${'//'}b`;", "/** doc", " * block */", "const One = 'One Piece';"].join("\n");
  const out = stripComments(src);
  assert.ok(out.includes('Accept: "*' + '/*"'), "a string with star-slash-star is code");
  assert.ok(out.includes("const b = 2;") && !/gone/.test(out), "comments are removed, the code between them is not");
  assert.ok(out.includes("https://x.test/a") && out.includes("/[/*]+/g") && out.includes("`a${'//'}b`"), "a URL, a regex and a template are code");
  assert.ok(out.includes("One Piece"), "what follows a doc comment is still there");
  assert.equal(out.split("\n").length, src.split("\n").length, "line numbers do not move");
});
test("the brand check reads the old game's URL slug and identifiers, not only its prose", () => {
  for (const leftover of [
    "https://www.tcgplayer.com/search/one-piece-card-game/product?productLineName=one-piece-card-game&view=grid",
    "const TCGPLAYER_ONE_PIECE = 1;",
    "export const onePieceEbayQuery = magicEbayQuery;",
    "the One Piece Card Game",
  ]) assert.ok(OP_BRAND.test(leftover), leftover);
  for (const magic of ["https://www.tcgplayer.com/search/magic/product?productLineName=magic&view=grid", "magicEbayQuery", "a card in one piece"]) assert.ok(!OP_BRAND.test(magic), magic);
});
test("the sister-site array is the only exemption, and it is exempt only inside site.ts", () => {
  const site = path.join(ROOT, "src/lib/site.ts");
  if (!fs.existsSync(site)) return;
  const raw = stripComments(fs.readFileSync(site, "utf8"));
  assert.ok(/SISTER_SITES/.test(raw), "src/lib/site.ts no longer defines SISTER_SITES: drop the exemption");
  assert.ok(!OP_BRAND.test(scanned("src/lib/site.ts")), "site.ts names the old brand outside SISTER_SITES");
  assert.deepEqual(Object.keys(EXEMPT), ["src/lib/site.ts"]);
});
