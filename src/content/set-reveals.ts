// Card lists for the set-reveal posts (src/lib/blog/posts/set-reveals.tsx), and Reality Fracture's product facts. Names, numbers,
// type lines, Scryfall pages and images are Scryfall's (api.scryfall.com, `set:trk r:mythic` and `set:fra r:mythic`, read
// 24 October 2026), main-set collector numbers only (300 and under). Images are Scryfall's own, hotlinked unmodified.
// Reality Fracture's products, MSRPs and treatments are Wizards of the Coast's Collecting Reality Fracture article (published
// 8 September 2026, read 24 October 2026), copied, never guessed. No card prices: the site has no singles data.

export interface ScryfallCard {
  name: string;
  number: string;
  type: string;
  url: string;
  image: string;
}

/** Scryfall's "normal" (488×680) image of the same card for a "small" image URL: Scryfall's own file, never altered. */
export const scryfallNormal = (url: string) => url.replace("cards.scryfall.io/small/", "cards.scryfall.io/normal/");

export const CARDS_CHECKED = "2026-10-24";
export const SCRYFALL_TRK = {
  label: "Scryfall's Star Trek (TRK) card list",
  url: "https://scryfall.com/sets/trk",
};
export const SCRYFALL_FRA = {
  label: "Scryfall's Reality Fracture (FRA) card list",
  url: "https://scryfall.com/sets/fra",
};
export const WIZARDS_COLLECTING_FRA = {
  label: "Wizards of the Coast's Collecting Reality Fracture article",
  url: "https://magic.wizards.com/en/news/feature/collecting-reality-fracture",
};
export const WIZARDS_FRA_GALLERY = {
  label: "Wizards of the Coast's Reality Fracture card image gallery",
  url: "https://magic.wizards.com/en/products/reality-fracture/card-image-gallery",
};

export const FRA_WORDS = "Reality Fracture";

export const FRA_DATES = {
  prerelease: { from: "2026-09-25", to: "2026-10-01" },
  arena: "2026-09-29",
  release: "2026-10-02",
} as const;

/** Main-set make-up, per Wizards. */
export const FRA_MAKEUP = {
  commons: 71,
  uncommons: 109,
  rares: 64,
  mythics: 26,
} as const;

/** Each product, what it holds and its US MSRP (US cents), per Wizards' article. */
export const FRA_PRODUCTS: readonly {
  name: string;
  holds: string;
  msrpUsCents: number | null;
  each: string;
}[] = [
  {
    name: "Play Booster",
    holds:
      "14 Magic cards plus a non-foil punch-out counter card or double-sided token: 5–6 commons (1 booster in 55 swaps one for a Special Guests card), 1 uncommon, 1 common or uncommon, 3 echoed pairs cards, 1 rare or mythic rare, 1 traditional foil card and 1 land. 30 boosters to a box.",
    msrpUsCents: 549,
    each: "booster",
  },
  {
    name: "Collector Booster",
    holds:
      "15 Magic cards plus an art card or traditional foil double-sided token: 4 traditional foil commons, 2 traditional foil uncommons, 3 traditional foil uncommon echoed pairs, 1 traditional foil tower basic land, 1 traditional foil rare or mythic rare, 1 non-foil rare or mythic braintwister series card or Booster Fun Commander card, 2 non-foil rare or mythic Booster Fun cards and 1 foil rare or mythic Booster Fun card. 12 boosters to a box.",
    msrpUsCents: 2699,
    each: "booster",
  },
  {
    name: "Bundle",
    holds:
      "9 Play Boosters, 1 traditional foil promo card, 30 basic lands (15 traditional foil, 15 non-foil), 2 reference cards, a spindown die and a card-storage box.",
    msrpUsCents: 5799,
    each: "bundle",
  },
  {
    name: "Secret Lair Bundle",
    holds:
      "6 Play Boosters, 2 Collector Boosters, 2 of 10 traditional foil Secret Lair promo cards, 20 traditional foil tower basic lands, a spindown die and a card-storage box.",
    msrpUsCents: 8999,
    each: "bundle",
  },
  {
    name: "Draft Night",
    holds:
      "12 Play Boosters, 1 Collector Booster, 90 non-foil basic lands, 10 non-foil double-sided tokens and a draft insert.",
    msrpUsCents: 8999,
    each: "kit",
  },
  {
    name: "Prerelease Pack",
    holds:
      "6 Play Boosters, 1 traditional foil promo card, a deck box and a spindown die.",
    msrpUsCents: null,
    each: "pack",
  },
  {
    name: "Multiverse Reforged Commander Deck",
    holds:
      "100 cards: a traditional foil borderless face commander, a traditional foil borderless featured commander and 98 non-foil cards (16 of them new to Magic), plus 10 double-sided tokens, a reference card and a deck box.",
    msrpUsCents: 4999,
    each: "deck",
  },
  {
    name: "Foundations Commander Deck",
    holds:
      "Five 100-card decks (Calling All Angels, Keen Engineering, Wretched Ranks, Reign of Dragons, Tramplesaurus Rex), each with a traditional foil borderless face commander and 99 non-foil cards, 10 double-sided tokens, a reference card and a deck box.",
    msrpUsCents: 2999,
    each: "deck",
  },
];

/** The Booster Fun, in Wizards' words and numbers. */
export const FRA_TREATMENTS: readonly { name: string; what: string }[] = [
  {
    name: "Serialized Bloodline Recollector",
    what: "500 serialized double rainbow foil copies, in Collector Boosters only, always in English, in under 1% of Collector Boosters. Wizards: serialized cards are mechanically identical to their non-serialized counterparts.",
  },
  {
    name: "Shattered mirror cards",
    what: "5 rares and 8 mythic rares. Non-foil in Play and Collector Boosters; facet foil only in Collector Boosters, always in English, about 6,000 copies of each rare and about 3,000 of each mythic.",
  },
  {
    name: "Japan Showcase",
    what: "Collector Boosters only, in traditional or fracture foil. Wizards' captions name the five Elder Sphinxes: Aerid Konstrari, Denzilore Fatehold, Ingris Stingerquill, Kwia Vigorbloom and Uldaros Theorix.",
  },
  {
    name: "Borderless echoed pairs",
    what: "10 uncommons, 14 rares and 6 mythic rares.",
  },
  {
    name: "Braintwister series",
    what: "5 uncommons, 15 rares and 3 mythic rares; the non-foil rare and mythic ones are a Collector Booster slot.",
  },
  { name: "Sculptor's stronghold", what: "18 rares and 7 mythic rares." },
  {
    name: "Special Guests",
    what: "10 borderless cards making one 10-card panorama by Marina Banker. Non-foil in Play Boosters (1 in 55), traditional foil in Collector Boosters.",
  },
  {
    name: "Borderless portal view lands",
    what: "5 rares: Deserted Beach, Haunted Ridge, Overgrown Farmland, Rockfall Vale and Shipwreck Marsh.",
  },
  {
    name: "Borderless tower basic lands",
    what: "15, three of each basic land type, each type a 3-card vertorama.",
  },
];

export const STAR_TREK_MYTHICS: readonly ScryfallCard[] = [
  {
    name: "Captain Jean-Luc Picard",
    number: "7",
    type: "Legendary Creature — Human Officer",
    url: "https://scryfall.com/card/trk/7/captain-jean-luc-picard",
    image:
      "https://cards.scryfall.io/small/front/b/7/b7114271-eb05-41e2-ad96-a34f53492312.jpg?1792508148",
  },
  {
    name: "Dr. Beverly Crusher",
    number: "13",
    type: "Legendary Creature — Human Doctor",
    url: "https://scryfall.com/card/trk/13/dr-beverly-crusher",
    image:
      "https://cards.scryfall.io/small/front/e/f/ef9c5790-d909-4271-90bd-5fa4816ddd6b.jpg?1784065540",
  },
  {
    name: "Excalbian Gamemaster",
    number: "16",
    type: "Creature — Excalbian",
    url: "https://scryfall.com/card/trk/16/excalbian-gamemaster",
    image:
      "https://cards.scryfall.io/small/front/3/1/31b5780c-8c5f-4836-8848-1eea1d416a93.jpg?1792753846",
  },
  {
    name: "U.S.S. Enterprise-A, Free Spirit",
    number: "43",
    type: "Legendary Artifact — Spacecraft",
    url: "https://scryfall.com/card/trk/43/uss-enterprise-a-free-spirit",
    image:
      "https://cards.scryfall.io/small/front/9/9/99429015-6e5d-4ecf-aaf7-eba181bcffc7.jpg?1792508162",
  },
  {
    name: "Kobayashi Maru Scenario",
    number: "68",
    type: "Enchantment",
    url: "https://scryfall.com/card/trk/68/kobayashi-maru-scenario",
    image:
      "https://cards.scryfall.io/small/front/c/7/c7fb72cc-1bc6-4774-9798-44824de46c72.jpg?1792508172",
  },
  {
    name: "Lieutenant Commander Data",
    number: "69",
    type: "Legendary Artifact Creature — Android Scientist",
    url: "https://scryfall.com/card/trk/69/lieutenant-commander-data",
    image:
      "https://cards.scryfall.io/small/front/c/6/c6d5da51-6c74-4dd5-a532-cf4c2a7b601c.jpg?1792508182",
  },
  {
    name: "Mr. Spock, Science Officer",
    number: "74",
    type: "Legendary Creature — Vulcan Human Scientist",
    url: "https://scryfall.com/card/trk/74/mr-spock-science-officer",
    image:
      "https://cards.scryfall.io/small/front/d/1/d19fc127-669e-4264-935a-e5991e6c0964.jpg?1792508192",
  },
  {
    name: "Scotty, Miracle Worker",
    number: "79",
    type: "Legendary Creature — Human Artificer",
    url: "https://scryfall.com/card/trk/79/scotty-miracle-worker",
    image:
      "https://cards.scryfall.io/small/front/4/2/42f77f9e-5e56-45ac-aa93-36353c92bca9.jpg?1792758783",
  },
  {
    name: "Seven of Nine, Unassimilated",
    number: "80",
    type: "Legendary Artifact Creature — Human Officer",
    url: "https://scryfall.com/card/trk/80/seven-of-nine-unassimilated",
    image:
      "https://cards.scryfall.io/small/front/d/d/ddc517bd-27e1-4688-8941-a41c312bd782.jpg?1792508210",
  },
  {
    name: "Death Is Irrelevant",
    number: "102",
    type: "Enchantment",
    url: "https://scryfall.com/card/trk/102/death-is-irrelevant",
    image:
      "https://cards.scryfall.io/small/front/4/0/408cb5dd-1a79-47a9-98ea-41f3f4502c5e.jpg?1792668404",
  },
  {
    name: "Georgiou, Terran Emperor",
    number: "110",
    type: "Legendary Creature — Human Rogue Noble",
    url: "https://scryfall.com/card/trk/110/georgiou-terran-emperor",
    image:
      "https://cards.scryfall.io/small/front/a/6/a68361a3-83fa-44b5-92b5-b7905866fc99.jpg?1792753873",
  },
  {
    name: "Khan, Vengeful Heart",
    number: "119",
    type: "Legendary Creature — Human Warrior",
    url: "https://scryfall.com/card/trk/119/khan-vengeful-heart",
    image:
      "https://cards.scryfall.io/small/front/a/6/a6f47b34-02fb-41d2-978a-a6d0a47ee8ba.jpg?1792551016",
  },
  {
    name: "Captain James T. Kirk",
    number: "142",
    type: "Legendary Creature — Human Officer",
    url: "https://scryfall.com/card/trk/142/captain-james-t-kirk",
    image:
      "https://cards.scryfall.io/small/front/4/0/40a0466d-20bb-4ed5-858d-947fb9144580.jpg?1784036779",
  },
  {
    name: "Q, Stacking the Deck",
    number: "165",
    type: "Legendary Creature — Q",
    url: "https://scryfall.com/card/trk/165/q-stacking-the-deck",
    image:
      "https://cards.scryfall.io/small/front/d/c/dcbe34db-0065-4960-92b8-3ea1d336e803.jpg?1792508237",
  },
  {
    name: "Quark, Humble Proprietor",
    number: "166",
    type: "Legendary Creature — Ferengi Rogue",
    url: "https://scryfall.com/card/trk/166/quark-humble-proprietor",
    image:
      "https://cards.scryfall.io/small/front/9/6/96104754-57e2-46e9-948d-628aab2aa0ad.jpg?1792508242",
  },
  {
    name: "Captain Kathryn Janeway",
    number: "187",
    type: "Legendary Creature — Human Officer",
    url: "https://scryfall.com/card/trk/187/captain-kathryn-janeway",
    image:
      "https://cards.scryfall.io/small/front/d/1/d17ea45c-7f9c-411f-b7d3-ca7100ffe53b.jpg?1784036788",
  },
  {
    name: "Dr. Joseph M'Benga",
    number: "196",
    type: "Legendary Creature — Human Doctor",
    url: "https://scryfall.com/card/trk/196/dr-joseph-mbenga",
    image:
      "https://cards.scryfall.io/small/front/c/2/c27e6865-40ba-406c-9dce-d8a7a9b8035b.jpg?1792508272",
  },
  {
    name: "Borg Cube",
    number: "227",
    type: "Artifact — Spacecraft",
    url: "https://scryfall.com/card/trk/227/borg-cube",
    image:
      "https://cards.scryfall.io/small/front/e/5/e58f7310-3fd5-48d5-b6b7-a5d3e1808bbc.jpg?1792508285",
  },
  {
    name: "Crystalline Entity",
    number: "261",
    type: "Artifact Creature — Elemental",
    url: "https://scryfall.com/card/trk/261/crystalline-entity",
    image:
      "https://cards.scryfall.io/small/front/c/b/cbc4ac70-0a4c-4973-a366-dd67d8901e21.jpg?1784036804",
  },
  {
    name: "Deep Space 9",
    number: "263",
    type: "Legendary Artifact — Spacecraft",
    url: "https://scryfall.com/card/trk/263/deep-space-9",
    image:
      "https://cards.scryfall.io/small/front/7/6/76b039c5-e0a1-410a-954b-52f304e31f7f.jpg?1792508419",
  },
  {
    name: "Starfleet Academy",
    number: "297",
    type: "Legendary Land",
    url: "https://scryfall.com/card/trk/297/starfleet-academy",
    image:
      "https://cards.scryfall.io/small/front/2/d/2da8d3bf-4397-4844-90d6-dd888becc804.jpg?1792508542",
  },
];
export const REALITY_FRACTURE_MYTHICS: readonly ScryfallCard[] = [
  {
    name: "Emrakul, the Exigent Doom",
    number: "1",
    type: "Legendary Creature — Eldrazi",
    url: "https://scryfall.com/card/fra/1/emrakul-the-exigent-doom",
    image:
      "https://cards.scryfall.io/small/front/c/3/c3ff8dd3-88a8-49dc-a59b-e2748680623c.jpg?1790829846",
  },
  {
    name: "Enlightened Confidant",
    number: "5",
    type: "Creature — Kor Cleric",
    url: "https://scryfall.com/card/fra/5/enlightened-confidant",
    image:
      "https://cards.scryfall.io/small/front/4/8/483fcc58-cc6e-4452-a696-7b38e117c837.jpg?1788329184",
  },
  {
    name: "Return to the Light Realms",
    number: "20",
    type: "Sorcery",
    url: "https://scryfall.com/card/fra/20/return-to-the-light-realms",
    image:
      "https://cards.scryfall.io/small/front/9/e/9e72f397-2384-40f1-882b-f627664d97df.jpg?1788878107",
  },
  {
    name: "Seasoned Cryomancer",
    number: "38",
    type: "Creature — Human Wizard",
    url: "https://scryfall.com/card/fra/38/seasoned-cryomancer",
    image:
      "https://cards.scryfall.io/small/front/5/1/51d86875-420d-4e82-b69c-4feeb99c9428.jpg?1789470781",
  },
  {
    name: "The Theorist, Jace Beleren",
    number: "43",
    type: "Legendary Planeswalker — Jace",
    url: "https://scryfall.com/card/fra/43/the-theorist-jace-beleren",
    image:
      "https://cards.scryfall.io/small/front/2/0/20bb8c55-4b0b-425f-8201-b54fa2fdde86.jpg?1788329228",
  },
  {
    name: "Bloodline Recollector // Ancestral Craving",
    number: "49",
    type: "Creature — Vampire Warlock // Instant",
    url: "https://scryfall.com/card/fra/49/bloodline-recollector-ancestral-craving",
    image:
      "https://cards.scryfall.io/small/front/4/f/4fcc913e-f736-460a-b24b-022fa2e861b9.jpg?1788329264",
  },
  {
    name: "Darklight Phoenix",
    number: "53",
    type: "Creature — Phoenix",
    url: "https://scryfall.com/card/fra/53/darklight-phoenix",
    image:
      "https://cards.scryfall.io/small/front/e/c/ec454979-3839-4be3-a34a-9d25482948ba.jpg?1789470810",
  },
  {
    name: "Overwrite the Multiverse",
    number: "59",
    type: "Sorcery",
    url: "https://scryfall.com/card/fra/59/overwrite-the-multiverse",
    image:
      "https://cards.scryfall.io/small/front/c/4/c4554f5b-791b-48f6-bf54-ad28699e1beb.jpg?1788952080",
  },
  {
    name: "Craterclaw Colossus",
    number: "78",
    type: "Artifact Creature — Beast Construct",
    url: "https://scryfall.com/card/fra/78/craterclaw-colossus",
    image:
      "https://cards.scryfall.io/small/front/4/7/47793a51-08c6-4ad2-a7e5-a4484d83a5cd.jpg?1788329298",
  },
  {
    name: "Stingcaster Mage",
    number: "93",
    type: "Creature — Human Wizard",
    url: "https://scryfall.com/card/fra/93/stingcaster-mage",
    image:
      "https://cards.scryfall.io/small/front/2/d/2d8e8e5f-3bf5-490d-aa9c-9df2b26f1460.jpg?1788329303",
  },
  {
    name: "Hexhaven Invigorator",
    number: "106",
    type: "Creature — Chimera Horror",
    url: "https://scryfall.com/card/fra/106/hexhaven-invigorator",
    image:
      "https://cards.scryfall.io/small/front/9/a/9a446cae-e93c-4574-8ffd-7688f9729a8a.jpg?1788878191",
  },
  {
    name: "Omnipresence",
    number: "110",
    type: "Enchantment",
    url: "https://scryfall.com/card/fra/110/omnipresence",
    image:
      "https://cards.scryfall.io/small/front/e/a/eaf9dc77-c83b-49cf-84be-6bd791cb925e.jpg?1790558797",
  },
  {
    name: "Tarmogoyf",
    number: "116",
    type: "Creature — Lhurgoyf",
    url: "https://scryfall.com/card/fra/116/tarmogoyf",
    image:
      "https://cards.scryfall.io/small/front/8/b/8be5ee47-8f8a-4e3c-b1a1-9ca0e1fdec7f.jpg?1789127270",
  },
  {
    name: "Aerid Konstrari",
    number: "121",
    type: "Legendary Creature — Elder Sphinx",
    url: "https://scryfall.com/card/fra/121/aerid-konstrari",
    image:
      "https://cards.scryfall.io/small/front/f/1/f17d2792-b075-4c47-ad38-e7a7eaee5f8c.jpg?1788878199",
  },
  {
    name: "Avatar of Burgeoning Echoes",
    number: "122",
    type: "Creature — Avatar",
    url: "https://scryfall.com/card/fra/122/avatar-of-burgeoning-echoes",
    image:
      "https://cards.scryfall.io/small/front/5/9/5905995b-7a20-4602-a7cc-90aa5089a082.jpg?1788878208",
  },
  {
    name: "Denzilore Fatehold",
    number: "128",
    type: "Legendary Creature — Elder Sphinx",
    url: "https://scryfall.com/card/fra/128/denzilore-fatehold",
    image:
      "https://cards.scryfall.io/small/front/9/8/986f9e98-9d8d-428b-9187-860745cf3269.jpg?1788878215",
  },
  {
    name: "Ingris Stingerquill",
    number: "137",
    type: "Legendary Creature — Elder Sphinx",
    url: "https://scryfall.com/card/fra/137/ingris-stingerquill",
    image:
      "https://cards.scryfall.io/small/front/6/4/6471b135-33a8-4005-9a07-ebb74e0bf145.jpg?1788878212",
  },
  {
    name: "Kwia Vigorbloom",
    number: "140",
    type: "Legendary Creature — Elder Sphinx",
    url: "https://scryfall.com/card/fra/140/kwia-vigorbloom",
    image:
      "https://cards.scryfall.io/small/front/2/d/2d6ff182-a853-4898-895b-072c89324ca7.jpg?1788878236",
  },
  {
    name: "Uldaros Theorix",
    number: "159",
    type: "Legendary Creature — Elder Sphinx",
    url: "https://scryfall.com/card/fra/159/uldaros-theorix",
    image:
      "https://cards.scryfall.io/small/front/a/7/a7ad622a-42ff-48fa-ae95-12e0a5bd9387.jpg?1788878220",
  },
  {
    name: "The Echoverse Fulcrum",
    number: "169",
    type: "Legendary Artifact",
    url: "https://scryfall.com/card/fra/169/the-echoverse-fulcrum",
    image:
      "https://cards.scryfall.io/small/front/d/7/d71d250f-c0e0-44b2-877c-76f3bcab4f34.jpg?1789385887",
  },
  {
    name: "Ajani Resolute",
    number: "195",
    type: "Legendary Planeswalker — Ajani",
    url: "https://scryfall.com/card/fra/195/ajani-resolute",
    image:
      "https://cards.scryfall.io/small/front/a/5/a5e1a7dd-8c49-4435-935c-bcc78704082b.jpg?1788329189",
  },
  {
    name: "Chandra, Chill of Compliance",
    number: "212",
    type: "Legendary Planeswalker — Chandra",
    url: "https://scryfall.com/card/fra/212/chandra-chill-of-compliance",
    image:
      "https://cards.scryfall.io/small/front/2/4/240f58ab-944c-4f4c-9df9-5f40b132bf3e.jpg?1788329242",
  },
  {
    name: "Garruk, Veiled Butcher",
    number: "229",
    type: "Legendary Planeswalker — Garruk",
    url: "https://scryfall.com/card/fra/229/garruk-veiled-butcher",
    image:
      "https://cards.scryfall.io/small/front/d/4/d48bfb8a-d135-45f3-be99-4694b4b9ab93.jpg?1788329269",
  },
  {
    name: "Ajani Unrelenting",
    number: "242",
    type: "Legendary Planeswalker — Ajani",
    url: "https://scryfall.com/card/fra/242/ajani-unrelenting",
    image:
      "https://cards.scryfall.io/small/front/b/c/bc3c096f-7f6c-474c-a2c8-75d3e6ddd6f5.jpg?1788329317",
  },
  {
    name: "Chandra, Torch of Defiance",
    number: "244",
    type: "Legendary Planeswalker — Chandra",
    url: "https://scryfall.com/card/fra/244/chandra-torch-of-defiance",
    image:
      "https://cards.scryfall.io/small/front/4/0/40cb22c8-cb03-45c9-bb0e-b8cabdcc43cd.jpg?1788329325",
  },
  {
    name: "Garruk, Curse Breaker",
    number: "259",
    type: "Legendary Planeswalker — Garruk",
    url: "https://scryfall.com/card/fra/259/garruk-curse-breaker",
    image:
      "https://cards.scryfall.io/small/front/9/0/90ca5812-ceb5-46bd-b049-aed7ff10e6af.jpg?1788329370",
  },
];
