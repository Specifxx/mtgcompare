import * as K from "../../src/lib/catalog";
import * as C from "../../src/lib/constants";
import * as fs from "node:fs";
const base = process.env.FIXTURE_BASE ?? "/tmp/claude-0/-home-user/1729fd1a-6a1a-50c2-b66b-ed691e9d9923/scratchpad/port/design/magic-tools";   // singles.json (9.5 MB) lives there, not in the tree
const fx = JSON.parse(fs.readFileSync("tests/fixtures/magic-products.json", "utf8"));
const groups = JSON.parse(fs.readFileSync("tests/fixtures/tcgcsv-groups.json", "utf8"));
let bad = 0;
for (const g of groups) { if (C.classifyGroup(g) !== g.kind) { bad++; } }
console.log("classifyGroup mismatches", bad, "of", groups.length);
const incl = groups.filter((g: any) => g.kind !== "foreign" && g.kind !== "non-card");
const toks = K.chooseSetToks(incl.map((g: any) => ({ groupId: g.groupId, abbreviation: g.abbreviation, kind: g.kind })), new Map());
console.log("tokens", toks.size, "distinct", new Set(toks.values()).size, toks.get(23165), toks.get(23166), toks.get(22979), toks.get(23109));
let fb = 0;
for (const f of fx) { const tok = toks.get(f.groupId)!; const slug = f.expect.cls === "sealed" ? K.sealedSlugOf(f.name, f.productId, false) : K.slugBase({ productId: f.productId, name: f.name, number: f.tcgNumber }, tok); if (slug !== f.expect.slug) { fb++; console.log("SLUG MISMATCH", f.productId, slug, f.expect.slug); }
  if (f.expect.cls !== "sealed") { const num = (f.scryfall ?? []).map((r: any) => r.cn).sort((a: string, b: string) => Number(/[★†]/.test(a)) - Number(/[★†]/.test(b)))[0] ?? f.tcgNumber; const n = C.nkey(num); const s = C.nsort(num);
    if (n !== (f.expect.nkey || null) || s !== f.expect.nsort) { fb++; console.log("NKEY/NSORT MISMATCH", f.productId, num, n, s, f.expect.nkey, f.expect.nsort); } } }
console.log("fixture mismatches", fb, "of", fx.length);
const singles = JSON.parse(fs.readFileSync(base + "/ts-check/singles.json", "utf8"));
const seen = new Map<string, number[]>();
for (const p of singles.sort((a: any, b: any) => a.productId - b.productId)) { const s = K.slugBase(p, toks.get(p.gid)!); const l = seen.get(s); if (l) l.push(p.productId); else seen.set(s, [p.productId]); }
console.log("singles", singles.length, "distinct", seen.size, "colliding", [...seen].filter(([, v]) => v.length > 1).length);
console.log(K.finishPrices([{ productId: 1, lowPrice: 0.5, marketPrice: 10, subTypeName: "Normal" }, { productId: 1, lowPrice: 3, marketPrice: null, subTypeName: "Foil" }, { productId: 1, lowPrice: 1, marketPrice: 1, subTypeName: "Etched" }]));
console.log(K.productClass({ name: "Treasure Token (2018 Lunar New Year Promo)", rarity: "T" }, "promo", null), K.productClass({ name: "Rules Card (WAR Bundle)", rarity: "T" }, "promo", null), K.productClass({ name: "Foo Art Card (2/54)", rarity: "S" }, "art-series", null));
// critique 12: ligatures. NFKD does not decompose Æ, Œ, ß, Ø, Đ, Ł; they are transliterated first, so oracle hub URLs are readable.
const lig = [K.slugify("Æther Vial"), K.slugify("Ætherling"), K.slugify("Æther Flash"), K.slugify("Lim-Dûl's Vault"), K.slugify("Jötun Grunt"), K.slugify("Œuvre"), K.slugify("Straße"), K.slugify("Łódź"), K.slugify("Fire // Ice"), K.slugify("Sol Ring")];
const wantLig = ["aether-vial", "aetherling", "aether-flash", "lim-duls-vault", "jotun-grunt", "oeuvre", "strasse", "lodz", "fire-ice", "sol-ring"];
if (JSON.stringify(lig) !== JSON.stringify(wantLig)) { console.log("LIGATURE SLUG MISMATCH", lig); process.exitCode = 1; }
console.log("oracle slugs:", K.oracleSlugOf({ id: "0123456789abcdef", name: "Æther Vial" }, false), K.oracleSlugOf({ id: "0123456789abcdef", name: "Æther Vial" }, true));
