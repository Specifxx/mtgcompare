import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assignSlugs,
  classifyPrinting,
  eventTag,
  foldNameAliases,
  parseCard,
  pickPrice,
  plausibleLow,
  sealedKind,
  sealedPackCount,
  setDisplayName,
  setKind,
  setSlug,
  variantTokens,
  type TcgcsvProduct,
} from "../src/lib/catalog";

const card = (name: string, ext: Record<string, string>, id = 1, groupId = 3188): TcgcsvProduct => ({
  productId: id,
  name,
  imageUrl: "x",
  imageCount: 1,
  groupId,
  url: "",
  extendedData: Object.entries(ext).map(([name, value]) => ({ name, value })),
});

test("set kinds from TCGplayer group codes", () => {
  assert.equal(setKind({ name: "Romance Dawn", abbreviation: "OP01" }), "booster");
  assert.equal(setKind({ name: "Adventure on Kami's Island", abbreviation: "OP15-EB04" }), "booster");
  assert.equal(setKind({ name: "Extra Booster: Memorial Collection", abbreviation: "EB-01" }), "extra");
  assert.equal(setKind({ name: "Premium Booster -The Best-", abbreviation: "PRB-01" }), "premium");
  assert.equal(setKind({ name: "ST-01: Starter Deck 1 Straw Hat Crew", abbreviation: "ST-01" }), "starter");
  assert.equal(setKind({ name: "One Piece Promotion Cards", abbreviation: "OP-PR" }), "promo");
  assert.equal(setKind({ name: "Paramount War Pre-Release Cards", abbreviation: "OP02 PRE" }), "event");
  assert.equal(setKind({ name: "Royal Blood Release Event Cards", abbreviation: "OP10 RE" }), "event");
  assert.equal(setKind({ name: "Revision Pack Cards", abbreviation: "OP-RP" }), "collection");
});

test("set names and slugs read the way players write them", () => {
  assert.equal(setDisplayName({ name: "ST-01: Starter Deck 1 Straw Hat Crew" }), "Starter Deck 1: Straw Hat Crew");
  assert.equal(setSlug({ name: "Romance Dawn", abbreviation: "OP01", groupId: 3188 }), "op01-romance-dawn");
});

test("event groups stamp their prints", () => {
  assert.equal(eventTag({ name: "Paramount War Pre-Release Cards", abbreviation: "OP02 PRE" }), "Pre-Release");
  assert.equal(eventTag({ name: "ST-01: Starter Deck 1 Straw Hat Crew (Super Pre-Release Edition)", abbreviation: "ST-01 PRE" }), "Super Pre-Release");
  assert.equal(eventTag({ name: "Royal Blood Release Event Cards", abbreviation: "OP10 RE" }), "Release Event");
  assert.equal(eventTag({ name: "Awakening of the New Era: 1st Anniversary Tournament Cards", abbreviation: "OP05 ANN" }), "1st Anniversary Tournament");
  assert.equal(eventTag({ name: "Romance Dawn", abbreviation: "OP01" }), null);
});

test("variant tokens drop number disambiguators", () => {
  assert.deepEqual(variantTokens("Monkey.D.Luffy (003) (Parallel)", "OP01-003"), ["Parallel"]);
  assert.deepEqual(variantTokens("Loki (OP17-119) (Alternate Art)", "OP17-119"), ["Alternate Art"]);
  assert.deepEqual(variantTokens("Franky (Tournament Pack Vol. 2) [Winner]", "OP01-021"), ["Tournament Pack Vol. 2", "Winner"]);
  assert.deepEqual(variantTokens("Nami", "OP01-016"), []);
});

test("printings are classified from tokens and rarity", () => {
  const c = (tokens: string[], rarity: string | null = "SR", cardType: string | null = "Character") => classifyPrinting({ tokens, rarity, cardType });
  assert.equal(c([]), "standard");
  assert.equal(c(["Parallel"]), "alt");
  assert.equal(c(["Alternate Art"]), "alt");
  assert.equal(c(["Parallel", "Manga", "Alternate Art"], "SEC"), "manga");
  assert.equal(c(["SP"]), "sp");
  assert.equal(c([], "TR"), "treasure");
  assert.equal(c(["Jolly Roger Foil"]), "foil");
  assert.equal(c(["Reprint"]), "reprint");
  assert.equal(c(["Judge"], "PR"), "promo");
  assert.equal(c(["Box Topper"], "C"), "promo");
  assert.equal(c([], "DON!!", "DON!!"), "don");
});

test("parseCard reads One Piece card fields", () => {
  const p = card("Monkey.D.Luffy (003) (Parallel)", {
    Number: "OP01-003",
    Rarity: "L",
    Color: "Green;Red",
    CardType: "Leader",
    Life: "4",
    Power: "5000",
    Subtypes: "Straw Hat Crew;Supernovas",
    Attribute: "Strike",
    Description: 'Text <em>(reminder)</em><br><br><a href="x">This card has been officially errata\'d.</a>',
  });
  const c = parseCard(p, "OP01", { name: "Romance Dawn", abbreviation: "OP01" });
  assert.equal(c.name, "Monkey.D.Luffy");
  assert.equal(c.variant, "Parallel");
  assert.equal(c.printing, "alt");
  assert.deepEqual(c.colors, ["Green", "Red"]);
  assert.equal(c.life, 4);
  assert.equal(c.power, 5000);
  assert.equal(c.effect, "Text (reminder)");
  assert.equal(c.slugBase, "monkey-d-luffy-op01-003-parallel");
});

test("treasure rares without a token still get a variant", () => {
  const c = parseCard(card("Roronoa Zoro (OP13-037)", { Number: "OP13-037", Rarity: "TR", CardType: "Character" }), "OP13", { name: "Carrying On His Will", abbreviation: "OP13" });
  assert.equal(c.printing, "treasure");
  assert.equal(c.variant, "Treasure Rare");
});

test("release-event prints are told apart from the main-set card", () => {
  const c = parseCard(card("Curiel", { Number: "OP16-004", Rarity: "C", CardType: "Character" }), "OP16 RE", { name: "The Time of Battle Release Event Cards", abbreviation: "OP16 RE" });
  assert.equal(c.variant, "Release Event");
  assert.notEqual(c.slugBase, "curiel-op16-004");
});

test("DON!! cards keep their character and finish", () => {
  const c = parseCard(card("DON!! Card (Alternate Art) (Luffy and Loki) (Gold)", { Rarity: "DON!!", CardType: "DON!!" }), "OP17");
  assert.equal(c.name, "DON!! Card");
  assert.equal(c.variant, "Luffy and Loki · Gold");
  assert.equal(c.printing, "don");
  assert.equal(c.slugBase, "don-card-op17-luffy-and-loki-gold");
});

test("sealed kinds", () => {
  assert.equal(sealedKind("Romance Dawn - Booster Box (Wave 1 - Blue)"), "Booster Box");
  assert.equal(sealedKind("Romance Dawn - Booster Box Case (Wave 2 - White)"), "Booster Case");
  assert.equal(sealedKind("Two Legends - Sleeved Booster Pack"), "Sleeved Booster Pack");
  assert.equal(sealedKind("Royal Blood Booster Pack"), "Booster Pack");
  assert.equal(sealedKind("Extra Booster: Anime 25th Collection Box"), "Booster Box");
  assert.equal(sealedKind("Starter Deck 6: Absolute Justice"), "Starter Deck");
  assert.equal(sealedKind("Starter Deck 6: Absolute Justice Display Case"), "Display Case");
  assert.equal(sealedKind("Double Pack Set Volume 2 Display"), "Display");
  assert.equal(sealedKind("Tournament Pack Vol. 1"), "Promo Pack");
  assert.equal(sealedKind("Premium Card Collection -Uta-"), "Premium Collection");
  assert.equal(sealedKind("Starter Decks 1-4 [Set of 4]"), null);
});

test("pack counts only where certain", () => {
  assert.equal(sealedPackCount("Booster Box", "booster"), 24);
  assert.equal(sealedPackCount("Booster Box", "extra"), null);
  assert.equal(sealedPackCount("Double Pack Set", null), 2);
});

test("prices: the market-priced subtype wins; implausible lows are dropped", () => {
  const p = pickPrice([
    { productId: 1, lowPrice: 0.5, marketPrice: null, subTypeName: "Normal" },
    { productId: 1, lowPrice: 9.5, marketPrice: 10, subTypeName: "Foil" },
  ]);
  assert.deepEqual(p, { lowCents: 950, marketCents: 1000, finish: "Foil" });
  assert.equal(plausibleLow(100, 1000), null);
  assert.equal(plausibleLow(1, 50), 1);
});

test("slugs are stable and unique", () => {
  const existing = new Map([[5, "nami-op01-016"]]);
  const out = assignSlugs([{ id: 5, slugBase: "nami-op01-016" }, { id: 9, slugBase: "nami-op01-016" }, { id: 3, slugBase: "zoro" }], existing);
  assert.equal(out.get(5), "nami-op01-016");
  assert.equal(out.get(9), "nami-op01-016-9");
  assert.equal(out.get(3), "zoro");
});

test("a character alias in parentheses is part of the name, a box topper is not", () => {
  const sets = new Map([[1, "OP01"], [2, "OP09"], [3, "PRB-02"], [4, "OP09 RE"]]);
  const cards = [
    parseCard(card("Mr.3 (Galdino)", { Number: "OP09-056", Rarity: "UC", CardType: "Character" }, 1, 2), "OP09"),
    parseCard(card("Mr.3(Galdino) - OP09-056 (Reprint)", { Number: "OP09-056", Rarity: "UC", CardType: "Character" }, 2, 3), "PRB-02"),
    parseCard(card("Mr.3 (Galdino)", { Number: "OP09-056", Rarity: "UC", CardType: "Character" }, 3, 4), "OP09 RE", { name: "Emperors in the New World Release Event Cards", abbreviation: "OP09 RE" }),
    parseCard(card("Cavendish", { Number: "OP01-008", Rarity: "R", CardType: "Character" }, 4, 1), "OP01"),
    parseCard(card("Cavendish (Box Topper)", { Number: "OP01-008", Rarity: "R", CardType: "Character" }, 5, 1), "OP01"),
  ].map((c, i) => ({ ...c, setId: [2, 3, 4, 1, 1][i] }));
  assert.equal(cards[0].printing, "promo"); // what it was: "(Galdino)" read as a tag
  foldNameAliases(cards, (id) => sets.get(id) ?? "");
  assert.deepEqual([cards[0].name, cards[0].variant, cards[0].printing], ["Mr.3 (Galdino)", null, "standard"]);
  assert.deepEqual([cards[1].name, cards[1].variant, cards[1].printing], ["Mr.3 (Galdino)", "Reprint", "reprint"]);
  assert.deepEqual([cards[2].name, cards[2].variant], ["Mr.3 (Galdino)", "Release Event"]);
  assert.equal(cards[0].slugBase, "mr-3-galdino-op09-056");
  assert.deepEqual([cards[4].name, cards[4].variant, cards[4].printing], ["Cavendish", "Box Topper", "promo"]);
});

test("coloured and Super Leader alternate arts are alternate arts", () => {
  for (const t of ["Red Super Alternate Art", "Super Leader Alternate Art"]) {
    assert.equal(classifyPrinting({ tokens: [t], rarity: "SEC", cardType: "Character" }), "alt");
  }
});
