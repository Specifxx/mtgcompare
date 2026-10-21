import { test } from "node:test";
import assert from "node:assert/strict";
import { refusedForType, refusedListing } from "../src/lib/ebay-rules";
import type { TypeKey } from "../src/lib/sealed-title";

// Real titles from the live price rows (2026-10-11): the product's eBay listings sit at the TOP of its price list, lowest price
// first, so a part, a promo card or the wrong variant would lead the page. Each must be refused for that product, and the
// ordinary sealed listings beside them kept.
const refused = (t: string, type: TypeKey) => refusedListing(t) || refusedForType(t, type);

test("refused: a product's contents, a single card or promo, parts-only, a non-Pokémon-Center ETB on a Pokémon Center page, one item 'w/ case' on a case page", () => {
  for (const [t, type] of [
    ["3 Promo Sealed Pokemon 30th Anniversary Energy Packs From Elite Trainer Box", "etb"],
    ["Pokemon 151 Poster From Poster Collection Box (Poster Only) NEW!", "collection"],
    ["Pokémon TCG Snorlax 051 Scarlet & Violet 151 Elite Trainer Box Promo Sealed", "etb"],
    ["Charizard ex 199/165 Pokemon 151 Elite Trainer Box", "etb"],
    ["Pokemon 151 Elite Trainer Box Sealed, Non-Pokemon Center, Pristine", "pc-etb"],
    ["151 ETB SEALED w/ case pokemon TCG Scarlet & Violet 151 Elite Trainer Box", "etb-case"],
    ["Pokemon Surging Sparks Booster Box with acrylic case", "booster-box-case"],
    ["Pokemon Prismatic Evolutions Sleeves Only from Elite Trainer Box", "etb"],
  ] as [string, TypeKey][])
    assert.ok(refused(t, type), `${type}: ${t}`);
});

test("kept: the ordinary sealed listings next to them (shipping 'from', a regular ETB that says non-PC, a real case, a promo the product includes)", () => {
  for (const [t, type] of [
    ["Pokemon 151 Elite Trainer Box Sealed, Non-Pokemon Center, Pristine", "etb"],
    ["151 ETB SEALED w/ case pokemon TCG Scarlet & Violet 151 Elite Trainer Box", "etb"],
    ["Pokemon Scarlet & Violet 151 Elite Trainer Box Case 10 ETBs Factory Sealed", "etb-case"],
    ["Pokemon 30th Celebration Elite Trainer Box Sealed - Ships From USA", "etb"],
    ["Pokemon Pitch Black Booster Box 36 Packs Sealed Ships from Pokemon Center", "booster-box"],
    ["Pokemon Paldean Fates Tin Charizard ex Promo Card Sealed", "tin"],
    ["Pokemon TCG 151 Ultra Premium Collection UPC Factory Sealed", "upc"],
    ["Pokemon TCG: Scarlet & Violet 151 Zapdos EX Collection Box New & Sealed", "collection"],
    ["Pokémon TCG Scarlet & Violet 151 Mini Tin Gengar & Poliwag", "tin"],
    ["Pokemon 151 Binder Collection New Factory Sealed", "collection"],
  ] as [string, TypeKey][])
    assert.ok(!refused(t, type), `${type}: ${t}`);
});

// The 2026-10-11 audit: 1,854 live rows judged by hand; these rules catch 154 of the 176 wrong ones and hide 7 of the 1,678 right
// ones (German-language, pre-order and "8x" listings the judges let through). A sample of each kind stays pinned here.
test("audit: wrong rows of every kind are refused for their page's product type", () => {
  for (const [t, type] of [
    ["Pokemon Trading Card Game Prismatic Evolutions Premium Figure Collection 2-Inch", "collection"],
    ["Pokémon TCG Mega Evolution Phantasmal Flames Booster Pack Whimsicott Promo Card", "booster-pack"],
    ["Phantasmal Flames Single Pack Blister Whimsicott 5 Packs $50", "blister"],
    ["[TRAINER TIPS] Phantasmal Flames - Build & Battle (Mega Gengar ex ver.)", "build-battle"],
    ["Toxtricity Phantasmal Flames Prerelease/Build Battle Promo Deck MEP 017 SEALED", "build-battle"],
    ["76 Crobat PROMO - Chaos Rising Build & Battle", "build-battle"],
    ["Zarude 088 Pokemon Center Exclusive Pitch Black Elite Trainer Box Promo", "pc-etb"],
    ["Pokemon - ME Battle Deck Promo - Haunter #027", "deck"],
    ["Open Live Prismatic Evolutions Mini Tin English Pokemon Trading Card Game", "tin"],
    ["Pokémon TCG Prismatic Evolutions Poster Collection ONLY PROMOS/POSTER", "collection"],
    ["Pokemon Tcg Perfect Order Pokemon Centre ETB Brand New And Sealed With 11 Packs", "etb"],
    ["Pokemon Center 151 Elite Trainer Box ETB Scarlet Violet TCG New Sealed W/TEAR", "pc-etb"],
    ["Pokemon TCG Card Ascended Heroes Booster Bundle Factory Sealed & Protective Case", "booster-bundle-case"],
    ["Dragonite 151 Surprise Mini Tin with Guaranteed IR!", "tin"],
    ["Pokémon Mega-Entwicklung: Chaos Rising Booster-Bundle (ENG)", "booster-pack"],
    ["PET Schutzhülle Pokemon 30th Celebration Elite Trainer Box ETB | 0,5 mm | DE/EN", "etb"],
    ["Pokemon Erhabene Helden TTB Top Trainer Box Ascended Heroes Neu!", "etb"],
    ["Pokemon 151 Elite Trainer Box (Loch in der Folie) ETB Sealed OVP Englisch", "etb"],
    ["Pokémon TCG Scarlet & Violet Twilight Masquerade & Stellar Crown Booster Boxes", "booster-box"],
    ["Pokemon Surging Sparks – Elite Trainer Box – 2 Stück – Englisch – NEU & OVP", "etb"],
    ["(HEAVY) 151.41g Ascended Heroes Booster Bundle", "booster-bundle"],
    ["Pokemon TCG: Pitch Black & Chaos Rising Booster Bundle Gengar Marshadow Mimikyu", "booster-bundle"],
    ["Silver Tempest Elite Trainer Box ETB 151 Go Pokemon Cards TCG Brand New & Sealed", "etb"],
    ["Prismatic Evolutions Elite Trainer Box *Outer Sleeve* Eevee Umbreon Pokemon Card", "etb"],
    ["ACE 9 - Mew ex - Pokemon 151 Ultra Premium Collection Promo - Pokemon", "upc"],
    ["2021 POKEMON SWSH CELEBRATIONS COLLECTION #139 PIKACHU V-UNION", "collection"],
    ["[36 Packs] Destined Rivals Booster Packs Pokemon Card | SEALED", "booster-box"],
    ["Pokemon 151 5 Pack Mini Tin Box Magneton - Brand New Sealed", "tin"],
    ["Pokemon Prismatic Evolutions Accessory Pouch Special Collection (POUCH ONLY!!)", "collection"],
    ["Pokémon TCG: 30th Celebration - Elite Trainer Box ETB / 2 Pack Blister - New", "etb"],
    ["Pokémon TCG Phantasmal Flames Booster Box 36 Packs Factory Sealed + Case", "booster-box-case"],
    ["Pokemon Ascended Heroes Tech Sticker Collection 4x", "collection"],
    ["2 Pokemon TCG ME2.5 Ascended Heroes Tech Sticker Collection Bundle Sealed New", "collection"],
    ["Pokemon 151 Booster Pack China Sealed | Mew EX SAR", "booster-pack"],
    ["Slowpoke Promo MEP 086 Pitch Black Checklane", "blister"],
    ["Pokemon TCG Prismatic Evolutions elite trainer box (2 tiny holes in wrap)", "etb"],
  ] as [string, TypeKey][])
    assert.ok(refused(t, type), `${type}: ${t}`);
});

test("audit: right rows stay (an 18-pack display, a 2-pack mini tin, live-sale numbering, a promo set on a blister, a pack count on a bundle)", () => {
  for (const [t, type] of [
    ["Pokemon TCG Pitch Black Booster Display Box - 18 Packs - Factory Sealed New", "booster-box"],
    ["Pokemon 30th Celebration 2 Pack Mini Tin Mewtwo sealed", "tin"],
    ["#001 - Ascended Heroes Booster Pack", "booster-pack"],
    ["Pokemon TCG: Chaos Rising Premium Checklane Booster Blister FLYGON PROMO SET", "blister"],
    ["Pokemon TCG - Shrouded Fable Booster Bundle NEW & SEALED [6 Packs]", "booster-bundle"],
    ["Pokemon Chilling Reign Build & Battle - Factory Sealed", "build-battle"],
    ["Pokémon TCG Prismatic Evolutions Surprise Box - New Sealed", "collection"],
    ["Pokémon TCG Mega Evolution—Ascended Heroes Mega Meganium ex Box Promo Booster", "collection"],
    ["Pokémon Center Mega Evolution—Chaos Rising Elite Trainer Box Promo Fennekin EN", "pc-etb"],
    ["Pokemon Paldean Fates Top Trainer Box Englisch OVP SEALED", "etb"],
    ["Pokemon TCG 151 Scarlet and Violet Booster Bundle Sealed Case (10 x Bundles)", "booster-bundle-case"],
    ["Pokemon Chaos Rising Booster Box New Sealed shipping pack of 50", "booster-box"],
    ["Pokemon 30th Celebration Anniversary Booster Bundle (6 packs) rip or ship", "booster-bundle"],
    ["Pokémon TCG Prismatic Evolutions Jolteon Mini Tin 2x Booster Packs Sealed", "tin"],
    ["Pokemon TCG: Unova Heavy Hitters Premium Collection Black Bolt White Flare", "collection"],
    ["Pokémon TCG League Battle Deck Single Strike Urshifu VMAX 60 Cards 18$ 2021 MPN", "deck"],
    ["SEALED CASE! 6x Booster Box Journey Together Pokemon TCG SV09", "booster-box-case"],
    ["Pokemon TCG Mega Evolution Pitch Black Checklane Blister Slowpoke Promo MEP 086", "blister"],
  ] as [string, TypeKey][])
    assert.ok(!refused(t, type), `${type}: ${t}`);
});
