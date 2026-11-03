import { test } from "node:test";
import assert from "node:assert/strict";
import type { Product, SetInfo } from "@/lib/site-types";
import { buildIndex, looksSealed, matchCard, numberKey, numbersInTitle } from "@/lib/import/match";

// NumberStyle "series" (2026-11-03, BandaiCompare): Fusion World "FB11-084",
// Digimon "BT25-104 SEC" and Union Arena "UE24BT/REZ-1-053" in one index.
// Numbers and names are TCGplayer's (categories 80, 63, 81).
const set = (id: number, name: string, code: string): SetInfo => ({ id, name, code, slug: String(id), releasedOn: "2026-01-01", productCount: 1, upcoming: false });
const card = (id: number, name: string, number: string, setId: number, rarity: string): Product => ({ id, slug: String(id), name, kind: "card", setId, number, rarity, attrs: {}, sealedType: null, image: null, tcgUrl: "", printings: [] });

const sets = [set(1, "UE24BT: Re:ZERO -Starting Life in Another World-", "UE24BT"), set(2, "Brightness of Hope", "FB11"), set(3, "Dual Revolution", "BT25")];
const products = [
  card(10, "Rem (053)", "UE24BT/REZ-1-053", 1, "Super Rare"),
  card(11, "Rem (053) (SR***)", "UE24BT/REZ-1-053", 1, "Super Rare 3-Star"),
  card(12, "Action Point Card (AP05)", "UE24BT/REZ-1-AP05", 1, "Action Point"),
  card(20, "Giblet - FB11-084", "FB11-084", 2, "Super Rare"),
  card(30, "ShineGreymon: Burst Mode // Final Shining Burst", "BT25-104 SEC", 3, "Secret Rare"),
];
const idx = buildIndex(products, sets, "series", {
  rarityMustAgree: true,
  rarityAliases: { "Super Rare 3-Star": ["SR***"], "Super Rare": ["SR"], "Secret Rare": ["SEC"] },
});

test("series numbers: keys for all three games", () => {
  assert.equal(numberKey("UE24BT/REZ-1-053", "series"), "REZ-1-053");
  assert.equal(numberKey("UE24BT/REZ-1-AP05", "series"), "REZ-1-AP05");
  assert.equal(numberKey("FB11-084", "series"), "FB11-084");
  assert.equal(numberKey("BT25-104 SEC", "series"), "BT25-104");
  assert.equal(numberKey("ST24-04 R", "series"), "ST24-004");
  assert.deepEqual(numbersInTitle("Rem (053) (SR***) REZ-1-053 Re:ZERO Union Arena", "series"), ["REZ-1-053"]);
  // A volume is part of the key: "-2-" is another set of the same series.
  assert.notEqual(numberKey("UEX05BT/KMY-2-010", "series"), numberKey("UE05BT/KMY-1-010", "series"));
});

test("series numbers: a store title finds its card, and the star version stays apart", () => {
  assert.equal(matchCard("Rem (053) [UE24BT/REZ-1-053] SR", idx)?.product.id, 10);
  assert.equal(matchCard("Rem (053) (SR***) - REZ-1-053 - Union Arena Re:ZERO", idx)?.product.id, 11);
  assert.equal(matchCard("Giblet - FB11-084 - Brightness of Hope", idx)?.product.id, 20);
  assert.equal(matchCard("ShineGreymon: Burst Mode // Final Shining Burst BT25-104 SEC", idx)?.product.id, 30);
  // Number alone, or a name that disagrees, is no match.
  assert.equal(matchCard("Emilia REZ-1-053", idx), null);
});

test("series numbers: a card code means a single, not sealed", () => {
  assert.equal(looksSealed("Rem (053) REZ-1-053 [Re:ZERO]"), false);
  assert.equal(looksSealed("Re:ZERO -Starting Life in Another World- Booster Box"), true);
});
