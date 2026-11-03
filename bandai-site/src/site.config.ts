// The ONE game-specific configuration file. BandaiCompare, Cyberpunk Compare,
// YGO Compare, Lorcana Compare and Gundam Compare run the same engine (the
// Rift Compare playbook, rebuilt lean); everything that differs between them —
// names, colours, data sources, stores, copy — lives here or in src/content/.
// Keep engine code free of game names.
//
// BandaiCompare is the engine's first multi-game site (SITE.lines): Union
// Arena, Dragon Ball Super Fusion World and the Digimon Card Game, three
// TCGplayer categories in one catalogue (owner, 2026-11-03).
import type { SiteConfig } from "@/lib/site-types";
import { STORES } from "@/content/stores";

export const SITE: SiteConfig = {
  key: "bandai",
  name: "BandaiCompare",
  shortName: "BandaiCompare",
  wordmark: ["BANDAI", "COMPARE"],
  game: "Union Arena, Dragon Ball Super Fusion World and Digimon",
  gameShort: "Union Arena, DBS & Digimon",
  domain: "bandaicompare.com",
  // The bare domain is the address (owner, 2026-11-03: bandaicompare.com).
  apexHost: true,
  // Three games with many boxes and starter decks: the homepage opens with the big sealed hero.
  homeSealedHero: true,
  tagline: "Compare Union Arena, Dragon Ball Super and Digimon card prices across every store",
  description:
    "Free price comparison for Union Arena, Dragon Ball Super Fusion World and Digimon Card Game booster boxes, starter decks and singles, across TCGplayer, eBay and card stores in the US, UK, Canada, Australia, Europe and Singapore.",
  keywords: [
    "union arena prices",
    "union arena booster box",
    "dragon ball super fusion world prices",
    "fusion world booster box",
    "digimon card game prices",
    "digimon booster box",
    "where to buy union arena",
  ],
  adminEmails: ["bill.jyang101@gmail.com"],
  supportEmail: "compareempire@gmail.com",
  ownerEmail: "bill.jyang101@gmail.com",

  // The brand names a company: say plainly we are not it (owner, 2026-11-03; WargameCompare's rule for Games Workshop).
  disclaimer:
    "BandaiCompare is not affiliated with, endorsed by or sponsored by Bandai, Bandai Namco or any of their companies. Union Arena, Dragon Ball Super, Digimon and related names are trademarks of their owners, used only to describe the products stores sell.",
  priceAlerts: true,
  // The first game; with `lines` set, each game's own category, slug and eBay words win.
  tcgcsvCategoryId: 81,
  tcgplayerSlug: "union-arena",
  lines: [
    {
      id: "ua",
      name: "Union Arena",
      short: "Union Arena",
      slug: "union-arena",
      tcgcsvCategoryId: 81,
      tcgplayerSlug: "union-arena",
      ebayQuery: "union arena",
      blurb: "Bandai's anime crossover card game: Jujutsu Kaisen, Demon Slayer, Chainsaw Man, Solo Leveling and dozens more series, each its own set.",
      color: "#ff3d6e",
    },
    {
      id: "fw",
      name: "Dragon Ball Super Fusion World",
      short: "Fusion World",
      slug: "dragon-ball-super-fusion-world",
      tcgcsvCategoryId: 80,
      tcgplayerSlug: "dragon-ball-super-fusion-world",
      ebayQuery: "dragon ball super fusion world",
      blurb: "The Dragon Ball Super Card Game's 2024 reboot: FB booster sets, FS starter decks and the Manga Boosters collectors chase.",
      color: "#ff9a1f",
    },
    {
      id: "dg",
      name: "Digimon Card Game",
      short: "Digimon",
      slug: "digimon-card-game",
      tcgcsvCategoryId: 63,
      tcgplayerSlug: "digimon-card-game",
      ebayQuery: "digimon card game",
      blurb: "Bandai's Digimon TCG since 2020: BT and EX booster sets, starter decks and Rare Pull alternate arts.",
      color: "#2f9bff",
    },
  ],
  ebay: {
    // Each game's own words (lines[].ebayQuery) start every search; this is the fallback.
    query: "bandai card game",
    singlesCategoryId: "183454",
    sealedCategoryId: "183456",
    minPriceUsd: 10,
    // Its OWN eBay app (owner rule, 2026-11-01: a new site never shares a key). Off until
    // EBAY_CLIENT_ID / EBAY_CLIENT_SECRET exist; half a 5,000-call app. Raise only with the owner.
    dailyBudget: 2500,
    runHourUtc: 3,
  },

  // Fusion World and Digimon number cards "FB11-084" and "BT25-104"; Union
  // Arena "UE24BT/REZ-1-053", which stores write "REZ-1-053". "series" reads all three.
  numberStyle: "series",
  // Three games and over 21,000 TCGplayer products: cards under US$1 in every
  // printing stay out, except in sets from the last 120 days (data and build size).
  catalogMinCardCents: 100,
  sitemapMinCardCents: 300,
  // One Union Arena number exists as SR, SR* and SR***, at very different prices.
  rarityMustAgree: true,
  rarityAliases: {
    "Super Rare 3-Star": ["SR***", "SR3"],
    "Super Rare 2-Star": ["SR**", "SR2"],
    "Super Rare 1-Star": ["SR*", "SR1"],
    "Super Rare": ["SR"],
    "Rare 2-Star": ["R**"],
    "Rare 1-Star": ["R*"],
    "Uncommon 1-Star": ["U*", "UC*"],
    "Secret Rare": ["SEC", "SCR"],
    "Ultimate Rare": ["UR"],
  },
  extraAttrs: ["Color", "CardType", "SeriesName", "Affinities", "Cost", "Power", "PlayCost", "LevelLv", "DigimonType", "Character Traits"],
  sealedTypes: [
    [/\b(sleeves?|playmat|deck box|binder|dice|energy markers?|tokens?|token card|code card)\b/i, "Insert"],
    [/\bcase\b/i, "Case"],
    [/starter deck display/i, "Starter Deck Display"],
    [/starter deck|advanced deck|\bdeck set\b/i, "Starter Deck"],
    [/release event pack|pre-?release|event pack/i, "Prerelease"],
    [/booster (box|display)/i, "Booster Box"],
    [/booster pack|promotion pack|\bpack\b/i, "Booster Pack"],
    [/premium card collection|set bundle|anniversary set|collection/i, "Collection"],
  ],
  // Every rarity TCGplayer used across the three games on 2026-11-03, rarest first.
  rarityOrder: [
    "Super Rare 3-Star", "Secret Rare", "Ultimate Rare", "Super Rare 2-Star", "Super Rare 1-Star", "Super Rare", "Leader",
    "Rare 2-Star", "Rare 1-Star", "Rare", "Uncommon 2-Star", "Uncommon 1-Star", "Uncommon", "Common 2-Star", "Common 1-Star", "Common",
    "Action Point 1-Star", "Action Point", "Promo",
  ],
  chaseRarities: ["Super Rare 3-Star", "Secret Rare", "Ultimate Rare", "Super Rare 2-Star"],
  cardHubs: [
    // Union Arena's sets are anime series: a hub per series ("Jujutsu Kaisen Union Arena cards").
    { facet: "series", attr: "SeriesName", noun: ["series", "series"], title: "{v} Union Arena cards", blurb: "Every Union Arena set is one anime or game series. These are all its cards, most valuable first." },
    { facet: "color", attr: "Color", noun: ["colour", "colours"], titleCase: true, title: "{v} Fusion World and Digimon cards", blurb: "Fusion World and Digimon decks are built around colours." },
  ],

  theme: {
    brand: "#ff6a1a",
    brandLight: "#ff9a5c",
    brandDark: "#c94a06",
    accent: "#2f9bff",
    pageDark: "#0b0d17",
    inkDark: ["#070811", "#0f1220", "#161a2c", "#1f2439", "#30364f", "#4a516c"],
    wordmarkGradient: "linear-gradient(180deg, #ffd27a 0%, #ff6a1a 55%, #c94a06 100%)",
    displayFont: "Dela Gothic One",
  },
  halloween: {
    headline: "Spooky season pulls",
    blurb: "Find the cheapest Union Arena, Fusion World and Digimon boxes before the next drop.",
  },
  christmas: {
    headline: "Gift a booster box",
    blurb: "Union Arena, Fusion World and Digimon boxes and starter decks to gift, cheapest store first",
  },

  stores: STORES,
  // The whole Compare Empire family, card games first (DECISIONS.md "Every
  // site links the whole family"). `anchor` is the link text.
  sisterSites: [
    { name: "Rift Compare", url: "https://riftcompare.com", game: "Riftbound", anchor: "Riftbound card prices", search: "https://riftcompare.com/browse?q={q}" },
    { name: "OP Compare", url: "https://opcompare.app", game: "One Piece", anchor: "One Piece card prices", search: "https://opcompare.app/browse?q={q}" },
    { name: "DexCompare", url: "https://dexcompare.app", game: "Pokémon", anchor: "Pokémon sealed prices", search: "https://dexcompare.app/us/sealed?q={q}" },
    { name: "MTG Compare", url: "https://mtgcompare.app", game: "Magic", anchor: "Magic: The Gathering sealed prices", search: "https://mtgcompare.app/us/sealed?q={q}" },
    { name: "Gundam Compare", url: "https://gundamcompare.com", game: "Gundam", anchor: "Gundam Card Game prices", search: "https://gundamcompare.com/cards?q={q}" },
    { name: "Lorcana Compare", url: "https://lorcanacompare.com", game: "Disney Lorcana", anchor: "Disney Lorcana card prices", search: "https://lorcanacompare.com/cards?q={q}" },
    { name: "YGO Compare", url: "https://ygocompare.com", game: "Yu-Gi-Oh!", anchor: "Yu-Gi-Oh! card prices", search: "https://ygocompare.com/cards?q={q}" },
    { name: "Cyberpunk Compare", url: "https://cyberpunkcompare.com", game: "Cyberpunk TCG", anchor: "Cyberpunk TCG prices", search: "https://cyberpunkcompare.com/cards?q={q}" },
    { name: "WargameCompare", url: "https://wargamecompare.com", game: "Wargames", anchor: "Miniature wargame prices" },
    { name: "FigureCompare", url: "https://figurecompare.com", game: "Anime figures", anchor: "Anime figure prices" },
    { name: "CamCompare", url: "https://www.camcompare.app", game: "Cameras", anchor: "Camera and lens prices" },
    { name: "Compare Empire", url: "https://compareempire.com", game: "Tech", anchor: "Tech and appliance prices" },
  ],
  family: { id: "bandai" },
  social: {},
};
