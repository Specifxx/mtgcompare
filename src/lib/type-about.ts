// Keyed by the type's slug (sealed-title.ts PRODUCT_TYPES): the type page's intro, and the words other pages (the guides) use when
// they describe a type. What the product holds, never a price, a trend or a claim about value. Pure. Pack counts are packs.ts's;
// a sentence here names one only where packs.ts does.

// A sentence per type that says what it is, so a category page is more than a grid.
export const TYPE_ABOUT: Readonly<Record<string, string>> = {
  "play-booster-boxes": "A Play Booster Box (or display) is a sealed box of Play Boosters from one set: 36 packs for sets up to early 2025 and 30 from Aetherdrift on. Play Boosters replaced Draft and Set Boosters in 2024.",
  "collector-booster-boxes": "A Collector Booster Box holds 12 Collector Boosters, the premium pack: mostly foils, alternate art and the set's rarest treatments.",
  "draft-booster-boxes": "A Draft Booster Box is a display of Draft Boosters, the pack sets were drafted with before Play Boosters arrived in 2024.",
  "set-booster-boxes": "A Set Booster Box is a display of Set Boosters, the opening-focused pack sold from Zendikar Rising (2020) until Play Boosters replaced it in 2024.",
  "jumpstart-booster-boxes": "A Jumpstart Booster Box is a display of Jumpstart packs: each is half a themed deck, shuffled with another to play straight away.",
  bundles: "A Bundle holds booster packs (9 Play Boosters in the Play Booster era), basic lands, a foil promo card, a spindown life counter and a storage box.",
  "gift-bundles": "A Gift Bundle is the Bundle's bigger edition: Play Boosters plus a Collector Booster, extra lands and a promo, in a gift box.",
  "special-bundles": "Special bundles are a set's own named editions of the Bundle (a Codex Bundle, a Nightmare Bundle, a Beam Me Up Bundle) with different contents and prices.",
  "commander-decks": "Commander decks are ready-to-play 100-card decks for Magic's most popular format, usually four or five per release, each built around a face commander. A Collector's Edition is the same deck in foil.",
  "commander-deck-sets": "A Commander deck set is every Commander deck of a release together, sold as one.",
  "prerelease-packs": "A Prerelease Pack is the kit a set's prerelease events are played with: six boosters, a dated foil rare and a deck box.",
  "draft-night": "Draft Night is a boxed kit for a small group draft: Play Boosters, a Collector Booster and basic lands.",
  "scene-boxes": "A Scene Box holds a few Play Boosters and a set of borderless foil cards whose art joins up into one scene, with a display easel.",
  "starter-kits": "Starter Kits, Beginner Boxes and Starter Collections are made to learn the game: ready-to-play decks and a guide.",
  "secret-lair": "Secret Lair drops are Wizards' limited print-to-order card sets, sold in foil and non-foil editions, each a product of its own.",
  "play-booster-packs": "Single Play Boosters, loose. Prices are per pack.",
  "collector-booster-packs": "Single Collector Boosters, loose. Prices are per pack.",
  "draft-booster-packs": "Single Draft Boosters, loose. Prices are per pack.",
  "set-booster-packs": "Single Set Boosters, loose. Prices are per pack.",
  "jumpstart-booster-packs": "Single Jumpstart packs, loose. Prices are per pack.",
  decks: "Ready-to-play decks other than Commander: Challenger decks, Duel Decks, Starter Commander decks, theme decks and Game Night.",
  collections: "Collections and gift boxes: Commander Collection, Signature Spellbook, From the Vault and similar boxed sets.",
  "play-booster-box-cases": "A sealed case of Play Booster Boxes, straight from the distributor.",
  "collector-booster-box-cases": "A sealed case of Collector Booster Boxes, straight from the distributor.",
  "bundle-cases": "A sealed case of Bundles, straight from the distributor.",
};
