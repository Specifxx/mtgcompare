// Real store titles and what identify() must make of them. Read 2026-10-21 from Good Games (AU), The Games Capital (AU), GAP Games
// (AU), Metro Hobbies (AU), Face to Face Games (CA) and TCGplayer's sealed catalogue (productLineName "magic"). Wrong merges are the
// expensive failure, so many of these assert that two different products do NOT share a groupKey.
import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalName, classify, cleanName, detectSet, floorCents, identify, isIdentity, PRODUCT_TYPES, titleCase, TYPE_BY_SLUG } from "../src/lib/sealed-title";
import { SETS, SET_BY_CODE } from "../src/lib/sets";

function key(title: string, strict = false): string {
  const id = identify(title, { strict });
  return isIdentity(id) ? id.groupKey : `REJECT:${id}`;
}

test("set products group by set + type across store wordings", () => {
  for (const t of ["Bloomburrow - Play Booster Box", "Magic: The Gathering - Bloomburrow Play Booster Box", "Bloomburrow - Play Booster Display"]) assert.equal(key(t), "blb|play-booster-box", t);
  for (const t of ["Magic: The Gathering - Foundations Play Booster Display", "Foundations - Play Booster Box"]) assert.equal(key(t), "fdn|play-booster-box", t);
  assert.equal(key("Magic Reality Fracture - Play Booster Display"), "fra|play-booster-box");
  assert.equal(key("Magic: The Gathering - Outlaws of Thunder Junction Collector Booster Box"), "otj|collector-booster-box");
  assert.equal(key("Star Trek - Collector Booster Display"), "trk|collector-booster-box");
  assert.equal(key("Magic: The Gathering Final Fantasy Bundle"), "fin|bundle");
  assert.equal(key("FINAL FANTASY - Bundle"), "fin|bundle");
  assert.equal(key("The Hobbit - Play Booster Pack"), "hob|play-booster");
  assert.equal(key("Magic: The Gathering - Bloomburrow Play Booster"), "blb|play-booster");
  assert.equal(key("Outlaws of Thunder Junction Play Booster (In sleeve)"), "otj|play-booster");
  assert.equal(key("Reality Fracture - Sleeved Play Booster"), "fra|play-booster");
  assert.equal(key("Aetherdrift - Collector Booster Pack"), "dft|collector-booster");
  assert.equal(key("Magic: The Gathering - Foundations Collector Booster"), "fdn|collector-booster");
  assert.equal(key("Star Trek - Draft Night"), "trk|draft-night");
  assert.equal(key("Magic: The Gathering - The Hobbit Draft Night"), "hob|draft-night");
});

test("Universes Beyond sets are Magic: Final Fantasy, Spider-Man, Avatar, Star Trek, the Lord of the Rings, Doctor Who, Fallout, Warhammer, Assassin's Creed", () => {
  assert.equal(key("Magic: The Gathering Final Fantasy Play Booster Box"), "fin|play-booster-box");
  assert.equal(key("Magic: The Gathering Spider-Man Play Booster Box"), "spm|play-booster-box");
  assert.equal(key("Marvel's Spider-Man - Play Booster Box"), "spm|play-booster-box");
  assert.equal(key("Avatar: The Last Airbender - Play Booster Box"), "tla|play-booster-box");
  assert.equal(key("Star Trek - Play Booster Display"), "trk|play-booster-box");
  assert.equal(key("Magic: The Gathering - Lord of the Rings Collector Booster Box"), "ltr|collector-booster-box");
  assert.equal(key("Universes Beyond: Doctor Who - Commander Deck - Timey Whimey"), "commander-deck|who|timey-whimey");
  assert.equal(key("Magic: The Gathering - Universes Beyond Fallout Collector Booster Box"), "pip|collector-booster-box");
  assert.equal(key("Universes Beyond: Warhammer 40,000 - Commander Deck - Forces of the Imperium"), "commander-deck|40k|forces-imperium");
  assert.equal(key("Magic: The Gathering - Universes Beyond: Assassins Creed Collector Booster Box"), "acr|collector-booster-box");
  assert.equal(key("Magic: The Gathering Teenage Mutant Ninja Turtles Play Booster Box"), "tmt|play-booster-box");
  // In a non-Magic collection a Universes Beyond name alone is not enough, but a Magic-only product word is.
  assert.equal(key("Marvel's Spider-Man - Play Booster Box", true), "spm|play-booster-box");
  assert.equal(key("FINAL FANTASY - Bundle", true), "REJECT:not-magic");
  assert.equal(key("Magic: The Gathering Final Fantasy Bundle", true), "fin|bundle");
});

test("longest set name wins; prefix names match only on their own", () => {
  assert.equal(detectSet("Magic Secrets of Strixhaven - Play Booster Display")?.code, "sos");
  assert.equal(detectSet("Strixhaven: School of Mages Draft Booster Pack")?.code, "stx");
  assert.equal(detectSet("Commander 2021 (Strixhaven) - Commander Deck - Silverquill Statement")?.code, "stx");
  assert.equal(detectSet("Magic: The Gathering - Modern Horizons 3 Play Booster Box")?.code, "mh3");
  assert.equal(detectSet("Modern Horizons 2 - Draft Booster Box")?.code, "mh2");
  assert.equal(detectSet("Double Masters 2022 - Draft Booster Box")?.code, "2x2");
  assert.equal(detectSet("Double Masters Booster Pack")?.code, "2xm");
  assert.equal(detectSet("Magic: The Gathering - Dominaria United Set Booster")?.code, "dmu");
  assert.equal(detectSet("Magic: The Gathering - Dominaria Bundle")?.code, "dom");
  assert.equal(detectSet("Magic: The Gathering - Foundations Jumpstart Booster Box")?.code, "j25");
  assert.equal(detectSet("Jumpstart Booster Pack")?.code, "jmp");
  assert.equal(detectSet("March of the Machine: The Aftermath - Collector Booster Box")?.code, "mat");
  assert.equal(detectSet("March of the Machine - Collector Booster Box")?.code, "mom");
  assert.equal(detectSet("Commander Legends: Battle for Baldur's Gate - Draft Booster Box")?.code, "clb");
  assert.equal(detectSet("Commander Legends Collector Booster Pack")?.code, "cmr");
  assert.equal(detectSet("Magic: The Gathering - Lord of the Rings Tales of MiddleEarth Prerelease Pack")?.code, "ltr");
  assert.equal(detectSet("Magic The Hobbit - Bundle")?.code, "hob");
  assert.equal(detectSet("Magic: the Gathering The Brothers War Prerelease Packs (Pair)")?.code, "bro");
  // Pre-2018 sets are not in the list: their names must not fall into a newer set's.
  assert.equal(detectSet("Ixalan Booster Box"), null);
  assert.equal(detectSet("Innistrad Booster Pack"), null);
  assert.equal(detectSet("Theros Booster Pack"), null);
});

test("a bare 'Booster Box' is read through the set's booster lines, and refused when the set had two", () => {
  // Play Booster era: the only main line.
  assert.equal(key("Magic: The Gathering - Duskmourn: House of Horror Play Booster Box"), "dsk|play-booster-box");
  // 2018–2019: Draft Boosters only.
  assert.equal(key("War of the Spark Booster Box"), "war|draft-booster-box");
  assert.equal(key("Ultimate Masters Booster Box"), "uma|draft-booster-box");
  assert.equal(key("Masters 25 Booster Pack"), "a25|draft-booster");
  assert.equal(key("Throne of Eldraine Booster Box"), "eld|draft-booster-box", "Eldraine sold no Set Boosters");
  // Zendikar Rising to Lost Caverns: Draft AND Set Boosters. Which one? Refused.
  assert.equal(key("Zendikar Rising Booster Box"), "REJECT:vague");
  assert.equal(key("Zendikar Rising Collector Booster Box"), "znr|collector-booster-box");
  assert.equal(key("Innistrad: Crimson Vow - Set Booster Box"), "vow|set-booster-box");
  assert.equal(key("Innistrad: Crimson Vow - Draft Booster Box"), "vow|draft-booster-box");
  assert.notEqual(key("Modern Horizons 2 - Draft Booster Box"), key("Modern Horizons 2 - Set Booster Box"));
  // A line the set never had is a mis-listing (Assassin's Creed sold Beyond Boosters and Collector Boosters only).
  assert.equal(key("Assassin's Creed - Beyond Booster Box"), "REJECT:vague");
  // Jumpstart displays are their own product whatever else the set sold.
  assert.equal(key("Magic: The Gathering - Marvel Super Heroes - Jumpstart Booster Box"), "msh|jumpstart-booster-box");
  assert.equal(key("Magic: The Gathering - Lord of the Rings Jumpstart Booster Box"), "ltr|jumpstart-booster-box");
  assert.equal(key("Jumpstart Booster Pack"), "jmp|jumpstart-booster");
});

test("a play box, a collector box, a pack and a case of the same set never merge", () => {
  const keys = [
    "The Hobbit - Play Booster Display",
    "The Hobbit - Collector Booster Display",
    "The Hobbit - Play Booster Pack",
    "The Hobbit - Collector Booster Pack",
    "The Hobbit - Play Booster Display Case",
    "Reality Fracture - Collector Booster Display Case",
    "The Hobbit - Bundle",
    "The Hobbit - Gift Bundle",
    "The Hobbit - Draft Night",
    "The Hobbit - Prerelease Pack",
  ].map((t) => key(t));
  assert.equal(new Set(keys).size, keys.length, keys.join("\n"));
  assert.equal(key("The Hobbit - Play Booster Display Case"), "hob|play-booster-box-case");
  assert.equal(key("Magic: The Gathering - Lord of the Rings Collector Booster Box Case"), "ltr|collector-booster-box-case");
});

test("variant boxes with other contents are never the set's box", () => {
  assert.equal(key("Magic: The Gathering - The Lord of the Rings: Tales of Middle-earth Special Edition Collector Booster Box"), "REJECT:unclassified");
  assert.equal(key("Double Masters 2022 - VIP Collector Booster Box"), "REJECT:unclassified");
  assert.equal(key("Magic: The Gathering - VIP Double Masters Booster"), "REJECT:unclassified");
  assert.equal(key("Magic The Gathering - Phyrexia All Will Be One - Collector Booster Omega Box"), "REJECT:not-sealed");
  assert.equal(key("Reality Fracture - Collector Booster Omega Pack"), "REJECT:not-sealed");
  assert.equal(key("FINAL FANTASY - Collector Booster Sample Pack"), "REJECT:not-sealed");
  assert.equal(key("The Hobbit - Box Topper"), "REJECT:not-sealed");
});

test("Bundles: the Bundle, the Gift Bundle and a set's named bundles are three kinds of product", () => {
  assert.equal(key("Magic: The Gathering Final Fantasy Gift Bundle"), "fin|gift-bundle");
  assert.equal(key("FINAL FANTASY - Bundle - Gift Edition"), "fin|gift-bundle");
  assert.equal(key("Magic: The Gathering - Modern Horizons 3 Gift Bundle"), key("Modern Horizons 3 - Bundle - Gift Edition"));
  assert.equal(key("Secrets of Strixhaven - Codex Bundle"), "special-bundle|sos|codex");
  assert.equal(key("Magic: The Gathering - Secrets of Strixhaven Codex Bundle"), "special-bundle|sos|codex");
  assert.equal(key("Duskmourn: House of Horror - Nightmare Bundle"), "special-bundle|dsk|nightmare");
  assert.equal(key("Star Trek - Beam Me Up Bundle"), "special-bundle|trk|beam-me");
  assert.equal(key("FINAL FANTASY - Chocobo Bundle"), "special-bundle|fin|chocobo");
  assert.equal(key("Reality Fracture - Secret Lair Bundle"), "special-bundle|fra|lair-secret", "a set's Secret Lair Bundle is a bundle, not a drop");
  assert.equal(key("Magic: The Gathering Aetherdrift Finish Line Bundle"), key("Aetherdrift - Finish Line Bundle"));
  assert.notEqual(key("Magic: The Gathering Teenage Mutant Ninja Turtles Pizza Bundle"), key("Magic Teenage Mutant Ninja Turtles - Turtle Team-Up Bundle"));
  assert.notEqual(key("Teenage Mutant Ninja Turtles - Pizza Bundle"), "tmt|bundle");
  // The Fat Pack is the Bundle's old name.
  assert.equal(key("Magic: The Gathering - Hour of Devastation Fat Pack"), "REJECT:no-set");
});

test("Commander decks: one product per deck, the Collector's Edition apart, the set's decks together a product of their own", () => {
  const a = key("FINAL FANTASY: Commander - Commander Deck - VII Limit Break");
  assert.equal(a, "commander-deck|fin|break-limit-vii");
  assert.equal(key("FINAL FANTASY Commander Deck - FINAL FANTASY VII Limit Break"), a, "TCGplayer's wording");
  const ce = key("FINAL FANTASY: Commander - Commander Deck: Collector's Edition - VII Limit Break");
  assert.equal(ce, "commander-deck|fin|break-collector-limit-vii");
  assert.notEqual(ce, a);
  assert.equal(key("Modern Horizons 3: Commander - Commander Deck - Creative Energy - Collector's Edition"), "commander-deck|mh3|collector-creative-energy");
  assert.notEqual(key("FINAL FANTASY: Commander - Commander Deck - XIV Scions & Spellcraft"), a);
  assert.equal(key("Foundations: Commander - Commander Deck - Calling All Angels"), key("Foundations Commander Deck - Calling All Angels"));
  assert.equal(key("Magic Edge of Eternities - Commander Deck World Shaper"), key("Edge of Eternities Commander Deck - World Shaper"));
  assert.equal(key("Universes Beyond: Fallout - Mutant Menace Commander Deck"), "commander-deck|pip|menace-mutant");
  assert.equal(key("Commander Masters - Commander Deck - Eldrazi Unbound"), "commander-deck|cmm|eldrazi-unbound");
  assert.equal(key("Commander 2019 - Commander Deck - Merciless Rage"), "commander-deck|c19|merciless-rage");
  assert.equal(key("Magic: The Gathering - Commander 2019 Deck - Mystic Intellect"), "commander-deck|c19|intellect-mystic");
  assert.equal(key("Commander 2020 - Commander Deck - Enhanced Evolution"), "commander-deck|iko|enhanced-evolution");
  // A deck that names no deck is any of the set's four or five.
  assert.equal(key("Magic: The Gathering - Bloomburrow Commander Deck"), "REJECT:vague");
  assert.equal(key("Magic Reality Fracture - Commander Deck"), "REJECT:vague");
  // The set of decks: TCGplayer's "[Set of 5]" and the stores' "- Set of 5".
  assert.equal(key("Foundations Commander Decks [Set of 5]"), "fdn|commander-deck-set");
  assert.equal(key("Foundations: Commander - Commander Deck - Set of 5"), "fdn|commander-deck-set");
  assert.equal(key("Star Trek: Commander - Commander Decks - Set of 4"), "trk|commander-deck-set");
  // …but never the Collector's Editions together, a display, a case, a pair or a combo.
  assert.equal(key("Marvel Super Heroes: Commander - Commander Decks: Collector's Edition - Set of 4"), "REJECT:unclassified");
  assert.equal(key("Magic: The Gathering - Murders at Karlov Manor Commander Deck Display"), "REJECT:unclassified");
  assert.equal(key("Reality Fracture Commander Deck - Multiverse Reforged Case"), "REJECT:unclassified");
  assert.equal(key("Magic Edge of Eternities - Commander Deck Pair"), "REJECT:multiple");
  assert.equal(key("Magic: The Gathering Lorwyn Eclipsed Commander Deck Combo"), "REJECT:multiple");
  // Older Commander lines than the list holds are refused, not filed under a newer set.
  assert.equal(key("Magic The Gathering - Commander 2017 Commander Deck - Vampiric Bloodlust"), "REJECT:no-set");
});

test("Prerelease Packs: one per set, or one per faction when the set has several", () => {
  assert.equal(key("Magic: The Gathering - Murders at Karlov Manor Pre Release Kit"), "prerelease-pack|mkm|");
  assert.equal(key("Murders at Karlov Manor - Prerelease Pack"), "prerelease-pack|mkm|");
  const colleges = ["Lorehold", "Prismari", "Quandrix", "Silverquill", "Witherbloom"].map((c) => key(`Secrets of Strixhaven - Prerelease Pack - ${c}`));
  assert.equal(new Set(colleges).size, 5);
  assert.equal(colleges[3], "prerelease-pack|sos|silverquill");
  assert.notEqual(key("Magic: The Gathering - Secrets of Strixhaven Prerelease Pack"), colleges[0]);
  // An event ticket, a prerelease playmat or a pair of packs is not a Prerelease Pack.
  assert.equal(key("Magic Star Trek - Prerelease Ticket - 6 November"), "REJECT:not-sealed");
  assert.equal(key("Magic: The Gathering Murders at Karlov Manor Pre Release Playmat"), "REJECT:accessory");
  assert.equal(key("Magic the Gathering The Brothers War Prerelease Packs (Pair)"), "REJECT:multiple");
});

test("Scene Boxes, Starter Kits and Beginner Boxes", () => {
  assert.equal(key("FINAL FANTASY - Scene Box - Camp Comrades"), "scene-box|fin|camp-comrades");
  assert.notEqual(key("FINAL FANTASY - Scene Box - Camp Comrades"), key("FINAL FANTASY - Scene Box - Children of Fate"));
  assert.equal(key("The Hobbit Scene Box - Treasures of Smaug"), key("Magic: The Gathering - The Hobbit Scene Box - Treasures of Smaug"));
  assert.equal(key("Magic The Hobbit - Scene Box Display"), "REJECT:unclassified");
  assert.equal(key("Magic: The Gathering - The Hobbit Scene Box Combo"), "REJECT:multiple");
  assert.equal(key("Star Trek - Scene Boxes - Set of 2"), "REJECT:multiple");
  assert.equal(key("Foundations - Beginner Box"), "starter|fdn|beginner");
  assert.equal(key("Foundations - Starter Collection"), "starter|fdn|collection");
  assert.equal(key("Magic: The Gathering - Bloomburrow Starter Kit"), "starter|blb|kit");
  assert.equal(new Set([key("Foundations - Beginner Box"), key("Foundations - Starter Collection")]).size, 2);
  assert.equal(key("Magic: The Gathering - Starter Kit 2023"), "starter|-|2023-kit");
  assert.notEqual(key("Magic the Gathering - Starter Kit 2022"), key("Magic: The Gathering - Starter Kit 2023"));
});

test("Secret Lair drops: by name, foil and non-foil apart, volumes apart, never filed under a set they mention", () => {
  const foil = key("Secret Lair Drop Series - Secret Lair x Marvel's Black Panther - Foil Edition");
  const plain = key("Secret Lair Drop Series - Secret Lair x Marvel's Black Panther");
  assert.equal(foil, "secret-lair|-|black-foil-marvel-panther");
  assert.notEqual(foil, plain);
  assert.equal(key("Secret Lair Drop: Secret Lair x Stardew Valley: Welcome to Stardew Valley - Traditional Foil Edition"), "secret-lair|-|foil-stardew-valley-welcome");
  assert.equal(key("Secret Lair Drop: Secret Lair x Stardew Valley: Welcome to Stardew Valley - Non-Foil Edition"), "secret-lair|-|nonfoil-stardew-valley-welcome");
  assert.equal(key("Magic Secret Lair x God of War: Greek"), key("Secret Lair Drop Series - Secret Lair x God of War: Greek"));
  assert.notEqual(key("Magic Secret Lair x God of War: Greek"), key("Magic Secret Lair x God of War: Norse"));
  assert.notEqual(
    key("Secret Lair Drop Series - Secret Lair x Monty Python and the Holy Grail: Vol. 1"),
    key("Secret Lair Drop Series - Secret Lair x Monty Python and the Holy Grail: Vol. 2"),
  );
  assert.notEqual(key("Magic Secret Lair x The Last of Us: Part II"), key("Secret Lair Drop Series - Secret Lair x The Last of Us Part I"));
  // "Secret Lair x Final Fantasy", "x Fallout", "x The Hobbit": a drop, not the set.
  assert.equal(identify("Secret Lair Drop: Secret Lair x Fallout: Rad - Traditional Foil Edition", {}) && key("Secret Lair Drop: Secret Lair x Fallout: Rad - Traditional Foil Edition").split("|")[1], "-");
  assert.equal(key("Secret Lair Drop: Secret Lair x The Hobbit: Desolation - Traditional Foil Edition").split("|")[0], "secret-lair");
  assert.equal(key("Secret Lair Commander Deck: Odds and Ends"), "secret-lair|-|ends-odds");
  // Japanese-language drops are another edition.
  assert.equal(key("Secret Lair Drop Series - Secret Lair x Hatsune Miku: Winter Diva - Japanese"), "REJECT:foreign");
});

test("other decks and collections: Duel Decks, Starter Commander decks, theme decks, From the Vault, Commander Collection", () => {
  assert.equal(key("Duel Decks: Jace vs. Vraska"), key("Magic: The Gathering - Duel Deck Jace Vs Vraska"));
  assert.equal(key("Starter Commander Deck - First Flight"), key("Starter Commander Decks - Commander Deck - First Flight"));
  assert.notEqual(key("Starter Commander Deck - First Flight"), key("Starter Commander Deck - Grave Danger"));
  assert.equal(key("Secrets of Strixhaven - 60-Card Theme Deck - Eerie"), key("Magic: The Gathering - Secrets of Strixhaven Theme Deck - Eerie"));
  assert.equal(key("Secrets of Strixhaven - 60-Card Theme Decks - Set of 2"), "REJECT:multiple");
  assert.equal(key("Commander Collection: Green"), key("Magic: The Gathering - Commander Collection: Green"));
  assert.notEqual(key("Commander Collection: Green"), key("Magic: The Gathering - Commander Collection: Green (Foil)"));
  assert.notEqual(key("From the Vault: Angels"), key("From the Vault: Lore"));
});

test("singles, slabs, accessories and store-made products are refused", () => {
  assert.equal(key("Magic the Gathering Spider Man Legends - Agent Anti-Venom"), "REJECT:unclassified");
  assert.equal(key("Sheoldred, the Apocalypse (Borderless) - Dominaria United"), "REJECT:not-sealed");
  assert.equal(key("Black Lotus PSA 9 Alpha"), "REJECT:not-sealed");
  assert.equal(key("Gamermats Avatar: The Last Airbender Playmat"), "REJECT:accessory");
  assert.equal(key("Magic The Gathering - Wall Scroll - Innistrad Crimson Vow V2"), "REJECT:accessory");
  assert.equal(key("Beadle & Grimm's Avatar: The Last Airbender Token Set (MTG)"), "REJECT:accessory");
  assert.equal(key("Magic: The Gathering Good Games Instant Collection – Small (New)"), "REJECT:not-sealed");
  assert.equal(key("Magic: The Gathering Repack Booster"), "REJECT:not-sealed");
  assert.equal(key("Magic: The Gathering - Bloomburrow Play Booster Combo"), "REJECT:multiple");
  assert.equal(key("Magic: The Gathering - Bloomburrow Play Booster Deluxe Combo"), "REJECT:multiple");
  assert.equal(key("Magic The Gatherig Outlaws Of Thunder Junction Play Booster Multipack (3 Booster Packs Per Sleeve)"), "REJECT:multiple");
  assert.equal(key("Magic The Gathering - Ikoria: Lair of Behemoths Complete Set - Factory Sealed (Premium Foiled)"), "REJECT:unclassified");
  assert.equal(key("Magic: the Gathering - Lord of the Rings: Tales of Middle Earth - Holiday Release Jumpstart Boosters Volume 2 Multipack"), "REJECT:multiple");
  // A set's name is not a count: "Masters 25", "Modern Horizons 3".
  assert.equal(key("Masters 25 Booster Pack"), "a25|draft-booster");
  assert.equal(key("Modern Horizons 3 - Play Booster Box"), "mh3|play-booster-box");
});

test("other languages are refused: a language word, a code, another language's product word", () => {
  assert.equal(key("The Hobbit - Play Booster Pack - French"), "REJECT:foreign");
  assert.equal(key("FINAL FANTASY - Collector Booster Box - Japanese"), "REJECT:foreign");
  assert.equal(key("Magic: The Gathering Final Fantasy Collector Booster Pack Japanese"), "REJECT:foreign");
  assert.equal(key("Lorwyn Eclipsed: Commander - Commander Deck - Blight Curse - French"), "REJECT:foreign");
  assert.equal(key("Marvel Super Heroes - Jumpstart Booster Box - French"), "REJECT:foreign");
  assert.equal(key("FINAL FANTASY - Chocobo Bundle - Japanese"), "REJECT:foreign");
  // …but the English one beside it is kept.
  assert.equal(key("Lorwyn Eclipsed: Commander - Commander Deck - Blight Curse"), "commander-deck|ecl|blight-curse");
});

test("other games are refused, including the ones that share a Universes Beyond name", () => {
  assert.equal(key("Pokemon Surging Sparks Booster Box"), "REJECT:not-magic");
  assert.equal(key("Disney Lorcana Archazia's Island Booster Box"), "REJECT:not-magic");
  assert.equal(key("One Piece Card Game OP-09 Booster Box"), "REJECT:not-magic");
  assert.equal(key("Riftbound Origins Booster Display"), "REJECT:not-magic");
  assert.equal(key("Flesh and Blood Rosetta Booster Box"), "REJECT:not-magic");
  assert.equal(key("Final Fantasy TCG Opus XXIII Booster Box"), "REJECT:not-magic");
  assert.equal(key("Final Fantasy Trading Card Game Booster Box"), "REJECT:not-magic");
  assert.equal(key("Magic: The Gathering Final Fantasy Play Booster Box"), "fin|play-booster-box");
});

test("a strict collection needs Magic in the title, or a product word only Magic has", () => {
  assert.equal(key("Bloomburrow Bundle", true), "REJECT:not-magic");
  assert.equal(key("MTG Bloomburrow Bundle", true), "blb|bundle");
  assert.equal(key("Bloomburrow - Play Booster Box", true), "blb|play-booster-box");
  assert.equal(key("Bloomburrow Commander Deck - Family Matters", true), "commander-deck|blb|family-matters");
  assert.equal(key("Secret Lair x Uncharted", true), "secret-lair|-|uncharted");
});

test("store notes and filler never change the identity", () => {
  assert.equal(key("Magic Reality Fracture - Secret Lair Bundle - Pre-Order"), key("Reality Fracture - Secret Lair Bundle"));
  assert.equal(key("Magic: The Gathering - Bloomburrow Bundle | Good Games"), "blb|bundle");
  assert.equal(key("Bloomburrow - Bundle (Pre-Order) [MAX 2 PER CUSTOMER]"), "blb|bundle");
});

test("cleanName drops the lead-in and the store's notes; titleCase keeps the acronyms", () => {
  assert.equal(cleanName("Magic: The Gathering - Secrets of Strixhaven Codex Bundle"), "Secrets of Strixhaven Codex Bundle");
  assert.equal(cleanName("Magic Secret Lair x God of War: Greek"), "Secret Lair x God of War: Greek");
  assert.equal(cleanName("Universes Beyond: Fallout - Mutant Menace Commander Deck"), "Fallout - Mutant Menace Commander Deck");
  assert.equal(cleanName(cleanName("Magic: The Gathering - Secrets of Strixhaven Codex Bundle")), "Secrets of Strixhaven Codex Bundle", "idempotent");
  assert.equal(cleanName("FINAL FANTASY - Scene Box - Camp Comrades"), "FINAL FANTASY - Scene Box - Camp Comrades", "FINAL FANTASY is the set's own capitals");
  assert.equal(titleCase("SECRET LAIR X MTG STARDEW VALLEY"), "Secret Lair x MTG Stardew Valley");
});

test("set product names and slugs come from sets.ts; multi products' from the title", () => {
  const box = identify("Magic: The Gathering - Bloomburrow Play Booster Box");
  assert.ok(isIdentity(box));
  assert.equal(box.name, "Bloomburrow Play Booster Box");
  assert.equal(box.slugBase, "bloomburrow-play-booster-box");
  assert.equal(box.typeLabel, "Play Booster Box");
  const deck = identify("Foundations: Commander - Commander Deck - Calling All Angels");
  assert.ok(isIdentity(deck));
  assert.equal(deck.typeLabel, "Commander Deck");
  assert.equal(deck.name, "Foundations: Commander - Commander Deck - Calling All Angels");
  assert.equal(canonicalName("commander-deck|fdn|all-angels-calling"), null);
});

test("classify, floors and the type list", () => {
  assert.equal(classify("Bloomburrow - Play Booster Box"), "play-booster-box");
  assert.equal(classify("Zendikar Rising Booster Box"), null, "ambiguous line: no type");
  assert.equal(classify("Magic: The Gathering - Lord of the Rings Collector Booster Box Case"), "collector-booster-box-case");
  assert.equal(floorCents("play-booster-box", "US"), 7000);
  assert.equal(floorCents("play-booster-box", "AU"), 10500);
  // Every type has a unique key, label and slug, and a floor.
  for (const f of ["key", "label", "slug"] as const) assert.equal(new Set(PRODUCT_TYPES.map((t) => t[f])).size, PRODUCT_TYPES.length, f);
  for (const t of PRODUCT_TYPES) assert.ok(t.floorUsdCents > 0, t.key);
  assert.equal(TYPE_BY_SLUG.get("commander-decks")?.kind, "multi");
});

test("sets.ts: unique codes and slugs, newest first, every set with a booster line or Commander decks", () => {
  assert.equal(new Set(SETS.map((s) => s.code)).size, SETS.length);
  assert.equal(new Set(SETS.map((s) => s.slug)).size, SETS.length);
  for (let i = 1; i < SETS.length; i++) assert.ok(SETS[i - 1].releaseDate >= SETS[i].releaseDate, `${SETS[i - 1].code} before ${SETS[i].code}`);
  for (const s of SETS) assert.match(s.releaseDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(SET_BY_CODE.get("trk")?.releaseDate, "2026-11-13");
  assert.equal(SET_BY_CODE.get("tla")?.slug, "avatar-the-last-airbender");
  assert.equal(SET_BY_CODE.get("clb")?.slug, "commander-legends-battle-for-baldurs-gate");
  // Every set's own name finds it.
  for (const s of SETS) assert.equal(detectSet(`${s.name} Collector Booster Box`)?.code, s.code, s.name);
});
