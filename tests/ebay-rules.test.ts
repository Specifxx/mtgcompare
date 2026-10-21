import { test } from "node:test";
import assert from "node:assert/strict";
import { refusedForType, refusedListing } from "../src/lib/ebay-rules";
import type { TypeKey } from "../src/lib/sealed-title";

// The product's eBay listings sit at the TOP of its price list, lowest price first, so a part, a single card or the wrong variant
// would lead the page. The "kept" titles are real store and TCGplayer titles (read 2026-10-21), which eBay sellers copy; the
// "refused" ones are those titles with the wording sellers add for a lot, a part, a single or another edition. No live eBay read
// was made for these tests (eBay is called only from the import workflow, never from a test).
const refused = (t: string, type: TypeKey) => refusedListing(t) || refusedForType(t, type);

test("kept: ordinary sealed listings of each type", () => {
  for (const [t, type] of [
    ["Magic: The Gathering - Bloomburrow Play Booster Box", "play-booster-box"],
    ["Reality Fracture - Play Booster Display", "play-booster-box"],
    ["Star Trek - Collector Booster Display", "collector-booster-box"],
    ["Magic: The Gathering - Lord of the Rings Collector Booster Box Case", "collector-booster-box-case"],
    ["The Hobbit - Play Booster Display Case", "play-booster-box-case"],
    ["Magic: The Gathering Final Fantasy Bundle", "bundle"],
    ["Magic: The Gathering Final Fantasy Gift Bundle", "gift-bundle"],
    ["The Hobbit - Play Booster Pack", "play-booster"],
    ["Aetherdrift - Collector Booster Pack", "collector-booster"],
    ["Foundations: Commander - Commander Deck - Calling All Angels", "commander-deck"],
    ["Foundations Commander Decks [Set of 5]", "commander-deck-set"],
    ["Secret Lair Drop: Secret Lair x Stardew Valley: Welcome to Stardew Valley - Non-Foil Edition", "secret-lair"],
    ["Secrets of Strixhaven - Prerelease Pack - Silverquill", "prerelease-pack"],
    ["Magic: The Gathering - Bloomburrow Play Booster Box Factory Sealed - Never Opened", "play-booster-box"],
  ] as [string, TypeKey][])
    assert.ok(!refused(t, type), `${type}: ${t}`);
});

test("refused: lots, several units and the set's other products on a single product's page", () => {
  for (const [t, type] of [
    ["Lot of 3 Bloomburrow Play Booster Packs", "play-booster"],
    ["The Hobbit - Play Booster Pack x10", "play-booster"],
    ["5 Bloomburrow Play Boosters Sealed", "play-booster"],
    ["The Hobbit - Play Booster Display", "play-booster"],
    ["Bloomburrow Play Booster Box 2x Sealed", "play-booster-box"],
    ["36 Bloomburrow Play Boosters (loose, from a box)", "play-booster-box"],
    ["Star Trek - Collector Booster Display", "play-booster-box"],
    ["Star Trek - Play Booster Display", "collector-booster-box"],
    ["Aetherdrift - Collector Booster Pack", "play-booster"],
    ["Magic: The Gathering Final Fantasy Gift Bundle", "bundle"],
    ["Magic: The Gathering Final Fantasy Bundle", "gift-bundle"],
    ["Foundations Commander Decks [Set of 5]", "commander-deck"],
    ["Bloomburrow Play Booster Box Case Fresh", "play-booster-box-case"],
    ["Bloomburrow Play Booster Box with acrylic case", "play-booster-box-case"],
    ["Bloomburrow & Duskmourn Play Booster Box", "play-booster-box"],
  ] as [string, TypeKey][])
    assert.ok(refused(t, type), `${type}: ${t}`);
});

test("refused: parts, singles, opened, damaged, random and other languages", () => {
  for (const [t, type] of [
    ["Bloomburrow Bundle Box Only - No Packs", "bundle"],
    ["Bloomburrow Bundle Lands Only", "bundle"],
    ["Sheoldred, the Apocalypse 107/281 pulled from Dominaria United Set Booster Box", "set-booster-box"],
    ["Bloomburrow Play Booster Box PSA 10", "play-booster-box"],
    ["Bloomburrow Play Booster Box OPENED - empty", "play-booster-box"],
    ["Bloomburrow Play Booster Box Damaged Corner", "play-booster-box"],
    ["Random Bloomburrow Commander Deck", "commander-deck"],
    ["The Hobbit - Play Booster Pack - French", "play-booster"],
    ["FINAL FANTASY - Collector Booster Box - Japanese", "collector-booster-box"],
    ["FINAL FANTASY - Collector Booster Sample Pack", "collector-booster"],
    ["The Hobbit - Collector Booster Omega Pack", "collector-booster"],
    ["Magic Star Trek - Prerelease Ticket - 6 November", "prerelease-pack"],
  ] as [string, TypeKey][])
    assert.ok(refused(t, type), `${type}: ${t}`);
});
