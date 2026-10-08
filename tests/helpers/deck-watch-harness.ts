// Fixtures shared by the deck tests (tests/commander-rules, deck, published-decks, deck-watch). Not a test file. Owner WP10.
//   * REAL DECKS: a Modern 60 + 15 (Boros burn), a Pauper 60 + 15 (mono-red burn) and a Commander 100 (Atraxa, Praetors' Voice), as the plain text a player pastes.
//   * REAL FACTS: the oracle rows of every card in them and of the cards the rule tests lean on (Mana Crypt, Thrasios, Wilson, Rose Tyler ...), read from the published dataset of
//     2026-10-07 (`npm run import:bootstrap`; the 22-character legality string is in FORMATS order, the identity is a WUBRG mask, the flags are ORACLE_FLAGS).
//   * THE WATCH RUN: a DeckSource that resolves with the real resolver over the 57 products of Annex A (realMiniTree, served as PLANE_DIR) and reads listings from fixture rows whose
//     prices are the products' own TCGplayer lows; a database stand-in that records what the run writes.
import fs from "node:fs";
import path from "node:path";
import type { DeckEntry, RuleOracle } from "../../src/lib/commander-rules";
import { copyLimitFromText, entryKey } from "../../src/lib/commander-rules";
import { parseDeckList } from "../../src/lib/deck";
import type { DeckData } from "../../src/lib/deck-price";
import type { DeckSource, DeckWatchDb, DeckWatchItem } from "../../src/lib/deck-watch";
import type { BasketListingTuple, CardLite, OracleDetail, OracleMini } from "../../src/lib/data";
import { fold, nkey } from "../../src/lib/constants";
import { MARKETS } from "../../src/lib/country";
import type { EntitlementFields } from "../../src/lib/premium";
import { resetPlaneForTests } from "../../src/lib/data/plane/runtime";
import { realMiniTree, writePlaneDir } from "./data-source";

// ── real decks ───────────────────────────────────────────────────────────────────────────────────────────────────────────────

export const DECKS = {
  /** Boros burn, Modern: 60 cards and a 15-card sideboard (Arena layout: a Deck block, a blank line, a Sideboard block). */
  modern: `Deck
4 Goblin Guide
4 Monastery Swiftspear
4 Eidolon of the Great Revel
4 Lightning Bolt
4 Lava Spike
4 Rift Bolt
4 Boros Charm
4 Skewer the Critics
4 Light Up the Stage
2 Searing Blaze
2 Lightning Helix
4 Inspiring Vantage
4 Sacred Foundry
4 Sunbaked Canyon
4 Arid Mesa
4 Mountain

Sideboard
3 Smash to Smithereens
3 Deflecting Palm
3 Rending Volley
2 Tormod's Crypt
2 Wear // Tear
2 Dragon's Rage Channeler`,
  /** Mono-red burn, Pauper: 60 cards and 15 (MTGO layout: two blocks split by a blank line, no headers). */
  pauper: `4 Lightning Bolt
4 Chain Lightning
4 Burst Lightning
4 Firebolt
4 Lava Spike
4 Rift Bolt
4 Fireblast
4 Skred
4 Keldon Marauders
4 Goblin Bushwhacker
4 Mogg Flunkies
16 Mountain

3 Smash to Smithereens
4 Flame Slash
4 Cleansing Wildfire
4 Faithless Looting`,
  /** Atraxa, Praetors' Voice: the commander and 99 cards (Arena layout), every card inside white, blue, black and green. */
  atraxa: `Commander
1 Atraxa, Praetors' Voice

Deck
1 Sol Ring
1 Arcane Signet
1 Thought Vessel
1 Mind Stone
1 Fellwar Stone
1 Chromatic Lantern
1 Swiftfoot Boots
1 Lightning Greaves
1 Cultivate
1 Kodama's Reach
1 Rampant Growth
1 Farseek
1 Nature's Lore
1 Three Visits
1 Doubling Season
1 Hardened Scales
1 Winding Constrictor
1 Evolution Sage
1 Contagion Engine
1 Vorinclex, Monstrous Raider
1 Deepglow Skate
1 Cyclonic Rift
1 Counterspell
1 Rhystic Study
1 Mystic Remora
1 Smothering Tithe
1 Toxic Deluge
1 Farewell
1 Swords to Plowshares
1 Path to Exile
1 Beast Within
1 Generous Gift
1 Krosan Grip
1 Sylvan Library
1 Eternal Witness
1 Esper Sentinel
1 Bloom Tender
1 Heroic Intervention
1 Anguished Unmaking
1 Utter End
1 Vindicate
1 Mortify
1 Despark
1 Reclamation Sage
1 Wrath of God
1 Austere Command
1 Sakura-Tribe Elder
1 Oracle of Mul Daya
1 Cultivator's Caravan
1 Mirari's Wake
1 Tezzeret's Gambit
1 Command Tower
1 Exotic Orchard
1 Reflecting Pool
1 Breeding Pool
1 Overgrown Tomb
1 Watery Grave
1 Godless Shrine
1 Temple Garden
1 Hallowed Fountain
1 Sunpetal Grove
1 Woodland Cemetery
1 Drowned Catacomb
1 Isolated Chapel
1 Glacial Fortress
10 Forest
9 Island
8 Plains
7 Swamp`,
} as const;

// ── real facts ───────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** name -> [oracle number, type line, WUBRG identity, 22-character legality string (FORMATS order), ORACLE_FLAGS] */
export type Fact = [no: number, typeLine: string, identity: number, legal: string, flags: number];
export const REAL_ORACLES: Record<string, Fact> = {
  "Goblin Guide": [11652, "Creature — Goblin Scout", 8, "NNNNNNLLNLNLLNNNNNLNLL", 0],
  "Monastery Swiftspear": [18367, "Creature — Human Monk", 8, "NNLLLLLLBLNLLNLLNLLNNL", 0],
  "Eidolon of the Great Revel": [8217, "Enchantment Creature — Spirit", 8, "NNLLLLLLNLNLLNLLNNLNNL", 0],
  "Lightning Bolt": [16320, "Instant", 8, "NNBLLNLLLLNLLNLLNLLLLL", 0],
  "Lava Spike": [16001, "Sorcery — Arcane", 8, "NNNNNNLLLLNLLNNNNLLNLL", 0],
  "Rift Bolt": [23060, "Sorcery", 8, "NNNNNNLLLLNLLNNNNLLNLL", 0],
  "Boros Charm": [3289, "Instant", 9, "LLLLLLLLNLNLLLLLLNLNNL", 0],
  "Skewer the Critics": [25671, "Sorcery", 8, "NNLLLLLLLLNLLNLLNLLNNL", 0],
  "Light Up the Stage": [16305, "Sorcery", 8, "NNLLLLLLNLNLLNLLNNLNNL", 0],
  "Searing Blaze": [24513, "Instant", 8, "NNNNNNLLLLNLLNNNNLLNLL", 0],
  "Lightning Helix": [16331, "Instant", 9, "LLLLLLLLNLNLLLLLNNLNLL", 0],
  "Inspiring Vantage": [14227, "Land", 9, "LLLLLLLLNLNLLLLLNNLNNL", 0],
  "Sacred Foundry": [23757, "Land — Mountain Plains", 9, "LLLLLLLLNLNLLLLLLNLNLL", 0],
  "Sunbaked Canyon": [27752, "Land", 9, "NNLLLNLLNLNLLNLLNNLNNL", 0],
  "Arid Mesa": [1340, "Land", 0, "NNBLLNLLNLNLLNLLNNLNLL", 0],
  "Mountain": [18560, "Basic Land — Mountain", 8, "LLLLLLLLLLLLLLLLLLLLLL", 0],
  "Smash to Smithereens": [26020, "Instant", 8, "NNLLLLLLLLLLLNLLNLLNLL", 0],
  "Deflecting Palm": [6750, "Instant", 9, "NNLLLLLLNLLLLNLLNNLNNL", 0],
  "Rending Volley": [22709, "Instant", 8, "NNLLLLLLNLNLLNLLNNLNNL", 0],
  "Tormod's Crypt": [29934, "Artifact", 0, "NNLLLLLLLLNLLNLLNLLLLL", 0],
  "Wear // Tear": [32294, "Instant // Instant", 9, "NNLLLLLLNLNLLNLLNNLNNL", 0],
  "Dragon's Rage Channeler": [7606, "Creature — Human Shaman", 8, "NNLLLNLLNLNLLNLLNNLNNL", 0],
  "Chain Lightning": [4431, "Sorcery", 8, "NNLLLNNLLLNLLNLLNLLNLL", 0],
  "Burst Lightning": [3809, "Instant", 8, "LLLLLLLLLLLLLLLLLLLNLL", 0],
  "Firebolt": [9880, "Sorcery", 8, "NNNNNNLLLLNLLNNNNLLLLL", 0],
  "Fireblast": [9879, "Instant", 8, "NNBLLNNLLLNLLNLLNLLLLN", 0],
  "Skred": [25723, "Instant", 8, "NNNNNNLLLLNLLNNNNLLNLL", 0],
  "Keldon Marauders": [15233, "Creature — Human Warrior", 8, "NNNNNNLLLLLLLNNNNLLNLL", 0],
  "Goblin Bushwhacker": [11601, "Creature — Goblin Warrior", 8, "NNLLLNLLLLNLLNLLNLLNLL", 0],
  "Mogg Flunkies": [18263, "Creature — Goblin", 8, "NNLLLNLLLLLLLNLLNLLLLL", 0],
  "Flame Slash": [9982, "Sorcery", 8, "NNLLLNLLLLNLLNLLNLLNLL", 0],
  "Cleansing Wildfire": [4930, "Sorcery", 8, "NNLLLLLLLLNLLNLLNLLNNL", 0],
  "Faithless Looting": [9306, "Sorcery", 8, "NNLLLNLLLLNLLNLLNLLNNL", 0],
  "Atraxa, Praetors' Voice": [1625, "Legendary Creature — Phyrexian Angel Horror", 23, "NNLLLNNLNLLLLNLLNNLNNN", 4],
  "Sol Ring": [26167, "Artifact", 0, "NNNNNNNBNRNLBNNNNNBNLB", 0],
  "Arcane Signet": [1178, "Artifact", 0, "NNLLLLLLLLNLLLLLLLLNNL", 0],
  "Thought Vessel": [29391, "Artifact", 0, "NNNNNNNLLLNLLNNNNLLNNL", 0],
  "Mind Stone": [17923, "Artifact", 0, "NNLLLNLLLLNLLNLLNLLLLL", 0],
  "Fellwar Stone": [9615, "Artifact", 0, "NNNNNNLLLLNLLNNNNLLLLL", 0],
  "Chromatic Lantern": [4759, "Artifact", 0, "NNLLLLLLNLLLLNLLNNLNNL", 0],
  "Swiftfoot Boots": [28030, "Artifact — Equipment", 0, "LLLLLLLLNLNLLLLLLNLNNL", 0],
  "Lightning Greaves": [16330, "Artifact — Equipment", 0, "NNLLLNLLNLNLLNLLNNLNLL", 0],
  "Cultivate": [6000, "Sorcery", 16, "NNLLLLLLLLLLLNLLNLLNLL", 0],
  "Kodama's Reach": [15589, "Sorcery — Arcane", 16, "NNNNNNLLLLNLLNNNNLLNLL", 0],
  "Rampant Growth": [22161, "Sorcery", 16, "NNLLLNLLLLNLLNLLNLLLLL", 0],
  "Farseek": [9441, "Sorcery", 16, "NNLLLNLLLLNLLNLLNLLNLL", 0],
  "Nature's Lore": [18953, "Sorcery", 16, "NNNNNNNLLLLLLNNNNLLLLL", 0],
  "Three Visits": [29479, "Sorcery", 16, "NNNNNNNLLLNLLNNNNLLNLL", 0],
  "Doubling Season": [7484, "Enchantment", 16, "LLLLLLLLNLLLLLLLLNLNLN", 0],
  "Hardened Scales": [12650, "Enchantment", 16, "NNLLLLLLNLLLLNLLNNLNNL", 0],
  "Winding Constrictor": [32655, "Creature — Snake", 20, "NNLLLLLLNLNLLNLLNNLNNL", 0],
  "Evolution Sage": [9021, "Creature — Elf Druid", 16, "NNLLLLLLNLNLLNLLNNLNNL", 0],
  "Contagion Engine": [5422, "Artifact", 0, "NNLLLNLLNLLLLNLLNNLNLN", 0],
  "Vorinclex, Monstrous Raider": [31817, "Legendary Creature — Phyrexian Praetor", 16, "NNLLLLLLNLNLLNLLNNLNNN", 4],
  "Deepglow Skate": [6684, "Creature — Fish", 2, "NNNNNNNLNLNLLNNNNNLNNN", 0],
  "Cyclonic Rift": [6145, "Instant", 2, "NNLLLLLLNLLLLNLLNNLNNL", 2],
  "Counterspell": [5614, "Instant", 2, "NNLLLNLLLLNLLNLLNLLLLL", 0],
  "Rhystic Study": [23018, "Enchantment", 2, "NNLLLNNLLLNLLNLLNBLLLL", 2],
  "Mystic Remora": [18804, "Enchantment", 2, "NNLLLNNLLLNLLNLLNBLLLL", 0],
  "Smothering Tithe": [26068, "Enchantment", 1, "NNLLLLLLNLLLLNLLNNLNNN", 2],
  "Toxic Deluge": [30010, "Sorcery", 4, "NNLLLNLLNLNLLNLLNNLNNL", 0],
  "Farewell": [9426, "Sorcery", 1, "NNLLLLLLNLNLLNLLNNLNNN", 2],
  "Swords to Plowshares": [28073, "Instant", 1, "NNBLLNNLNLNLLNLLNNLLLL", 0],
  "Path to Exile": [20471, "Instant", 1, "NNLLLNLLNLNLLNLLNNLNLL", 0],
  "Beast Within": [2354, "Instant", 16, "NNLLLNLLNLNLLNLLNNLNLL", 0],
  "Generous Gift": [10993, "Instant", 1, "NNNNNNLLLLNLLNNNNLLNNL", 0],
  "Krosan Grip": [15740, "Instant", 16, "NNLLLNLLNLLLLNLLNNLNLL", 0],
  "Sylvan Library": [28096, "Enchantment", 16, "NNLLLNNLNLNLLNLLNNLLLL", 0],
  "Eternal Witness": [8923, "Creature — Human Shaman", 16, "NNLLLNLLNLNLLNLLNNLNLL", 0],
  "Esper Sentinel": [8862, "Artifact Creature — Human Soldier", 1, "NNLLLNLLNLNLLNLLNNLNNL", 0],
  "Bloom Tender": [3022, "Creature — Elf Druid", 16, "LLLLLLLLNLLLLLLLLNLNLL", 0],
  "Heroic Intervention": [13078, "Instant", 16, "NNLLLLLLNLLLLNLLNNLNNL", 0],
  "Anguished Unmaking": [954, "Instant", 5, "NNLLLLLLNLLLLNLLNNLNNL", 0],
  "Utter End": [31009, "Instant", 5, "NNLLLLLLNLLLLNLLNNLNNN", 0],
  "Vindicate": [31515, "Sorcery", 5, "NNLLLNLLNLLLLNLLNNLLLL", 0],
  "Mortify": [18519, "Instant", 5, "LLLLLLLLNLNLLLLLLNLNLL", 0],
  "Despark": [6943, "Instant", 5, "NNLLLLLLNLNLLNLLNNLNNL", 0],
  "Reclamation Sage": [22492, "Creature — Elf Shaman", 16, "LLLLLLLLNLNLLLLLLNLNNL", 0],
  "Wrath of God": [32991, "Sorcery", 1, "NNLLLNLLNLLLLNLLNNLLLN", 0],
  "Austere Command": [1723, "Sorcery", 1, "NNLLLNLLNLLLLNLLNNLNLN", 0],
  "Sakura-Tribe Elder": [23853, "Creature — Snake Shaman", 16, "NNNNNNLLLLNLLNNNNLLNLL", 0],
  "Oracle of Mul Daya": [19961, "Creature — Elf Shaman", 16, "NNLLLNLLNLLLLNLLNNLNLN", 0],
  "Cultivator's Caravan": [6004, "Artifact — Vehicle", 0, "LLLLLLLLNLLLLLLLLNLNNL", 0],
  "Mirari's Wake": [18025, "Enchantment", 17, "NNLLLNLLNLLLLNLLNNLLLN", 0],
  "Tezzeret's Gambit": [28764, "Sorcery", 2, "NNLLLNLLNLLLLNLLNNLNLN", 0],
  "Command Tower": [5237, "Land", 0, "NNLLLLLLLLNLLLLLLLLNNL", 0],
  "Exotic Orchard": [9084, "Land", 0, "NNNNLNLLNLLLLNNNNNLNLL", 0],
  "Reflecting Pool": [22575, "Land", 0, "NNLLLNLLNLNLLNLLNNLLLL", 0],
  "Breeding Pool": [3507, "Land — Forest Island", 18, "LLLLLLLLNLLLLLLLLNLNLL", 0],
  "Overgrown Tomb": [20201, "Land — Swamp Forest", 20, "LLLLLLLLNLLLLLLLLNLNLL", 0],
  "Watery Grave": [32236, "Land — Island Swamp", 6, "LLLLLLLLNLLLLLLLLNLNLL", 0],
  "Godless Shrine": [11768, "Land — Plains Swamp", 5, "LLLLLLLLNLLLLLLLLNLNLL", 0],
  "Temple Garden": [28567, "Land — Forest Plains", 17, "LLLLLLLLNLLLLLLLLNLNLL", 0],
  "Hallowed Fountain": [12542, "Land — Plains Island", 3, "LLLLLLLLNLNLLLLLLNLNLL", 0],
  "Sunpetal Grove": [27810, "Land", 17, "NNLLLLLLNLLLLNLLLNLNLL", 0],
  "Woodland Cemetery": [32895, "Land", 20, "NNLLLLLLNLLLLNLLLNLNNL", 0],
  "Drowned Catacomb": [7833, "Land", 6, "NNLLLLLLNLLLLNLLLNLNLL", 0],
  "Isolated Chapel": [14504, "Land", 5, "NNLLLLLLNLLLLNLLLNLNNL", 0],
  "Glacial Fortress": [11336, "Land", 3, "NNLLLLLLNLLLLNLLLNLNLL", 0],
  "Forest": [10338, "Basic Land — Forest", 16, "LLLLLLLLLLLLLLLLLLLLLL", 0],
  "Island": [14497, "Basic Land — Island", 2, "LLLLLLLLLLLLLLLLLLLLLL", 0],
  "Plains": [20998, "Basic Land — Plains", 1, "LLLLLLLLLLLLLLLLLLLLLL", 0],
  "Swamp": [27979, "Basic Land — Swamp", 4, "LLLLLLLLLLLLLLLLLLLLLL", 0],
  "Mana Crypt": [17136, "Artifact", 0, "NNNNNNNBNRNBBNNNNNBNBB", 0],
  "Black Lotus": [2647, "Artifact", 0, "NNNNNNNBNRNBBNNNNNBNBB", 1],
  "Thrasios, Triton Hero": [29459, "Legendary Creature — Merfolk Wizard", 18, "NNLLLNNLNLNLLNLLNNLNNL", 12],
  "Tymna the Weaver": [30523, "Legendary Creature — Human Cleric", 5, "NNLLLNNLNLNLLNLLNNLNNL", 12],
  "Pir, Imaginative Rascal": [20926, "Legendary Creature — Human", 16, "NNNNNNNLNLNLLNNNNNLNNL", 12],
  "Toothy, Imaginary Friend": [29880, "Legendary Creature — Illusion", 2, "NNNNNNNLNLNLLNNNNNLNNN", 12],
  "Wilson, Refined Grizzly": [32629, "Legendary Creature — Bear Warrior", 16, "NNNNNNNLNLNLLNNNNNLNNL", 36],
  "Acolyte of Bahamut": [176, "Legendary Enchantment — Background", 16, "NNNNNNNLNLNLLNNNNNLNNL", 16],
  "Raised by Giants": [22045, "Legendary Enchantment — Background", 16, "NNNNNNNLNLNLLNNNNNLNNN", 16],
  "Rose Tyler": [23466, "Legendary Creature — Human", 1, "NNNNNNNLNLNLLNNNNNLNNL", 4],
  "The Tenth Doctor": [29182, "Legendary Creature — Time Lord Doctor", 10, "NNNNNNNLNLNLLNNNNNLNNN", 4],
  "Chandra, Torch of Defiance": [4522, "Legendary Planeswalker — Chandra", 8, "LLLLLLLLNLNLLLLLLNLNNN", 0],
  "Jace, the Mind Sculptor": [14580, "Legendary Planeswalker — Jace", 2, "NNLLLNLLNLNLLNLLNNLNLN", 0],
  "Relentless Rats": [22654, "Creature — Rat", 4, "NNLLLNLLLLLLLNLLNLLNLL", 0],
  "Seven Dwarves": [24881, "Creature — Dwarf", 8, "NNLLLLLLLLNLLNLLNLLNNL", 0],
  "Nazgûl": [18978, "Creature — Wraith Knight", 4, "NNLLLNLLNLNLLNLLNNLNNL", 0],
  "Dragon's Approach": [7595, "Sorcery", 8, "NNLLLLLLLLNLLNLLNLLNNL", 0],
  "Persistent Petitioners": [20624, "Creature — Human Advisor", 2, "NNLLLLLLLLLLLNLLNLLNNL", 0],
  "Hare Apparent": [12656, "Creature — Rabbit Noble", 1, "LLLLLLLLLLNLLLLLLLLNNL", 0],
  "Ravenous Chupacabra": [22296, "Creature — Beast Horror", 4, "NNLLLLLLNLNLLNLLNNLNNN", 0],
  "Edgewalker": [8185, "Creature — Human Cleric", 5, "NNNNNNNLNLNLLNNNNNLLLL", 0],
  "Fire // Ice": [9837, "Instant // Instant", 10, "NNNNNNLLLLNLLNNNNLLLLL", 0],
  "Delver of Secrets // Insectile Aberration": [6793, "Creature — Human Wizard // Creature — Human Insect", 2, "NNLLLLLLLLNLLNLLNLLNNL", 0],
  "Birds of Paradise": [2600, "Creature — Bird", 16, "NNLLLNLLNLLLLNLLNNLLLL", 0],
  "Snow-Covered Island": [26115, "Basic Snow Land — Island", 2, "NNLLLLLLLLNLLNLLNLLLLL", 0],
  "Wastes": [32185, "Basic Land", 0, "LLLLLLLLLLNLLLLLLLLNNL", 0],
  "Gaea's Cradle": [10729, "Legendary Land", 16, "NNNNNNNLNLNLLNNNNNBLLB", 3],
  "Sheoldred, the Apocalypse": [25105, "Legendary Creature — Phyrexian Praetor", 4, "NNLLLLLLNLNLLNLLNNLNNN", 4],
  "Korvold, Fae-Cursed King": [15650, "Legendary Creature — Dragon Noble", 28, "NNLLLLLLNLLLLNLLNNLNNN", 4],
  "Kenrith, the Returned King": [15265, "Legendary Creature — Human Noble", 31, "NNLLLLLLNLLLLNLLNNLNNN", 4],
  "Dig Through Time": [7076, "Instant", 2, "NNLLLLBBNRLLLNLLNNBNNN", 0],
  "Treasure Cruise": [30161, "Sorcery", 2, "NNLLLLBBBRNLLNLLNLBNNN", 0],
  "Mox Opal": [18592, "Legendary Artifact", 0, "NNBLLNLLNLNLLNLLNNBNLB", 0],
  "Mental Misstep": [17640, "Instant", 2, "NNNNNNBBNRNLLNNNNNLNLL", 0],
  "Time Walk": [29706, "Sorcery", 2, "NNNNNNNBNRNBBNNNNNBNBB", 1],
  "Demonic Tutor": [6834, "Sorcery", 4, "NNBRLNNBNRNLLNBLNNLNLB", 2],
  "Birthing Pod": [2607, "Artifact", 16, "NNNNNNBLNLNLLNNNNNLNLN", 0],
  "Ragavan, Nimble Pilferer": [21976, "Legendary Creature — Monkey Pirate", 8, "NNBLLNLBNLNLLNLBNNBNNL", 4],
  "Ancestral Recall": [824, "Instant", 2, "NNNNNNNBNRNBBNNNNNBNBB", 1],
  "Snapcaster Mage": [26085, "Creature — Human Wizard", 2, "NNLLLNLLNLNLLNLLNNLNNL", 0],
};
/** The rules text and keywords (kebab-case, as published) of the cards whose ability the rules read: partners, backgrounds, the Doctor's companion, "any number of cards named". */
export const REAL_TEXTS: Record<string, { slug: string; text: string | null; keywords: string[] }> = {
  "Thrasios, Triton Hero": { slug: "thrasios-triton-hero", text: "{4}: Scry 1, then reveal the top card of your library. If it's a land card, put it onto the battlefield tapped. Otherwise, draw a card.\nPartner (You can have two commanders if both have partner.)", keywords: ["partner","scry"] },
  "Tymna the Weaver": { slug: "tymna-the-weaver", text: "Lifelink\nAt the beginning of each of your postcombat main phases, you may pay X life, where X is the number of opponents that were dealt combat damage this turn. If you do, draw X cards.\nPartner (You can have two commanders if both have partner.)", keywords: ["lifelink","partner"] },
  "Pir, Imaginative Rascal": { slug: "pir-imaginative-rascal", text: "Partner with Toothy, Imaginary Friend (When this creature enters, target player may put Toothy into their hand from their library, then shuffle.)\nIf one or more counters would be put on a permanent your team controls, that many plus one of each of those kinds of counters are put on that permanent instead.", keywords: ["partner-with","partner"] },
  "Toothy, Imaginary Friend": { slug: "toothy-imaginary-friend", text: "Partner with Pir, Imaginative Rascal (When this creature enters, target player may put Pir into their hand from their library, then shuffle.)\nWhenever you draw a card, put a +1/+1 counter on Toothy.\nWhen Toothy leaves the battlefield, draw a card for each +1/+1 counter on it.", keywords: ["partner-with","partner"] },
  "Wilson, Refined Grizzly": { slug: "wilson-refined-grizzly", text: "This spell can't be countered.\nReach, vigilance, trample\nWard {2} (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays {2}.)\nChoose a Background (You can have a Background as a second commander.)", keywords: ["reach","vigilance","choose-a-background","trample","ward"] },
  "Acolyte of Bahamut": { slug: "acolyte-of-bahamut", text: "Commander creatures you own have \"The first Dragon spell you cast each turn costs {2} less to cast.\"", keywords: [] },
  "Raised by Giants": { slug: "raised-by-giants", text: "Commander creatures you own have base power and toughness 10/10 and are Giants in addition to their other types.", keywords: [] },
  "Rose Tyler": { slug: "rose-tyler", text: "Rose Tyler gets +1/+1 for each time counter on it.\nBad Wolf — Whenever Rose Tyler attacks, put a time counter on it for each suspended card you own and each other permanent you control with a time counter on it.\nDoctor's companion (You can have two commanders if the other is the Doctor.)", keywords: ["bad-wolf","doctor's-companion"] },
  "The Tenth Doctor": { slug: "the-tenth-doctor", text: "Allons-y! — Whenever you attack, exile cards from the top of your library until you exile a nonland card. Put three time counters on it. If it doesn't have suspend, it gains suspend.\nTimey-Wimey — {7}: Time travel three times. Activate only as a sorcery. (For each suspended card you own and each permanent you control with a time counter on it, you may add or remove a time counter. Then do it two more times.)", keywords: ["allons-y!","time-travel","timey-wimey"] },
  "Relentless Rats": { slug: "relentless-rats", text: "This creature gets +1/+1 for each other creature on the battlefield named Relentless Rats.\nA deck can have any number of cards named Relentless Rats.", keywords: [] },
  "Seven Dwarves": { slug: "seven-dwarves", text: "This creature gets +1/+1 for each other creature named Seven Dwarves you control.\nA deck can have up to seven cards named Seven Dwarves.", keywords: [] },
  "Nazgûl": { slug: "nazgul", text: "Deathtouch\nWhen this creature enters, the Ring tempts you.\nWhenever the Ring tempts you, put a +1/+1 counter on each Wraith you control.\nA deck can have up to nine cards named Nazgûl.", keywords: ["deathtouch"] },
  "Dragon's Approach": { slug: "dragons-approach", text: "Dragon's Approach deals 3 damage to each opponent. You may exile this spell and four cards named Dragon's Approach from your graveyard. If you do, search your library for a Dragon creature card, put it onto the battlefield, then shuffle.\nA deck can have any number of cards named Dragon's Approach.", keywords: [] },
  "Persistent Petitioners": { slug: "persistent-petitioners", text: "{1}, {T}: Target player mills a card. (They put the top card of their library into their graveyard.)\nTap four untapped Advisors you control: Target player mills twelve cards.\nA deck can have any number of cards named Persistent Petitioners.", keywords: ["mill"] },
  "Shadowborn Apostle": { slug: "shadowborn-apostle", text: "A deck can have any number of cards named Shadowborn Apostle.\n{B}, Sacrifice six creatures named Shadowborn Apostle: Search your library for a Demon creature card, put it onto the battlefield, then shuffle.", keywords: [] },
  "Atraxa, Praetors' Voice": { slug: "atraxa-praetors-voice", text: "Flying, vigilance, deathtouch, lifelink\nAt the beginning of your end step, proliferate. (Choose any number of permanents and/or players, then give each another counter of each kind already there.)", keywords: ["deathtouch","flying","lifelink","vigilance","proliferate"] },
};

/** The RuleOracle of a real card (with its text where the rules read it). */
export function ruleOracle(name: string): RuleOracle {
  const f = REAL_ORACLES[name];
  if (!f) throw new Error(`no real facts for ${name}`);
  const t = REAL_TEXTS[name];
  return { no: f[0], name, typeLine: f[1], identity: f[2], legal: f[3], flags: f[4], ...(t ? { oracleText: t.text, keywords: t.keywords } : {}) };
}

/** A pasted list as rule entries: every name found among the real facts (a name that is not is an error in the test), same card and zone merged, the copy-limit clause read where the card has text. */
export function entriesFor(text: string, rarityOf: Readonly<Record<string, string>> = {}): DeckEntry[] {
  const out = new Map<string, DeckEntry>();
  for (const l of parseDeckList(text)) {
    const oracle = ruleOracle(l.name), key = `${entryKey(oracle, l.name)}|${l.zone}`;
    const prev = out.get(key);
    if (prev) prev.qty += l.qty;
    else out.set(key, { key: entryKey(oracle, l.name), name: l.name, qty: l.qty, zone: l.zone, oracle, rarity: rarityOf[l.name] ?? null, copyLimit: copyLimitFromText(oracle.oracleText) });
  }
  return [...out.values()];
}

// ── real printings, and a DeckData over them ─────────────────────────────────────────────────────────────────────────────────

/** name -> [product id, SET, collector number, rarity, Normal [market, low] or null, Foil [market, low] or null], USD cents: the printing a bare name resolves to (the CHEAP one) in the dataset of 2026-10-07, for the Atraxa deck and a few more. */
export type Printing = [id: number, setCode: string, number: string, rarity: string, n: [number | null, number | null] | null, f: [number | null, number | null] | null];
export const REAL_PRINTINGS: Record<string, Printing> = {
  "Atraxa, Praetors' Voice": [484652, "MUL", "33", "M", [2567, 2200], [2801, 2350]],
  "Sol Ring": [719218, "FDC", "286", "U", [101, 82], null],
  "Arcane Signet": [719175, "FDC", "245", "U", [37, 19], null],
  "Thought Vessel": [719224, "FDC", "292", "U", [207, 150], null],
  "Mind Stone": [466914, "DMR", "385", "C", [21, 10], [286, 50]],
  "Fellwar Stone": [717781, "FRC", "57", "U", [55, 28], null],
  "Chromatic Lantern": [717776, "FRC", "54", "R", [48, 10], null],
  "Swiftfoot Boots": [719223, "FDC", "291", "U", [147, 125], null],
  "Lightning Greaves": [631235, "FIC", "349", "U", [375, 360], null],
  "Cultivate": [456927, "SCD", "177", "U", [38, 1], null],
  "Kodama's Reach": [124554, "C16", "155", "C", [152, 150], null],
  "Rampant Growth": [108020, "C15", "199", "C", [39, 40], null],
  "Farseek": [631713, "PLST", "LCC-242", "C", [40, 36], null],
  "Nature's Lore": [710589, "PLST", "CMM-904", "C", [161, 146], null],
  "Three Visits": [697599, "MSC", "181", "U", [555, 460], null],
  "Doubling Season": [657764, "PZA", "11", "M", [2939, 2201], [3198, 3000]],
  "Hardened Scales": [631305, "FIC", "307", "R", [191, 180], null],
  "Winding Constrictor": [126369, "AER", "140", "U", [47, 15], [237, 85]],
  "Evolution Sage": [582950, "PLST", "WAR-159", "U", [233, 188], null],
  "Contagion Engine": [544825, "OTP", "61", "M", [1285, 1000], [1253, 1051]],
  "Vorinclex, Monstrous Raider": [230137, "KHM", "333", "M", [3400, 3050], [3962, 3799]],
  "Deepglow Skate": [642796, "EOC", "70", "R", [32, 1], null],
  "Cyclonic Rift": [218370, "2XM", "47", "R", [3025, 2299], [3693, 3316]],
  "Counterspell": [718988, "FDC", "61", "U", [203, 125], null],
  "Rhystic Study": [7357, "PCY", "45", "C", [5914, 4900], [38999, 39800]],
  "Mystic Remora": [459038, "DMR", "288", "R", [1058, 884], [1931, 1800]],
  "Smothering Tithe": [200217, "PRNA", "22p", "R", [5585, 5344], [5859, 6449]],
  "Toxic Deluge": [698035, "MSC", "161", "R", [497, 355], null],
  "Farewell": [631183, "FIC", "242", "R", [414, 385], null],
  "Swords to Plowshares": [717768, "FRC", "37", "U", [87, 68], null],
  "Path to Exile": [717721, "FRC", "30", "U", [62, 51], null],
  "Beast Within": [719117, "FDC", "190", "U", [45, 33], null],
  "Generous Gift": [698177, "MSC", "133", "U", [92, 79], null],
  "Krosan Grip": [132077, "CMA", "123", "U", [77, 75], null],
  "Sylvan Library": [636335, "SLD", "2058", "R", [2668, 2467], null],
  "Eternal Witness": [107947, "C15", "183", "U", [151, 117], null],
  "Esper Sentinel": [240035, "MH2", "12", "R", [5810, 5400], [7647, 6842]],
  "Bloom Tender": [672277, "PECL", "166p", "M", [1315, 1412], [1428, 1476]],
  "Heroic Intervention": [668491, "MAR", "80", "M", [917, 700], [1063, 849]],
  "Anguished Unmaking": [624626, "TDC", "279", "R", [154, 105], null],
  "Utter End": [92836, "KTK", "210", "R", [20, 10], [61, 25]],
  "Vindicate": [631281, "FIC", "330", "R", [34, 1], null],
  "Mortify": [591064, "FDN", "662", "U", [19, 10], null],
  "Despark": [717801, "FRC", "50", "U", [28, 10], null],
  "Reclamation Sage": [226985, "CMR", "248", "U", [20, 5], [26, 19]],
  "Wrath of God": [457924, "DMR", "279", "R", [350, 152], [474, 400]],
  "Austere Command": [718945, "FDC", "18", "R", [29, 20], null],
  "Sakura-Tribe Elder": [559856, "BLC", "236", "C", [29, 17], null],
  "Oracle of Mul Daya": [641997, "EOC", "102", "R", [203, 192], null],
  "Cultivator's Caravan": [591077, "FDN", "670", "R", [16, 2], null],
  "Mirari's Wake": [710588, "PLST", "MH2-291", "M", [304, 270], null],
  "Tezzeret's Gambit": [582693, "PLST", "NPH-47", "U", [19, 1], null],
  "Command Tower": [717733, "FRC", "22", "C", [23, 10], null],
  "Exotic Orchard": [717740, "FRC", "70", "R", [16, 10], null],
  "Reflecting Pool": [717734, "FRC", "23", "R", [600, 503], null],
  "Breeding Pool": [182842, "RNA", "246", "R", [975, 862], [1403, 1187]],
  "Overgrown Tomb": [66417, "RTR", "243", "R", [875, 699], [2047, 1499]],
  "Watery Grave": [175205, "GRN", "259", "R", [931, 799], [1411, 1279]],
  "Godless Shrine": [645534, "PEOE", "254p", "R", [864, 751], [1029, 899]],
  "Temple Garden": [66421, "RTR", "248", "R", [723, 581], [1780, 1426]],
  "Hallowed Fountain": [66415, "RTR", "241", "R", [710, 628], [1982, 1543]],
  "Sunpetal Grove": [710623, "PLST", "BLC-335", "R", [26, 24], null],
  "Woodland Cemetery": [579362, "DSC", "326", "R", [62, 40], null],
  "Drowned Catacomb": [717739, "FRC", "69", "R", [47, 10], null],
  "Isolated Chapel": [717744, "FRC", "74", "R", [25, 10], null],
  "Glacial Fortress": [642852, "EOC", "160", "R", [28, 1], null],
  "Forest": [192849, "M20", "279", "L", [8, 1], [30, 8]],
  "Island": [115929, "SOI", "287", "L", [7, 2], [29, 14]],
  "Plains": [122791, "KLD", "251", "L", [6, 1], [33, 22]],
  "Swamp": [67831, "DDK", "78", "L", [10, 9], null],
  "Thrasios, Triton Hero": [632702, "FCA", "58", "M", [1827, 1297], [17660, 11955]],
  "Tymna the Weaver": [632197, "FCA", "18", "R", [1076, 899], [7242, 6267]],
  "Lightning Bolt": [267061, "CLB", "401", "C", [74, 40], [151, 65]],
  "Mana Crypt": [203005, "PLST", "EMA-225", "M", [3880, 3573], null],
};
const kebab = (s: string): string => fold(s).replace(/\s+/g, "-");

/** The unit-view CardLite of a real printing (the fields the deck code reads are real; the rest is the neutral value). */
export function realCard(name: string, unit?: "N" | "F"): CardLite {
  const p = REAL_PRINTINGS[name], o = REAL_ORACLES[name];
  if (!p || !o) throw new Error(`no real printing for ${name}`);
  const [id, setCode, number, rarity, n, f] = p;
  const quote = (q: [number | null, number | null] | null) => (q ? { market: q[0], low: q[1] } : null);
  const head: "N" | "F" = unit ?? (n ? "N" : "F");
  const own = head === "F" ? f : n, market = own?.[0] ?? null, low = own?.[1] ?? null;
  const zero = Object.fromEntries(MARKETS.map((m) => [m, 0])) as CardLite["stores"];
  return {
    id, slug: `${kebab(name)}-${setCode.toLowerCase()}-${number.toLowerCase()}`, name, alt: null, setId: 0, sc: setCode.toLowerCase(), setCode, number, rarity: rarity as CardLite["rarity"], cls: 0, treat: [], label: null, flags: 0,
    oracleNo: o[0], scryId: null, colorMask: o[2], mv: 0, ptype: 0, marketUsd: market, headFinish: head, valueUsd: market ?? low, lowOnly: market == null && low != null, n: quote(n), f: quote(f), tracked: 0, listed: true, top: false, thin: false,
    low: Object.fromEntries(MARKETS.map((m) => [m, m === "US" ? low : null])) as CardLite["low"], stores: zero, change7d: null, change30d: null, high90Usd: null,
    colors: [], variant: null, printing: "standard", cost: null, cardType: null, hasImage: true,
  };
}
const oracleMini = (name: string): OracleMini => { const o = REAL_ORACLES[name]!; return { no: o[0], slug: REAL_TEXTS[name]?.slug ?? kebab(name), name, nameKey: fold(name), colors: o[2], identity: o[2], typeLine: o[1], nPrint: 1, legal: o[3], flags: o[4] }; };

/** The resolver's data seam over REAL_PRINTINGS: one printing per card, real oracle facts and texts. For the wiring of prepareDeckWith / publishDeck without the 90 MB dataset. */
export function fixtureDeckData(): DeckData {
  const names = Object.keys(REAL_PRINTINGS), byKey = new Map(names.map((n) => [fold(n), n]));
  return {
    oracles: async (keys) => new Map(keys.flatMap((k) => (byKey.has(k) ? [[k, oracleMini(byKey.get(k)!)] as const] : []))),
    bySetNumber: async (pairs) => new Map(pairs.flatMap(({ set, number }) => { const n = names.find((m) => REAL_PRINTINGS[m]![1].toLowerCase() === set.toLowerCase() && nkey(REAL_PRINTINGS[m]![2]) === nkey(number)); return n ? [[`${set.toLowerCase()}|${nkey(number)}`, [realCard(n)]] as const] : []; })),
    cards: async (ids, unit) => new Map(names.filter((n) => ids.includes(REAL_PRINTINGS[n]![0])).map((n) => [REAL_PRINTINGS[n]![0], realCard(n, unit)] as const)),
    printings: async (no) => { const n = names.find((m) => REAL_ORACLES[m]![0] === no), cards = n ? [realCard(n)] : []; return { cards, cheapId: cards[0]?.id ?? null, total: cards.length }; },
    details: async (slugs) => new Map(names.filter((n) => slugs.includes(oracleMini(n).slug)).map((n) => { const o = REAL_ORACLES[n]!, t = REAL_TEXTS[n]; return [oracleMini(n).slug, { no: o[0], scryfallId: "", slug: oracleMini(n).slug, name: n, manaCost: "", manaValue: 0, typeLine: o[1], colors: o[2], identity: o[2], legal: o[3], edhrecRank: null, flags: o[4], layout: "normal", pt: null, loyalty: null, oracleText: t?.text ?? null, keywords: t?.keywords ?? [], faces: 1, nPrint: 1 } satisfies OracleDetail] as const; })),
  };
}

// ── the watch run ────────────────────────────────────────────────────────────────────────────────────────────────────────────

export const NOW = new Date("2026-10-08T12:00:00Z");
export const DAY = 86_400_000;
const future = new Date(NOW.getTime() + 30 * DAY);
export type User = EntitlementFields;
export const premium: User = { isAdmin: false, premiumUntil: future, premiumTier: "premium" };
export const plus: User = { isAdmin: false, premiumUntil: future, premiumTier: "plus" };
export const lapsed: User = { isAdmin: false, premiumUntil: new Date(NOW.getTime() - DAY), premiumTier: "premium" };
export const free: User = { isAdmin: false, premiumUntil: null, premiumTier: "premium" };

/** Serves the 57 real products of Annex A as the site's published data (PLANE_DIR) until the returned function is called. */
export function servePlane(): () => void {
  const dir = writePlaneDir(realMiniTree());
  process.env.PLANE_DIR = dir;
  resetPlaneForTests();
  return () => {
    delete process.env.PLANE_DIR;
    resetPlaneForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  };
}

interface FixtureProduct { productId: number; prices: Partial<Record<"Normal" | "Foil", { market: number | null; low: number | null }>> }
const PRODUCTS = JSON.parse(fs.readFileSync(path.join(__dirname, "../fixtures/magic-products.json"), "utf8")) as FixtureProduct[];
/** The TCGplayer low of a real product's finish in USD cents, as the fixture holds it (null when it has none). */
export function realLowCents(productId: number, finish: "Normal" | "Foil" = "Normal"): number | null {
  const v = PRODUCTS.find((p) => p.productId === productId)?.prices[finish]?.low;
  return v == null ? null : Math.round(v * 100);
}
/** The unit key of a product's finish: productId * 2 + finish, what a listing tuple and a basket card carry. */
export const uidOf = (productId: number, finish: "Normal" | "Foil" = "Normal"): number => productId * 2 + (finish === "Foil" ? 1 : 0);

// The two real products the watch tests price: Birds of Paradise (7th Edition 231, Normal $17.49 low) and Counterspell (Modern Horizons 2 267, $1.99 low). One Foil for the finish test.
export const BIRDS = 2831;
export const COUNTERSPELL = 238617;
export const LIST_TEXT = "2 Birds of Paradise (7ED) 231\n3 Counterspell (MH2) 267";

export interface StoreRow {
  uid: number;
  source: string; // "tcgplayer" or "store:<key>"
  priceCents: number;
  condition?: number | null; // CONDITIONS index (0 = NM)
}
/** Listings at the real TCGplayer lows of the list's units, scaled by `factor` (a later import in which the whole list moved). */
export function lowRows(factor = 1): StoreRow[] {
  const at = (id: number, f: "Normal" | "Foil"): StoreRow => ({ uid: uidOf(id, f), source: "tcgplayer", priceCents: Math.round(realLowCents(id, f)! * factor), condition: 0 });
  return [at(BIRDS, "Normal"), at(COUNTERSPELL, "Normal")];
}

/** A DeckSource over the served plane (the real resolver) and fixture listing rows; counts the listing reads. */
export function fixtureSource(rows: StoreRow[], opts: { fail?: boolean } = {}): DeckSource & { reads: number[][] } {
  const reads: number[][] = [];
  return {
    reads,
    resolve: async (lines) => {
      const { loaderData, resolveDeckLines } = await import("../../src/lib/deck-price");
      return (await resolveDeckLines(lines, loaderData, { options: false })).rows;
    },
    listings: async (_country, uids) => {
      reads.push([...uids]);
      if (opts.fail) throw new Error("listing read failed");
      return rows.filter((r) => uids.includes(r.uid)).map((r): BasketListingTuple => [r.uid, r.source, r.priceCents, r.condition ?? null, `https://example.invalid/${r.uid}`]);
    },
  };
}

export interface DeckRow {
  id: string;
  userId: string;
  market: string;
  name: string;
  listText: string;
  region: string | null;
  trackedOnly: boolean | null;
  minCondition: string | null;
  targetCents: number | null;
  lastTotalCents: number | null;
  lastEmailedCents: number | null;
  lastNotifiedAt: Date | null;
  lastFlaggedAt: Date | null;
  snoozedUntil: Date | null;
  createdAt: Date;
  user: User & { email: string };
}

export function deckRow(id: string, user: User, over: Partial<DeckRow> = {}): DeckRow {
  return {
    id,
    userId: over.userId ?? `u-${id}`,
    market: "US",
    name: `Deck ${id}`,
    listText: LIST_TEXT,
    region: null,
    trackedOnly: null,
    minCondition: null,
    targetCents: null,
    lastTotalCents: null,
    lastEmailedCents: null,
    lastNotifiedAt: null,
    lastFlaggedAt: null,
    snoozedUntil: null,
    createdAt: new Date(NOW.getTime() - 30 * DAY),
    ...over,
    user: { ...user, email: over.user?.email ?? `${id}@example.com` },
  };
}

/** A run over fixture rows: what was written, notified and sent. The plane must be served (servePlane) for the real resolver. */
export function deckHarness(rows: DeckRow[], listings: StoreRow[], opts: { emailEnabled?: boolean; sendOk?: boolean; notifyFails?: boolean; now?: Date } = {}) {
  const writes: { id: string; data: Record<string, unknown> }[] = [];
  const notified: { userId: string; type: string; title: string; href: string | null }[] = [];
  const sent: { to: string; item: DeckWatchItem }[] = [];
  const db = {
    deckWatch: {
      findMany: async () => rows,
      update: (args: { where: { id: string }; data: Record<string, unknown> }) => {
        writes.push({ id: args.where.id, data: args.data });
        return args;
      },
    },
    $transaction: async (ops: unknown[]) => ops,
  } as unknown as DeckWatchDb;
  const source = fixtureSource(listings);
  return {
    writes,
    notified,
    sent,
    source,
    writeFor: (id: string) => writes.find((w) => w.id === id)?.data,
    run: async () => {
      const { runDeckWatches } = await import("../../src/lib/deck-watch");
      return runDeckWatches({
        db,
        source,
        now: opts.now ?? NOW,
        emailEnabled: opts.emailEnabled ?? false,
        notify: async (userId, type, title, _body, href) => {
          if (opts.notifyFails) throw new Error("notify failed");
          notified.push({ userId, type, title, href });
        },
        send: async (to, item) => {
          sent.push({ to, item });
          return opts.sendOk ?? true;
        },
      });
    },
  };
}
