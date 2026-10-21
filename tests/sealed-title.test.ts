// Real store titles (seen in the 2026-09-25 store probe) and what identify()
// must make of them. Wrong merges are the expensive failure, so most of these
// assert that two different products do NOT share a groupKey.
import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalName, classify, cleanName, detectSet, identify, isIdentity, floorCents, titleCase } from "../src/lib/sealed-title";

function key(title: string, strict = false): string {
  const id = identify(title, { strict });
  return isIdentity(id) ? id.groupKey : `REJECT:${id}`;
}

test("set products group by set + type across store wordings", () => {
  const a = key("Pokémon TCG: Scarlet & Violet—Surging Sparks Elite Trainer Box");
  const b = key("Pokemon Surging Sparks ETB");
  const c = key("POKÉMON TCG Scarlet & Violet 8: Surging Sparks Elite Trainer Box (English)");
  assert.equal(a, "sv8|etb");
  assert.equal(b, a);
  assert.equal(c, a);
  assert.equal(key("Mega Evolution: Pitch Black - Booster Box"), "me5|booster-box");
  assert.equal(key("Pokemon TCG 30th Celebration Elite Trainer Box"), "cel30|etb");
  assert.equal(key("Pokemon TCG - Scarlet & Violet Booster Case"), "sv1|booster-box-case");
  assert.equal(key("Pokemon 151 Booster Bundle"), "sv3pt5|booster-bundle");
  assert.equal(key("Pokémon TCG: Prismatic Evolutions Pokémon Center Elite Trainer Box"), "sv8pt5|pc-etb");
});

test("a series name never stands in for an unknown set", () => {
  // If "Pitch Black" weren't in SETS this must be "no set", not Mega Evolution (me1).
  assert.equal(detectSet("Mega Evolution: Some Future Set - Booster Box"), null);
  assert.equal(detectSet("Pokémon Mega Evolution Elite Trainer Box")?.code, "me1");
  assert.equal(detectSet("Pokemon TCG ME01 Mega Evolution Booster Box")?.code, "me1");
  assert.equal(detectSet("Scarlet & Violet - Paldea Evolved Booster Box")?.code, "sv2");
  assert.equal(detectSet("Sword & Shield Evolving Skies Booster Box")?.code, "swsh7");
});

test("longest set name wins", () => {
  assert.equal(detectSet("Prismatic Evolutions Booster Bundle")?.code, "sv8pt5");
  assert.equal(detectSet("XY Evolutions Booster Box")?.code, "xy12");
  assert.equal(detectSet("Crown Zenith Galarian Gallery collection")?.code, "swsh12pt5");
});

test("151 is only the set when it isn't a card number or count", () => {
  assert.equal(detectSet("Pokemon 151 Elite Trainer Box")?.code, "sv3pt5");
  assert.equal(detectSet("Charizard ex 199/151")?.code ?? null, null);
  assert.equal(detectSet("Bulk lot 151 cards")?.code ?? null, null);
});

test("different collections, tins and blisters in one set never merge", () => {
  const tinA = key("Pokémon TCG: Paldean Fates Tin (Iron Treads)");
  const tinB = key("Pokémon TCG: Paldean Fates Tin (Great Tusk)");
  assert.notEqual(tinA, tinB);
  const premium = key("Pokémon TCG: Prismatic Evolutions Premium Figure Collection");
  const superPremium = key("Pokémon TCG: Prismatic Evolutions Super-Premium Collection");
  const binder = key("Prismatic Evolutions Binder Collection");
  assert.equal(new Set([premium, superPremium, binder]).size, 3);
  assert.notEqual(key("Charizard ex Premium Collection"), key("Charizard ex Super-Premium Collection"));
  assert.notEqual(key("Surging Sparks 3 Pack Blister (Zapdos)"), key("Surging Sparks Checklane Blister (Zapdos)"));
});

test("the same collection merges across wordings", () => {
  assert.equal(key("Pokémon TCG: Charizard ex Premium Collection"), key("Charizard EX Premium Collection Box - Pokemon"));
  assert.equal(key("Surging Sparks 3-Pack Blister - Zapdos"), key("Pokemon Surging Sparks 3 Pack Blister (Zapdos)"));
  assert.equal(key("Pokemon TCG Paldean Fates Tin - Iron Treads"), key("Pokémon TCG: Paldean Fates Tin (Iron Treads)"));
});

test("too-vague titles are refused rather than merged", () => {
  assert.equal(key("Pokemon TCG: 2-Pack Blister"), "REJECT:vague");
  assert.equal(key("Pokémon Mini Tin"), "REJECT:vague");
  assert.equal(key("Pokemon TCG - Checklane Blister"), "REJECT:vague");
});

test("singles, slabs, accessories, lots and store-made products are refused", () => {
  assert.equal(key("Charizard ex 223/197 Obsidian Flames"), "REJECT:not-sealed");
  assert.equal(key("PSA 10 Umbreon VMAX Evolving Skies"), "REJECT:not-sealed");
  assert.equal(key("Pokemon TCG Random Assorted 50-Card Value Lot - Bonus Holos"), "REJECT:not-sealed");
  assert.equal(key("ULTRA Pack - Pokemon 5-Card Hit Pack"), "REJECT:not-sealed");
  assert.equal(key("Surging Sparks Card Sleeves (65ct)"), "REJECT:accessory");
  assert.equal(key("Ultra Pro Pokémon Elite Trainer Box Acrylic Case"), "REJECT:accessory");
  assert.equal(key("Pokemon TCG - Sword & Shield - Vivid Voltage - Collectors Album"), "REJECT:accessory");
  assert.equal(key("3x Surging Sparks Elite Trainer Box"), "REJECT:multiple");
  assert.equal(key("Surging Sparks Booster Pack x5"), "REJECT:multiple");
  assert.equal(key("Empty Surging Sparks Elite Trainer Box"), "REJECT:not-sealed");
});

test("other languages are refused", () => {
  assert.equal(key("Japanese Pokémon Terastal Festival ex Booster Box"), "REJECT:foreign");
  assert.equal(key("Pokemon Surging Sparks Booster Box (JP)"), "REJECT:foreign");
  assert.equal(key("Pokémon Karmesin & Purpur Stürmische Funken Display (Deutsch)"), "REJECT:foreign");
  assert.equal(key("Pokemon Scarlet & Violet 151 Booster Box Chinese"), "REJECT:foreign");
  assert.equal(key("ポケモンカードゲーム テラスタルフェスex BOX"), "REJECT:foreign");
});

test("other games are refused, strictly in mixed collections", () => {
  assert.equal(key("One Piece OP-09 Emperors in the New World Booster Box", true), "REJECT:not-pokemon");
  assert.equal(key("Disney Lorcana Azurite Sea Booster Box"), "REJECT:not-pokemon");
  assert.equal(key("Riftbound: League of Legends Origins Booster Display"), "REJECT:not-pokemon");
  // A set name alone isn't enough in a store-wide pre-order collection.
  assert.equal(key("Surging Sparks Booster Box", true), "REJECT:not-pokemon");
  assert.equal(key("Pokemon Surging Sparks Booster Box", true), "sv8|booster-box");
});

test("wholesale displays and odd pack counts are not the set's booster box", () => {
  assert.equal(classify("Pokémon TCG Scarlet & Violet 151 Mini Tin Display"), null);
  assert.equal(classify("Pokemon Sleeved Booster Display (24)"), null);
  assert.equal(classify("Pokemon TCG ME01 Mega Evolution Enhanced Booster Box"), null);
  assert.equal(classify("Pokemon Pitch Black Half Booster Box"), null);
  // Plurals, as a Singapore store titles it (it was ranked as the S$135 "booster box").
  assert.equal(classify("Pitch Black Half Booster Boxes"), null);
  assert.equal(classify("Pokemon Mega Evolution Enhanced Booster Displays"), null);
  // An 18-pack "booster box" is a half display (a eurozone store's title; ranked as the €132.99 box).
  assert.equal(classify("Pitch Black Booster Box (18 Boosters) - Pitch Black"), null);
  assert.equal(classify("Pokemon Delta Reign Booster Display Box (18 Packs)"), null);
  // A real 36-pack box is still a booster box.
  assert.equal(classify("Pokemon TCG Pitch Black Booster Box - ME05: Pitch Black (ME05) 36 packs"), "booster-box");
});

test("named boxes and calendars are collections", () => {
  assert.equal(classify("Pokemon TCG Crown Zenith - Morpeko V Union Box"), "collection");
  assert.equal(classify("POKÉMON TCG Holiday 2023 Calendar"), "collection");
  assert.equal(classify("Pokemon TCG - Sword & Shield Trainer Box"), "etb");
});

test("price floors scale per market", () => {
  assert.equal(floorCents("booster-box", "US"), 7000);
  assert.equal(floorCents("booster-box", "AU"), 10500);
  assert.ok(floorCents("booster-pack", "UK") < floorCents("booster-pack", "US"));
});

test("store wordings of the same blister merge; set codes and numerals are noise", () => {
  assert.equal(key("Scarlet & Violet 9: Journey Together Check Lane Blister (Pikachu)"), key("Journey Together Checklane Blister - Pikachu"));
  assert.equal(key("Mega Evolution ME06 - Delta Reign 3-Booster Blister"), key("Pokemon Delta Reign Three Booster Blister"));
  assert.equal(key("Mega Evolution - Chaos rising - 3 packs blister bundle"), key("Chaos Rising 3 Pack Blister"));
});

test("packaging words don't override the product's name", () => {
  assert.equal(classify("(SV4.5) Paldean Fates Tech Sticker Blister Collection"), "collection");
  assert.equal(key("(SV4.5) Paldean Fates Tech Sticker Blister Collection"), key("Paldean Fates Tech Sticker Collection"));
  assert.equal(classify("Mega Evolution ME02 - Phantasmal Flames - Sleeved Blister"), "sleeved-booster");
});

test("rarities and letter-prefixed card numbers are singles", () => {
  assert.equal(key("Flareon EX - RC6/RC32 - Ultra Rare - Generations Radiant Collection"), "REJECT:not-sealed");
  assert.equal(key("Umbreon VMAX TG23/TG30 Brilliant Stars"), "REJECT:not-sealed");
  assert.equal(key("XY - Mega Elite Trainer Deck Shield (Mega Gengar/Lucario)"), "REJECT:accessory");
});

test("collection names drop the series prefix stores add", () => {
  const id = identify("Mega Evolution - 30th Celebration - Tech Sticker Collection");
  assert.ok(isIdentity(id));
  assert.equal(id.name, "30th Celebration - Tech Sticker Collection");
  const b = identify("Pokémon TCG: Scarlet & Violet - Grand Adventure Collection");
  assert.ok(isIdentity(b));
  assert.equal(b.name, "Grand Adventure Collection");
  const c = identify("(SV4.5) Paldean Fates Tech Sticker Blister Collection");
  assert.ok(isIdentity(c));
  assert.equal(c.name, "Paldean Fates Tech Sticker Blister Collection");
});

test("EU stores' other-language editions are refused (titles from the 2026-09-25 probe)", () => {
  for (const t of [
    "Display Black Bolt - SV11B - Japonais",
    "Display Pokémon 151 - SV2A - Japonais",
    "Pokémon: White Flare (sv11W) Booster / Display (Koreanisch)",
    "Pokémon: Pikachu V-Union Box (Vereinfachtes Chinesisch)",
    "Pokémon: 30th Celebration (30th C) Booster / Display (Vereinfachtes Chinesisch)",
    "Pokemon ex Kampf Deck - Ampharos ex - Deutsches Sammelkartenspiel",
    "Pokémon Mega-Glurak X-ex Ultra-Premium-Kollektion",
    "151 Display 20 Buste (JAP)",
    // An English edition, but titled in Italian: its set can't be read, so it's
    // refused rather than guessed.
    "Avventure Insieme: Blister da 3 Buste Scrafty (ENG)",
    "151: Journey Slim Booster",
    "Pokemon Surging Sparks Elite Trainer Box VF",
  ]) {
    assert.equal(key(t), "REJECT:foreign", t);
  }
  // English editions in the same shops still pass.
  assert.equal(key("Pokémon: Pitch Black Booster Bundle (Englisch)"), "me5|booster-bundle");
  assert.equal(key("Paradox Rift Booster Pack"), "sv4|booster-pack");
  assert.equal(key("Pokemon Surging Sparks Display (EN)"), "sv8|booster-box");
});

test("store filler and English-edition markers don't split a product", () => {
  assert.equal(key("Pokemon Mega Charizard Tin (Englisch)"), key("Pokémon TCG: Mega Charizard Tin"));
  assert.equal(key("Mega Charizard Tin - Single"), key("Mega Charizard Tin"));
  assert.equal(key("Pokemon Mega Charizard Tin - Anglais"), key("Mega Charizard Tin"));
  assert.equal(key("Pokémon Collezione Coppia Mega Charizard (ITA)"), "REJECT:foreign");
  assert.equal(key("Pokémon Lata Mega Charizard ex"), "REJECT:foreign");
});

test("a series name followed by a set code is also dropped from names", () => {
  const id = identify("Mega Evolution ME03: Perfect Order Checklane - Makuhita");
  assert.ok(isIdentity(id));
  assert.equal(id.name, "Perfect Order Checklane - Makuhita");
});

// ── TCGplayer's catalogue names (2026-09-27), and the store titles for the same
// products. Each of these was filed on the wrong product before.

test("ETB Plus and cases of Pokémon Center ETBs are not the plain ETB or its case", () => {
  assert.equal(key("Sword & Shield Elite Trainer Box Plus [Zamazenta]"), "REJECT:unclassified");
  assert.equal(key("Crown Zenith Pokemon Center Elite Trainer Box Plus"), "REJECT:unclassified");
  assert.equal(key("Surging Sparks Pokemon Center Elite Trainer Box (Exclusive) Case"), "REJECT:unclassified");
  assert.equal(key("Pokemon Go Pokemon Center Elite Trainer Box Plus Case (Exclusive)"), "REJECT:unclassified");
  assert.equal(key("Surging Sparks Elite Trainer Box Case"), "sv8|etb-case");
  assert.equal(key("Sword & Shield Elite Trainer Box [Zamazenta]"), "swsh1|etb");
});

test("displays of booster bundles and master cartons are not the bundle or its case", () => {
  assert.equal(key("Black Bolt Booster Bundle Display"), "REJECT:unclassified");
  assert.equal(key("151 Booster Bundle Display Case"), "REJECT:unclassified");
  assert.equal(key("Pokémon TCG - Display booster bundle Destined Rivals (ingles)"), "REJECT:unclassified");
  assert.equal(key("Stellar Crown Sleeved Booster Master Carton"), "REJECT:unclassified");
  assert.equal(key("POKEMON TCG - SCARLET VIOLET 151 BOOSTER BUNDLE CASE (10 BUNDLES) SEALED DISPLAY"), "sv3pt5|booster-bundle-case");
  assert.equal(key("Black Bolt Booster Bundle"), "zsv10pt5|booster-bundle");
});

test("fun packs, mini packs and promo packs are not the set's booster pack", () => {
  assert.equal(key("Destined Rivals Fun Pack"), "REJECT:unclassified");
  assert.equal(key("Unified Minds Mini Pack"), "REJECT:unclassified");
  assert.equal(key("Team Up - Mini Booster Pack"), "REJECT:unclassified");
  assert.equal(key("McDonald's 25th Anniversary Booster Pack"), "REJECT:unclassified");
  assert.equal(key("General Mills 25th Anniversary Booster Pack"), "REJECT:unclassified");
  assert.equal(key("Detective Pikachu Special Promo Booster Pack"), "REJECT:unclassified");
  assert.equal(key("POP Series 3 Pack"), "REJECT:unclassified");
  assert.equal(key("Celebrations Booster Pack"), "cel25|booster-pack");
  // "Base Set 2" is a set, not a 2-pack blister.
  assert.equal(classify("Base Set 2 Booster Pack"), "booster-pack");
});

test("displays and multiples in TCGplayer's wording are refused", () => {
  assert.equal(key("Stellar Crown Build & Battle Box [Set of 10]"), "REJECT:multiple");
  assert.equal(key("Paldea Legends Tins [Bundle of 2] (International Version)"), "REJECT:multiple");
  assert.equal(key("Kanto Friends Mini Tins 5-Pack"), "REJECT:multiple");
  assert.equal(key("Sam's Club 151 (4 Mini Tins + 4 Promo Cards Bundle)"), "REJECT:multiple");
  assert.equal(key("Pokémon - Paldean Fates 5 Mini Tins"), "REJECT:multiple");
  assert.equal(key("V Battle Deck Display [Venusaur V/Blastoise V]"), "REJECT:unclassified");
  assert.equal(key("Team Up Prerelease Kit Display"), "REJECT:unclassified");
  assert.equal(key("2024 World Championships Deck Display"), "REJECT:unclassified");
  // One mini tin still identifies.
  assert.equal(key("Kanto Friends Mini Tin"), "tin|-|friends-kanto-mini");
});

test("a retailer's edition or bundle of a set product is not the product", () => {
  assert.equal(key("Prismatic Evolutions Elite Trainer Box and Pokeball (Sam's Club)"), "REJECT:retail-edition");
  assert.equal(key("Prismatic Evolutions Elite Trainer Box (Dollar General Exclusive)"), "REJECT:retail-edition");
  // Refused either way; the "+" between two products is read first (multiple), before the retailer name.
  assert.equal(key("Costco Pokemon Collector 3-Pack: Scarlet & Violet 151 ETB + Paldea Legends Tins"), "REJECT:multiple");
  assert.equal(key("Costco Pokemon Surging Sparks 2-Pack Trainer Box and Booster Bundle"), "REJECT:unclassified");
  assert.equal(key("Surging Sparks Elite Trainer Box and Booster Bundle"), "REJECT:unclassified");
  // A retailer-exclusive collection or blister is its own product: its name says which.
  assert.notEqual(
    key("Pitch Black Premium Checklane Blister [Tyrunt, Tyrantrum] (Target Exclusive)"),
    key("Pitch Black Premium Checklane Blister [Amaura, Aurorus] (Target Exclusive)"),
  );
  assert.ok(!key("Pitch Black Premium Checklane Blister [Tyrunt, Tyrantrum] (Target Exclusive)").startsWith("REJECT"));
});

test("single-pack, 2-pack and 3-pack blisters of one Pokémon are three products", () => {
  const three = key("Obsidian Flames 3 Pack Blister [Houndstone]");
  const single = key("Obsidian Flames Single Blister Pack [Houndstone]");
  assert.notEqual(three, single);
  assert.equal(single, key("Pokemon Obsidian Flames Single Pack Blister (Houndstone)"));
  assert.equal(three, key("Obsidian Flames Blister (Houndstone)")); // three is the default
  assert.notEqual(key("2-Pack Blister [Zarude]"), key("3 Pack Blister [Zarude]"));
  assert.equal(key("Collector's Pin Two Pack Blisters [Jirachi]"), key("2 Booster Packs & Jirachi Collector's Pin"));
  assert.equal(key("Pokemon TCG: 2-Pack Blister"), "REJECT:vague");
});

test("numbered series, Mega Y and Special Collections are part of a product's identity", () => {
  const s1 = key("First Partner Illustration Collection (Series 1)");
  assert.notEqual(s1, key("First Partner Illustration Collection (Series 2)"));
  assert.equal(key("First Partner Illustration Collection (Series 2)"), key("Pokémon TCG - First Partner Illustration Collection Series 2"));
  assert.notEqual(key("Mega Charizard X Collection"), key("Mega Charizard Y Collection"));
  assert.notEqual(key("Mega Charizard Tin (Mega Charizard Y)"), key("Mega Charizard Tin (Mega Charizard X)"));
  assert.equal(key("Mega Charizard Tin (Mega Charizard X)"), key("Pokemon Mega Charizard X Tin"));
  // X stays the unmarked form, so the one Ultra-Premium Collection keeps one key.
  assert.equal(key("Mega Charizard X ex Ultra Premium Collection"), key("Mega Charizard ex Ultra-Premium Collection"));
  assert.notEqual(key("Charizard ex Special Collection"), key("Charizard ex Premium Collection"));
  assert.equal(key("Charizard ex Premium Collection"), key("Pokemon Charizard EX Premium Collection Box"));
  assert.equal(key("Lucario VSTAR Special Collection"), key("Pokemon: Lucario VStar Special Collection Box"));
  assert.equal(key("Pokemon Special Collection"), "REJECT:vague");
});

test("a Pokémon Center ETB named with a series-named set finds its set", () => {
  assert.equal(key("Mega Evolution Pokemon Center Elite Trainer Box (Exclusive) [Mega Gardevoir]"), "me1|pc-etb");
  assert.equal(key("Mega Evolution - Elite Trainer Box (Mega Gardevoir) (Pokemon Center Exclusive)"), "me1|pc-etb");
  assert.equal(key("Scarlet & Violet Pokemon Center Elite Trainer Box (Exclusive) [Koraidon]"), "sv1|pc-etb");
});

test("'Special Collection' is only identity for the Pokémon sold as both a Special and a Premium Collection", () => {
  // Most Special Collections are also listed without the word: one product.
  assert.equal(key("Zacian V-Union Box"), key("Zacian V-UNION Special Collection"));
  assert.equal(key("Prismatic Evolutions Accessory Pouch Collection"), key("Prismatic Evolutions Accessory Pouch Special Collection"));
  assert.equal(key("Celebrations Collection [Pikachu V-UNION]"), key("Celebrations Special Collection Pikachu V-UNION"));
  assert.equal(key("V-union Box - Morpeko"), key("Morpeko V-UNION Special Collection"));
  // Both exist, at different prices, for these (TCGplayer lists both of each).
  assert.notEqual(key("Kleavor VSTAR Special Collection"), key("Kleavor VSTAR Premium Collection"));
  assert.notEqual(key("Pikachu VMAX Special Collection"), key("Pikachu VMAX Premium Collection"));
  assert.notEqual(key("Lucario VSTAR Special Collection"), key("Lucario VSTAR Premium Collection"));
});

test("a set-less collection of a Special-and-Premium Pokémon that names neither is too vague to file", () => {
  // Beaches TCG (2026-10-19): its photo is the Special Collection; with four Canadian "Charizard EX Box" listings
  // at C$360 and up, it was being filed as the Premium Collection.
  for (const t of ["Pokemon - Charizard Ex Box", "Charizard EX Box", "Pokemon Charizard EX Box"]) assert.equal(key(t), "REJECT:vague", t);
  assert.equal(key("Pokémon TCG: Charizard ex Premium Collection"), "collection|-|charizard-ex");
  assert.equal(key("Pokémon TCG: Charizard ex Special Collection"), "collection|-|charizard-ex-special");
  assert.equal(key("Pokemon Charizard EX Super-Premium Collection Box"), "collection|-|charizard-ex-super");
  // A set's own box is named by its set.
  assert.equal(key("XY: Evolutions - Charizard EX Box"), "collection|xy12|charizard-ex");
  assert.equal(key("Pokémon TCG: Crown Zenith Pikachu VMAX Box"), "collection|swsh12pt5|pikachu-vmax");
});

test("the Mega Y marker: only a Charizard or Mewtwo title that names no X", () => {
  const y = key("Mega Charizard Tin (Mega Charizard Y)");
  // The assorted listing is not the Y product.
  for (const t of ["Mega Charizard X & Y Tin", "Mega Charizard X/Y Tin", "Mega Charizard Tin (X & Y Assorted)", "Mega Charizard Y/X Tin", "Mega Charizard X OR Y Tin"]) {
    assert.notEqual(key(t), y, t);
  }
  assert.equal(key("XY Furious Fists Premium Collection Mega Charizard Y"), key("Furious Fists Premium Collection (Mega Charizard Y)"));
  // The "X & Y" series and the Spanish "y" are not the Y form.
  assert.equal(key("X & Y - Kangaskhan EX Box"), key("Kangaskhan EX Box"));
  assert.equal(key("Cyrus y Klara Premium Tournament Collection"), key("Klara & Cyrus Premium Tournament Collection"));
});

test("an 'assorted' ex Box naming no Pokémon, or an assorted Mega Charizard X/Y product, is none of the line's products", () => {
  // Beaches TCG (2026-10-19) and the listings the same rule caught elsewhere.
  for (const t of [
    "Pokemon 30th anniversary ex box assorted",
    "Pokémon TCG: Mega Evolution - Ascended Heroes Mega Ex Box (Assorted)",
    "Mega Charizard Tin - Assorted",
    "Pokémon TCG: Mega Charizard ex Tin (X & Y Assorted)",
  ]) {
    assert.equal(key(t), "REJECT:vague", t);
  }
  // Each box or tin of the line is its own product.
  assert.equal(key("Pokemon TCG 30th Celebration Greninja ex Box"), "collection|cel30|ex-greninja");
  assert.equal(key("Mega Charizard Tin (Mega Charizard Y)"), "tin|-|charizard-mega-y");
  // A set's assorted mini tins and tech sticker collections still file as the set's product, as the "either" blisters do.
  assert.equal(key("Pokémon TCG: 30th Celebration Mini Tin (Assorted)"), "tin|cel30|mini");
  assert.equal(key("Pokémon TCG: 30th Celebration Tech Sticker Collection (Assorted)"), "collection|cel30|sticker-tech");
});

test("a title naming a Pokémon but no product is refused, never a page of its own", () => {
  // Beaches TCG (2026-10-19): Black or White Kyurem's ex box? Mega Gengar's tin is the Mega Moonlit Tin.
  assert.equal(key("Pokemon Kyurem ex box"), "REJECT:vague");
  assert.equal(key("Mega Gengar tin"), "REJECT:vague");
  // The products those titles could be, and the shapes left alone.
  assert.equal(key("Pokémon TCG: Black Kyurem ex Box"), "collection|-|black-ex-kyurem");
  assert.equal(key("White Kyurem Box"), "collection|-|kyurem-white");
  assert.equal(key("Kyurem V Box"), "collection|-|kyurem-v");
  assert.equal(key("EX Tin [Kyurem]"), "tin|-|ex-kyurem");
  assert.equal(key("Pokemon Mega Moonlit Tin - Mega Gengar ex"), "tin|-|ex-gengar-mega-moonlit");
  assert.equal(key("Mega Gengar ex Tin"), "tin|-|ex-gengar-mega");
  assert.equal(key("Pokémon TCG: Mega Charizard Tin"), "tin|-|charizard-mega");
});

test("pack counts in either word order: 'Blister Pack - Single Booster', 'Two-Booster Blister'", () => {
  assert.equal(key("Surging Sparks - Blister Pack - Single Booster - Wooper"), key("Surging Sparks Single Pack Blister [Wooper]"));
  assert.equal(key("Journey Together - Blister Pack - Single Booster - Scraggy Promo Card"), key("Journey Together Single Pack Blister [Scraggy]"));
  assert.equal(key("Prismatic Evolutions Two-Booster Blister"), key("Prismatic Evolutions 2 Pack Blister"));
  assert.notEqual(key("Prismatic Evolutions Two-Booster Blister"), key("Prismatic Evolutions 3 Pack Blister"));
  // A checklane is single-pack by definition and keeps its own key.
  assert.equal(key("Surging Sparks Checklane Blister [Pikachu]"), "blister|sv8|checklane-pikachu");
});

test("'Pokémon Center' names a set's product only as a Pokémon Center ETB", () => {
  assert.equal(detectSet("Scarlet & Violet – Pokémon Center Hiroshima Special Box (289/260/261/SV-P)"), null);
  assert.equal(key("Scarlet & Violet Pokemon Center Elite Trainer Box"), "sv1|pc-etb");
});

test("'30th Celebrations' is the 30th Celebration set, never Celebrations (2021)", () => {
  assert.equal(detectSet("Pokémon TCG: 30th Celebrations Elite Trainer Box")?.code, "cel30");
  assert.equal(key("Pokemon: 30th Celebrations Elite Trainer Box"), key("30th Celebration Elite Trainer Box"));
  assert.equal(key("Pokémon 30th Celebrations Poster Collection"), key("Pokémon TCG - Mega Evolution - 30th Celebration - Poster Collection"));
  assert.equal(key("BLISTER 2 BOOSTER PACK 30TH CELEBRATIONS POKEMON"), "blister|cel30|2pack");
  assert.equal(key("Pokemon Celebrations Elite Trainer Box"), "cel25|etb");
});

test("product names keep 'Unlimited' and 'Metal'; bracketed store notes go", () => {
  assert.equal(cleanName("Neo Discovery 2-Pack Blister [Unlimited Edition]"), "Neo Discovery 2-Pack Blister [Unlimited Edition]");
  assert.equal(cleanName("Charizard Tin (Metal Coin)"), "Charizard Tin (Metal Coin)");
  assert.equal(cleanName("Sylveon ex Box (Limit 2)"), "Sylveon ex Box");
  assert.equal(cleanName("Espeon & Umbreon Premium Deck Set (One Per Customer)"), "Espeon & Umbreon Premium Deck Set");
});

// ── 2026-09-28: the second import's noise. Titles are real (dexsealed_full).

test("figures, model kits and blind boxes are accessories; the TCG's Figure Collections, Pencil Tins and Eraser Blisters are not", () => {
  for (const t of [
    "Pokemon Pokepla Collection 46 Select Series Rayquaza",
    "Re-Ment x Pokémon: Little Night Collection 2 Blind Box",
    "Pokémon Center Bikkura Tamago Bath Bomb Eevee Friends Figure Collection",
    "Pokemon Moncolle MS-51 Mega Charizard X",
    "FIGURA PVC POKEMON MEW MONSTER COLLECTION MS-17 TAKARA TOMY",
    "PLASTIC MODEL COLLECTION QUICK!! NO.06 PIPLUP",
    "Pokemon Plamo Collection 61 Select Series Mega Rayquaza",
    "Pokemon Select 3\" Series 3 Metallic Figure: Eevee",
    "Pokemon Box Sign – Starters (3.75″ x 12″ x 1.5″)",
    "Pokemon Eraser Set",
    "Pokémon Center Pocket BONSAI Collection Figure (with chewing gum)",
    "Pokémon Center Petit Tin Collection yonayona Ghost (with sweets)",
    "TOMY: Pokemon Monster Collection - Jigglypuff 4-Inch Vinyl Figure #4",
    "Pokemon TCG - Dream Painting Collection Vol. 2 Aqua Figure & Booster Pack",
    "Charizard ex Super Premium Collection - Charizard Figurine",
    "Mega Bloks Pokemon Charizard Building Toy",
  ]) {
    assert.equal(key(t), "REJECT:accessory", t);
  }
  assert.equal(key("Arceus Figure (from Arceus V Figure Collection)"), "REJECT:not-sealed");
  assert.equal(key("Pokemon TCG Arceus V Figure Collection"), key("Arceus V Figure Collection Box"));
  assert.equal(classify("Crown Zenith Shiny Zacian Premium Figure Collection"), "collection");
  assert.equal(classify("Crown Zenith Shiny Zacian/Zamazenta Figure Box"), "collection");
  // The figure named twice, or first: still the TCG product.
  assert.equal(key("Pokemon TCG Mega Lucario Ex Premium Figure Collection with Promo Cards and Figure"), key("Mega Lucario ex Premium Figure Collection"));
  assert.equal(key("Pikachu VMAX Premium Figure Celebrations Collection"), key("Celebrations Pikachu VMAX Premium Figure Collection"));
  // Two boosters and a pencil tin or an eraser: a sealed product that comes out every year.
  assert.equal(key("Pokemon Back to School Pencil Tin 2023"), key("Pokemon TCG: Back to School Pencil Tin (2023)"));
  assert.notEqual(key("Pokemon Back to School Pencil Tin 2023"), key("Pokemon TCG: 2024 Back to School Pencil Tin"));
  assert.equal(key("Back to School Eevee Eraser 2 Pack Blister"), key("Pokemon Back to School Eraser Blister 2-Pack - Eevee"));
  assert.equal(key("Pokemon TCG Pencil Tin"), "tin|-|pencil");
});

test("One Piece singles read by their card codes, whatever the collection", () => {
  for (const t of [
    "Gum-Gum Jet Pistol ST01-015 (Super Pre-Release Starter Deck 1: Straw Hat Crew)",
    "Monkey.D.Luffy (Parallel) - (ST30-012) - Starter Deck EX: Luffy & Ace - (Super Rare)",
    "Kyros (Alternate Art) - (EB01-040) - Extra Booster: Memorial Collection - (Leader)",
    "Sanji & Pudding EB02-035 (Extra Booster: Anime 25th Collection) - Foil",
    "DON!! Card - OP-09 Premium Booster",
    "2023-24 Upper Deck NHL E-X 2000 Hockey Hobby Box",
  ]) {
    assert.equal(key(t), "REJECT:not-pokemon", t);
  }
  assert.equal(key("UP D-BOX ALCOVE FLIP POKEMON MEGA CHARIZARD X"), "REJECT:accessory");
  assert.equal(key("Pokémon Deck Championnat du Monde 2023 - Mew's Revenge FR"), "REJECT:foreign");
});

test("opened, damaged or partly-sealed product and TCGplayer's single cards are not sealed", () => {
  for (const t of [
    "Charizard 004  - Holofoil Celebrations Classic Collection - Classic Collection",
    "Chespin (XY88) (Collector Chest) [XY: Black Star Promos]",
    "Swirlix RC19  - Holofoil Generations Radiant Collection - Uncommon",
    "151 Booster Box Geen Seal (No Shrink)",
    "Pokemon Boltund V Box (Box Wear)",
    "Iono Premium Tournament Collection (*may* have packaging imperfections)",
    "Team Rocket's Moltres ex Ultra-Premium Collection (MINOR DAMAGE)",
    "Sword & Shield Ultra Premium Collection - Celebrations (Loose Wrap)",
    "Surging Sparks Elite Trainer Box (Unshrinked)",
    "Pokemon TCG Live Code Card - Surging Sparks ETB",
    "20 x Basic Fire Energy",
    "Pokemon Gold Karte Pikachu V SWSH145 Ultra Premium Collection 25 Celebrations",
    "Pokémon Karmesin & Purpur Stürmische Funken Checklane Blister",
  ]) {
    assert.match(key(t), /^REJECT:(?:not-sealed|foreign)$/, t);
  }
  // A two-digit set code is not a promo number; "151" is a set. A blister's
  // promo named by its number is the blister.
  assert.equal(key("Pokemon SWSH12 Silver Tempest Booster Box"), "swsh12|booster-box");
  assert.equal(key("Pokemon SV 151 Booster Bundle"), "sv3pt5|booster-bundle");
  assert.equal(key("Lost Origin 3 Pack Blister with Regigigas SWSH247"), key("Lost Origin 3 Pack Blister [Regigigas]"));
  assert.equal(key("Crown Zenith Pin Collection with Cinderace SWSH278"), key("Crown Zenith Pin Collection - Cinderace"));
  assert.equal(key("Pikachu V SWSH145 Ultra Premium Collection Promo"), "REJECT:not-sealed");
});

test("a blister 'with either X/Y Promo' or 'X or Y Promo' is the assorted one: the set's blister, not a product of either", () => {
  assert.equal(key("Scarlet & Violet 3x Booster Pack Blister with either Arcanine/Dondozo Promo"), "blister|sv1|");
  assert.equal(key("Pokemon TCG: Silver Tempest 3 Pack Blister Manapy Or Togetic Promo"), key("Silver Tempest 3 Pack Blister"));
  assert.equal(key("Scarlet & Violet Single Booster Blister with either Espathra or Spidops Promo"), "blister|sv1|1pack");
  assert.equal(key("2-Booster Pack Pin Blister with either Arceus Pin or Darkrai Pin"), "REJECT:vague");
  assert.equal(key("Pokemon Mega Evolution Ultra Premium Collection"), "REJECT:vague");
});

test("Pokémon Center Japan's regional boxes and the Worlds Yokohama deck are Japanese product", () => {
  for (const t of [
    "Pokemon - Pokemon Center Fukuoka - Special Box",
    "Pokémon TCG: Pokémon Center Hiroshima 2025 Special Collection Box",
    "Fukuoka Pikachu Pokémon Center Exclusive Box",
    "Pokémon Center Kanazawa Collection Box",
    "Pokémon TCG: Scarlet & Violet – Pokémon Center Tohoku Special Box (260/SV-P)",
    "Pokemon World Championships 2023 Yokohama Deck -Pikachu-",
    "Pokémon Center Tokyo DX Special Box",
  ]) {
    assert.equal(key(t), "REJECT:foreign", t);
  }
  assert.equal(key("Pokemon TCG: Pokemon Center Elite Trainer Box - Prismatic Evolutions"), "sv8pt5|pc-etb");
  assert.equal(key("Delta Reign Pokemon Center Elite Trainer Box (Exclusive)"), "me6|pc-etb");
});

test("pairs, sets of tins, counted lots, pack bundles and two-product bundles are multiples", () => {
  for (const t of [
    "POKÉMON TCG Celebrations - Lance Charizard & Dark Sylveon Tins (Pair)",
    "XY Primal Clash - Checklane Blister Pair - Rhyperior & Zoroark",
    "Pokemon TCG: Paldean Fates Tin - 3 Set - Great Tusks/Iron Treads/Charizard",
    "Pokemon Eevee Evolutions Tin (3 set)",
    "Pokemon TCG Mega Evolution Ascended Heroes Tech Sticker Collection (One of Each)",
    "Pokemon Scarlet & Violet Prismatic Evolutions Display Of 8x Tins",
    "Pokémon Prismatic Evolutions Mini Tins 5 x tins",
    "Pokemon TCG Shrouded Fable x 36 Booster Packs",
    "Perfect Order Pokemon Booster Pack x 50 (LIVE)",
    "Pokemon Chaos Rising Booster Pack X 5 (LIVE)",
    "Pokemon Shining Fates 24 Pack Bundle",
    "Scarlet & Violet: Shrouded Fable - 36 Booster Pack Bundle",
    "Pokemon Chaos Rising Booster Pack Bundle (9 Packs) .",
    "Pokemon Surging Sparks 2-Pack Bundle",
    "Pokemon TCG: Scarlet & Violet - 3-Pack Bundle - Journey Together (Yanma)",
    "Pokemon SM10 Unbroken Bonds Sleeved Booster Complete Artwork of 4 packs",
    "30th Celebration - Ultra Premium Collection Day & Night Bundle - Wave 2",
    "Pokémon TCG - Mega Evolution - 30th Celebration - Ultra Premium Collection Day and Night Bundle - 2026-11-06",
    "POKEMON TCG MEGA EVOLUTION ASCENDED HEROES - TECH STICKER DISPLAY (12, SEALED)",
    "Scarlet & Violet: Prismatic Evolutions Tech Sticker Display",
    "Pokémon Chaos Rising 3 Premium Checklane Blister Set",
    "Pokémon TCG: Pitch Black Booster Box + Prismatic Evolutions Bundle",
    "Pokémon TCG: First Partner Illustration Collection Series 1 + 2 Bundle",
    "Pokemon - Evolving Skies Elite Trainer Box + Eeveelution Tin Bundle",
    "Scarlet & Violet: Obsidian Flames - Elite Trainer Box & Booster Box Bundle",
    "Victini + Gardevoir - V Battle Decks Bundle EN",
    "Pokemon League Battle Decks Reshiram & Charizard GX + Pikachu & Zekrom-GX Bundle",
  ]) {
    assert.equal(key(t), "REJECT:multiple", t);
  }
  // A display of booster bundles isn't the bundle (nor a multiple: it's not a product we compare at all).
  assert.equal(key("Pokémon - TCG - Prismatic Evolutions Booster Bundle Sealed Display"), "REJECT:unclassified");
  // A product's own contents are not a lot: a box's 36 packs, a case's 6 boxes, a blister's 3 packs, a tin's 4.
  assert.equal(key("Pokemon TCG - Scarlet & Violet - Surging Sparks - Booster Box (36x Packs)"), "sv8|booster-box");
  assert.equal(key("Pokémon - ME04 Chaos Rising - Booster Display (36) - EN"), "me4|booster-box");
  assert.equal(key("Pokemon Lost Origin Booster Box Case [6x Boxes] SWSH11"), "swsh11|booster-box-case");
  assert.equal(key("POKÉMON TCG Sword and Shield - Fusion Strike Booster Box X6 (Case)"), "swsh8|booster-box-case");
  assert.equal(key("Pokemon Obsidian Flames 25x Booster Bundle Sealed Case"), "sv3|booster-bundle-case");
  assert.equal(key("Stellar Crown 3x Booster Pack Blister with either Latias/Tinkaton Promo"), key("Stellar Crown 3 Pack Blister"));
  assert.equal(key("Pokemon TCG: Paldean Fates Tin - Great Tusk x4 Packs"), key("Paldean Fates Tin (Great Tusk)"));
  assert.equal(key("Mega Evolution - Chaos rising - 3 packs blister bundle"), key("Chaos Rising 3 Pack Blister"));
  assert.equal(key("Pokemon 151 Booster Bundle"), "sv3pt5|booster-bundle");
  assert.equal(key("Espeon & Umbreon Battle Deck Bundle").startsWith("deck|"), true, "an '&' inside one product's name is not two products");
});

test("sets sold without a booster box refuse a 'booster box' or '36 pack bundle' as a store-made lot", () => {
  for (const t of [
    "Pokémon TCG: Mega Evolution Ascended Heroes - Booster Box (36 Packs)",
    "Shining Fates \"Booster Box\" (36x Shining Fates Booster Packs)",
    "Scarlet & Violet: Paldean Fates - 36 Packs Loose Booster Box",
    "Pokemon TCG: 25th Anniversary Booster Box",
    "Pokemon - Shining Legends - Booster Box",
    "Hidden Fates Booster Box",
    "Pokemon 151 Booster Box by BaruZcard ENG",
    "30th Celebration Booster Box Case",
  ]) {
    assert.equal(key(t), "REJECT:multiple", t);
  }
  assert.equal(key("Prismatic Evolutions Booster Bundle"), "sv8pt5|booster-bundle");
  assert.equal(key("Pokemon Shining Fates Elite Trainer Box"), "swsh45|etb");
  assert.equal(key("Pokemon Shinning Fates Elite Trainer Box"), "swsh45|etb");
  assert.equal(key("Pokemon Guardian Rising Booster Box"), "sm2|booster-box");
  // Beaches TCG, 2026-10-19 (its photo is the English pack); Japan's Stellar Miracle stays foreign.
  assert.equal(key("Stella Crown Booster pack"), "sv7|booster-pack");
  assert.equal(key("Stella miracle Japanese pack"), "REJECT:foreign");
  assert.equal(key("Pokemon TCG - Mega Evolution - Base Set - Booster Box (36x Packs)"), "me1|booster-box");
  assert.equal(key("Pokemon Scarlet & Violet Standard Booster Box"), "sv1|booster-box");
});

test("SKU brackets, store notes, retailer names and years don't split a product", () => {
  assert.equal(key("Chaos Rising 3 Pack Blister [Charmeleon] [CRI - 3]"), key("Chaos Rising 3 Pack Blister [Charmeleon]"));
  assert.equal(key("Chaos Rising 3PK Blister - Charmeleon"), key("Chaos Rising 3 Pack Blister [Charmeleon]"));
  assert.equal(key("Chaos Rising 3 Pack / Triple Blister"), key("Chaos Rising - 3 Pack Blister"));
  assert.equal(key("Mega Evolution Chaos Rising 3-Booster Blister | Hobby Collectors Australia"), key("Chaos Rising - 3 Pack Blister"));
  assert.equal(key("Chaos Rising - 3-Pack Blister MAX 1 PER CUSTOMER"), key("Chaos Rising - 3 Pack Blister"));
  assert.equal(
    key("Chaos Rising 3-Pack Blister Charmeleon ME04 – Chaos Rising Expansion, 3 Booster Packs with Charmeleon Promo Card, Collectible Trading Card Game Set"),
    key("Chaos Rising 3 Pack Blister [Charmeleon]"),
  );
  assert.equal(key("Chaos Rising Premium Checklane Blister [Flygon Line] [CRI]"), key("Chaos Rising - Premium Checklane - Flygon"));
  assert.equal(key("Chaos Rising Single Pack Blister [Toxel] [CRI]"), key("Chaos Rising Single Pack Blister [Toxel]"));
  assert.equal(key("Lumiose City Mini Tin [Meganium & Meowstic] [MCAP]"), key("Lumiose City Mini Tin - Meganium & Meowstic"));
  assert.equal(key("151 Mini Tin [Hitmonlee & Kadabra] [MEW]"), key("Scarlet & Violet 151 Mini Tin - Hitmonlee & Kadabra"));
  assert.equal(key("[Mega ME4.0] Chaos Rising 3-Pack Blister Pokemon TCG (3 Packs)"), key("Chaos Rising - 3 Pack Blister"));
  assert.equal(key("Chaos Rising: 3-Pack Blister (Random Variant)"), key("Chaos Rising - 3 Pack Blister"));
  assert.equal(key("ME Lumiose City - Mini Tin (Single Unit) - 20% VAT"), key("Lumiose City Mini Tin"));
  assert.equal(key("Perfect Order - Mega ZYGARDE ex Box (MAX 1 PER CUSTOMER)"), key("Perfect Order Mega Zygarde ex Box"));
  assert.equal(key("First Partner Illustration Collection - Series 3 MAX 1 PER CUSTOMER WAVE 2 DATE TBD"), key("First Partner Illustration Collection (Series 3) (In Store Pickup Only)"));
  assert.equal(key("First Partner Illustration Collection (Series 3) First Partner Collection 2026"), key("Box Set - First Partner Illustration Collection - Series 3"));
  assert.equal(key("Kingdra ex Special Collection | Pokemon TCG"), key("Kingdra ex Special Collection"));
  assert.equal(key("Prismatic Evolutions Binder Collection Pokemon Scarlet and Violet (MSRP DEAL)(1 Per Customer)"), key("Prismatic Evolutions Binder Collection"));
  assert.equal(key("Ascended Heroes Focused Fighters Premium Collection (Sam's Club) [ASC]"), key("Ascended Heroes Focused Fighters Premium Collection"));
  assert.equal(key("Pokémon TCG: Poké Ball Tin 3-Pack Bundle 2024 (Amazon Exclusive) - Factory Sealed"), "REJECT:multiple");
  assert.equal(key("2026 MEGA MOONLIT TIN CLEFABLE EX (MAX 1 PER CUSTOMER)"), key("Mega Moonlit Tin [Mega Clefable ex] [MCAP]"));
  assert.equal(key("Prismatic Evolutions Mini Tin - Random Artwork | Pokemon TCG"), key("Prismatic Evolutions Mini Tin (1 willekeurig)"));
  // Years stay where they are the product: yearly lines.
  assert.notEqual(key("Trainer's Toolkit 2021"), key("Trainer's Toolkit 2022"));
  assert.notEqual(key("Holiday Calendar 2024"), key("Holiday Calendar 2025"));
  assert.notEqual(key("Collector Chest Tin - Fall 2024"), key("Collector Chest Tin - Fall 2025"));
  assert.notEqual(key("Pokemon TCG: Pokeball Tin 2025"), key("2022 Pokeball Tin"));
  assert.equal(key("Pokémon TCG: Poke Ball Tin (2025)"), key("Pokemon TCG: Pokeball Tin 2025 (Random Select)"));
  assert.notEqual(key("Pokemon TCG - Enhanced 2 Pack Blisters 2023"), key("Pokemon TCG: 2026 Enhanced 2-Pack Blister"));
  assert.equal(key("Pokemon Sword and Shield: Heavy Hitters Premium Collection (2023)"), key("Heavy Hitters Premium Collection"));
  // Capitalised words in brackets that name the product are not SKU codes.
  assert.notEqual(key("Premium Tournament Collection (IONO)"), key("Premium Tournament Collection"));
  assert.equal(key("Premium Tournament Collection (IONO)"), key("Iono Premium Tournament Collection"));
  assert.equal(key("Surging Sparks Booster Blister (SINGLE) [Wooper]"), key("Surging Sparks Single Pack Blister [Wooper]"));
  assert.equal(key("*Limit Two per Client* 30th Celebration - Poster Collection"), key("30th Celebration Poster Collection"));
  assert.equal(key("Team Rocket Tin Team Rockets Nidoking ex"), key("Team Rocket's Nidoking ex Tin"));
  assert.equal(key("Pokemon Collection Chest 2023"), key("Pokemon TCG Collector Chest 2023"));
  assert.notEqual(key("2025 Pokemon English TCG World Championships Deck"), key("2024 World Championships Deck"));
});

test("a series name on a collection, tin, blister or deck is not its set unless it names nothing else", () => {
  assert.equal(key("Sword & Shield Checklane Blister - Grookey"), key("Checklane Blister (Grookey)"));
  assert.equal(key("Scarlet & Violet Ultra Premium Collection - Terapagos"), key("Terapagos ex Ultra Premium Collection"));
  assert.equal(key("Sword & Shield Trainer's Toolkit 2022"), key("Trainer's Toolkit (2022)"));
  assert.equal(key("Sword & Shield Base 3 Pack Blister Morpeko"), "blister|-|morpeko");
  assert.equal(key("Pokemon - Scarlet & Violet - Base Set - 3 Pack Blister - Arcanine"), key("Scarlet & Violet 3-Pack Blister with Arcanine SVP011"));
  assert.equal(key("Pokemon Mega Evolution 3 Pack Blister"), "blister|me1|");
  assert.equal(key("Pokémon TCG: Mega Evolution Three Booster Blister"), "blister|me1|");
  assert.equal(key("Pokemon TCG - Scarlet & Violet Checklane Blister"), "blister|sv1|checklane");
  assert.equal(key("Pokemon TCG: Mega Evolution Mini Tin"), "tin|me1|mini");
  assert.equal(key("Pokemon - XY (Base Set) - 3 Pack Xerneas - Pin Blister"), "blister|-|pin-xerneas");
  assert.equal(key("Pokemon TCG - Mega Evolutions - Base Set Mini Tin"), "tin|me1|mini");
  assert.equal(detectSet("XY Elite Trainer Box")?.code, "xy1");
  assert.equal(detectSet("XY Evolutions Elite Trainer Box")?.code, "xy12");
  assert.equal(detectSet("Pokemon - XY - Gallade - 3 Pack Blister"), null);
});

test("the Ultra-Premium Collections file by the Pokémon on the box, not the store's words", () => {
  const charizardX = "upc|mega-charizard-x";
  for (const t of [
    "2025 Pokemon Mega Charizard X ex Ultra Premium Collection",
    "Charizard X EX Ultra-Premium Collection (UPC)",
    "Charizard X ex - Ultra Premium Collection (MAX 1 PER CUSTOMER)",
    "Mega Charizard X - Ultra Premium Collection - 0% VAT GVMS",
    "Mega Charizard X ex Ultra-Premium Collection Phantsmal Flames",
    "Mega Charizard X ex Ultra Premium Collection – 18 Booster Packs – Collectible Card Game Set",
    "Mega-Glurak X EX Ultra Premium Collection (Englisch) | 18 Booster & Zubehör | Neu & OVP",
    "Phantasmal Flames Ultra Premium Collection",
    "Mega Charizard Ultra Premium UPC Collection",
    "Pokemon TCG: Mega Charizard X ex Ultra-Premium Collection (LIVE)",
  ]) {
    assert.equal(key(t), charizardX, t);
  }
  for (const [t, k] of [
    ["Charizard Ultra Premium Collection", "upc|charizard"],
    ["Lost Origin Charizard Ultra Premium Collection", "upc|charizard"],
    ["Sword & Shield Ultra-Premium Collection: Charizard", "upc|charizard"],
    ["Charizard Ultra Premium Collection (Cassius Marsh Stream Only)", "upc|charizard"],
    ["151 Ultra-Premium Collection [MEW - 000]", "upc|mew"],
    ["(Local Pick-Up Only) Pokemon Scarlet & Violet: 151 Ultra Premium Collection", "upc|mew"],
    ["Scarlet & Violet 151 Ultra Premium Collection Mew (UPC)", "upc|mew"],
    ["Sword & Shield Ultra-Premium Collection - Zacian & Zamazenta", "upc|zacian-zamazenta"],
    ["Arceus VSTAR Ultra Premium Collection Box Trading Card Game Collector Set", "upc|arceus"],
    ["Terapagos ex Ultra-Premium Collection⁣ - Scarlet & Violet Products English / No", "upc|terapagos"],
    ["Greninja ex Ultra-Premium Collection [MCAP - 0]", "upc|greninja"],
    ["Team Rocket’s Moltress Ultra Premium Collection Box", "upc|moltres"],
    ["S&V Team Rocket’s Moltres EX - Ultra Premium Collection", "upc|moltres"],
    ["25th: Celebrations Eng - Ultra Premium Collection", "upc|celebrations"],
    ["Celebrations Ultra-Premium Collection [CLB - 0]", "upc|celebrations"],
    ["Sun & Moon Hidden Fates Ultra-Premium Collection (Rayquaza)", "upc|hidden-fates"],
    ["30th Anniversary - Ultra Premium Collection (Espeon)", "upc|30th-day"],
    ["30th Celebration Pikachu ex Night Ultra-Premium Collection | Pokemon TCG", "upc|30th-night"],
    ["30th Celebration Ultra-Premium Collection [Day] [30C]", "upc|30th-day"],
    ["Pokémon TCG - Mega Evolution - 30th Celebration - Ultra Premium Collection Night Version - 2026-11-06", "upc|30th-night"],
    ["30th Celebration Umbreon ex Ultra-Premium Collections", "upc|30th-night"],
  ] as const) {
    assert.equal(key(t), k, t);
  }
  // Which 30th UPC? The listing doesn't say, or says both.
  assert.equal(key("30th Celebration - Ultra-Premium Collection (Presale)"), "REJECT:vague");
  assert.equal(key("30th Celebration Ultra Premium Collection Day / Night (Random Select)"), "REJECT:vague");
  assert.equal(key("Ultra Premium Collection Box 2022 - EN"), "REJECT:vague");
  const id = identify("Charizard X EX Ultra-Premium Collection (UPC)");
  assert.ok(isIdentity(id));
  assert.equal(id.name, "Mega Charizard X ex Ultra-Premium Collection");
  assert.equal(canonicalName("upc|30th-day"), "30th Celebration Ultra-Premium Collection (Day)");
  assert.equal(canonicalName("tin|-|mini"), null);
});

test("First Partner Packs are collections; showcase and international tins keep their type", () => {
  assert.equal(classify("Pokemon TCG: First Partner Pack (Kanto)"), "collection");
  assert.equal(key("First Partner Pack (Kanto)"), key("Pokemon TCG First Partner Pack - Kanto"));
  assert.notEqual(key("First Partner Pack (Kanto)"), key("First Partner Pack (Johto)"));
  assert.equal(classify("Celebrations International Tin [Dark Sylveon V]"), "tin");
  assert.equal(classify("Pokemon TCG: Charizard ex Showcase"), "collection");
});

test("a title naming both a booster box and an ETB is whichever comes first; SEO tails don't classify", () => {
  assert.equal(classify("Scarlet & Violet Booster Box 151 Pokemon Center Elite Trainer Box (Exclusive)"), "booster-box");
  assert.equal(classify("Surging Sparks Elite Trainer Box - not a Booster Box"), "etb");
  assert.equal(key("Pokemon TCG: Sun & Moon - Checklane Blister Pack + Rockruff Card & Collectible Coin").startsWith("blister|"), true);
  assert.equal(key("Booster Bundle | Paldean Fates | POKÉMON | Inglés"), "sv4pt5|booster-bundle");
  // A language named in a trailing "| …" segment is the edition, not filler.
  assert.equal(key("Booster Box Black Bolt | POKÉMON | Coreano"), "REJECT:foreign");
  assert.equal(key("Blister Caos Creciente | POKÉMON | Español"), "REJECT:foreign");
  assert.equal(key("Pokémon Liga Deck Mew VMAX Level 3 | 60 Karten Deutsch"), "REJECT:foreign");
  assert.equal(key("Mini Tin Junio | POKÉMON | Inglés"), "tin|-|junio-mini");
  assert.equal(key("Pokemon TCG | Kingdra ex Special Collection"), key("Kingdra ex Special Collection"));
});

test("names keep 'Pokémon' where it is the name, lose store notes, and are title-cased from ALL CAPS", () => {
  const cases: [string, string][] = [
    ["Pokemon TCG Pokemon GO Special Collection Team Instinct - Pokemon", "Pokemon GO Special Collection Team Instinct"],
    ["Pokemon: Pokemon Go Pin Collection [Bulbasaur]", "Pokemon Go Pin Collection [Bulbasaur]"],
    ["Pokémon TCG - Sun & Moon - Pokemon Collector Chest (Mew, Mewtwo and Pikachu)", "Pokemon Collector Chest (Mew, Mewtwo and Pikachu)"],
    ["Pokemon TCG: Pokemon Day 2026 Collection Box", "Pokemon Day 2026 Collection Box"],
    ["POKEMON WORLD CHAMPIONSHIPS DECK 2024 - The Don", "Pokemon World Championships Deck 2024 - The Don"],
    ["Pokemon Trainer's Toolkit 2022", "Pokemon Trainer's Toolkit 2022"],
    ["Pokémon TCG: Prismatic Evolutions Pokémon Center Elite Trainer Box", "Prismatic Evolutions Pokémon Center Elite Trainer Box"],
    ["Chaos Rising 3 Pack Blister [Charmeleon] [CRI - 3]", "Chaos Rising 3 Pack Blister [Charmeleon]"],
    ["First Partner Illustration Collection - Series 3 MAX 1 PER CUSTOMER WAVE 2 DATE TBD", "First Partner Illustration Collection - Series 3"],
    ["Perfect Order - 3pk Blister (MAX 2 PER CUSTOMER)", "Perfect Order - 3pk Blister"],
    ["(Local Pickup Only) Pokemon Scarlet & Violet: 151 Blooming Waters Premium Collection", "151 Blooming Waters Premium Collection"],
    ["Ascended Heroes - First Partners Deluxe Pin Collection (LIVESTREAM ONLY)", "Ascended Heroes - First Partners Deluxe Pin Collection"],
    ["WEBSTORE 1 PER CUSTOMER Pokémon TCG: Scarlet & Violet 10.5 - Black Bolt - Binder Collection Zekrom", "Black Bolt - Binder Collection Zekrom"],
    ["Pokémon TCG - Mega Evolution - 30th Celebration - Ditto Premium Collection - 2026-11-06", "30th Celebration - Ditto Premium Collection"],
    ["Pokémon TCG - Scarlet & Violet - Unova Poster Collection - TBD", "Unova Poster Collection"],
    ["Phantasmal Flames Enhanced 2-Pack Blisters | Pokemon TCG", "Phantasmal Flames Enhanced 2-Pack Blisters"],
    ["Terapagos ex Ultra-Premium Collection⁣ - Scarlet & Violet Products English / No", "Terapagos ex Ultra-Premium Collection"],
    ["Chaos Rising - Single Pack Blister (anglais)", "Chaos Rising - Single Pack Blister"],
    ["POSTER COLLECTION BLACK & WHITE UNOVA (INGLÉS)", "Poster Collection Black & White Unova"],
    ["30th Anniversary Ultra Premium Collection [ENGLISH VER]", "30th Anniversary Ultra Premium Collection"],
    ["HS Base Set Ember Spark Theme Deck (Factory Sealed)", "HS Base Set Ember Spark Theme Deck"],
    ["Card Game Sword & Shield Fusion Strike Triple Blister Pack Official Factory Sealed", "Card Game Sword & Shield Fusion Strike Triple Blister Pack"],
    ["30th Celebration - Ultra-Premium Collection (Presale)", "30th Celebration - Ultra-Premium Collection"],
    ["Charizard X EX Ultra-Premium Collection (UPC)", "Charizard X EX Ultra-Premium Collection"],
    ["Paradox Rift 3 Pack Blister - Paradox Rift", "Paradox Rift 3 Pack Blister"],
    ["Pokemon Go Premium Collection - Radiant Eevee — Pokémon GO", "Pokemon Go Premium Collection - Radiant Eevee"],
    ["Charizard EX Premium Collection Box - Pokemon", "Charizard EX Premium Collection Box"],
    ["PALDEA PALS MINI TIN", "Paldea Pals Mini Tin"],
    ["DRAGON MAJESTY LEGENDS OF UNOVA GX COLLECTION BOX (RESHIRAM & ZEKROM)", "Dragon Majesty Legends of Unova GX Collection Box (Reshiram & Zekrom)"],
    ["2026 MEGA MOONLIT TIN CLEFABLE EX (MAX 1 PER CUSTOMER)", "2026 Mega Moonlit Tin Clefable ex"],
    ["SHINING FATES - PREMIUM COLLECTION - DRAGAPULT V/CROBAT V", "Shining Fates - Premium Collection - Dragapult V/Crobat V"],
    ["Pokemon Surging Sparks ETB Brand New", "Surging Sparks ETB"],
    ["ME Lumiose City - Mini Tin (Single Unit) - 20% VAT", "Lumiose City - Mini Tin (Single Unit)"],
    ["Eeveelution Premium Collection Set (Flareon, Jolteon, Vaporeon) READ ITEM DESCRIPTION", "Eeveelution Premium Collection Set (Flareon, Jolteon, Vaporeon)"],
  ];
  for (const [input, want] of cases) {
    const got = cleanName(input);
    assert.equal(got, want, input);
    assert.equal(cleanName(got), got, `idempotent: ${got}`);
  }
  assert.equal(titleCase("XY MEGA MEWTWO EX BOX"), "XY Mega Mewtwo EX Box");
  assert.equal(titleCase("MEGA LATIAS EX BOX"), "Mega Latias ex Box");
});

test("a box with a tear, rip, dent, crease or cut seal is not the sealed product's price", () => {
  for (const t of [
    "Pokemon - Forbidden Light Elite Trainer Box (small tear)",
    "151 Elite Trainer Box (Small Rip In Plastic)",
    "Pokemon Crown Zenith Elite Trainer Box (Torn Seal)",
    "Celebrations Ultra-Premium Collection - Celebrations (Seal has cut)",
    "Pokémon TCG - Scarlet and Violet Surging Sparks Elite Trainer Box [Corner Dent, SEAL INTACT]",
    "Pokemon Pikachu V Box Brilliant Stars - (Slight Crease)",
    "Pokémon XY Steam Siege Booster Box (Slight Damage) | XY11",
    "League Battle Deck [Ice Rider Calyrex VMAX] (Minor Box Damage)",
    "Pokemon XY Evolutions Checklane Blister - Greninja (Rips & Damage To Cardboard Packaging)",
  ]) {
    assert.equal(key(t), "REJECT:not-sealed", t);
  }
  // Ordinary names with none of those words are untouched.
  assert.equal(key("Surging Sparks Elite Trainer Box"), "sv8|etb");
  assert.equal(key("Pokémon TCG: Scream Tail Premium Collection").startsWith("REJECT"), false);
});

test("a '+' with a whole product on each side is two products; a product and its contents is one", () => {
  assert.equal(key("Pokemon Chilling Reign Booster Box + Crobat Premium Collection Box"), "REJECT:multiple");
  assert.equal(key("Pokemon TCG: Obsidian Flames - Booster Box + Elite Trainer Box"), "REJECT:multiple");
  assert.equal(key("Pokemon - Poke Ball Tin + 2 Kanto Power Mini Tins - Ultra Ball"), "REJECT:multiple");
  assert.equal(key("Pokémon TCG Triple Whammy Tin – Darkrai Promo + Booster Packs").startsWith("tin|"), true);
  assert.equal(key("Prismatic Evolutions Surprise Box (Official Eeveelution Promo + 4 Booster Packs)").startsWith("collection|sv8pt5"), true);
  assert.equal(key("Surging Sparks Elite Trainer Box + Promo"), "sv8|etb");
});
