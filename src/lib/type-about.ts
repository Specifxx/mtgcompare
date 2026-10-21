// Keyed by the type's slug (sealed-title.ts PRODUCT_TYPES): the type page's intro, and the words other pages (the guides) use when
// they describe a type. What the product holds, never a price, a trend or a claim about value. Pure.

// A sentence per type that says what it is, so a category page is more than a grid.
export const TYPE_ABOUT: Readonly<Record<string, string>> = {
  "booster-boxes": "A booster box (or booster display) is a sealed case of 36 booster packs from one set — the cheapest way to buy packs in bulk and the product most collectors keep sealed.",
  "elite-trainer-boxes": "An Elite Trainer Box holds 8–9 booster packs plus sleeves, energy cards, dice, condition markers and a storage box, and usually a set-exclusive promo card.",
  "pokemon-center-elite-trainer-boxes": "Pokémon Center Elite Trainer Boxes add extra packs and a stamped promo to the retail ETB, and were originally sold only through the Pokémon Center.",
  "booster-bundles": "A booster bundle is six booster packs from one set in a single sleeve — a lower-cost step between loose packs and an ETB.",
  "ultra-premium-collections": "Ultra-Premium Collections are the top-end collector boxes: many packs, metal or foil promo cards and premium accessories.",
  collections: "Collection boxes pair booster packs with promo cards, figures, pins or binders — often themed on a single Pokémon.",
  tins: "Tins hold booster packs and a promo card in a collectable metal case; mini tins hold fewer packs and a coin or art card.",
  "build-and-battle-boxes": "Build & Battle Boxes are the prerelease kit: four booster packs, a promo card and the cards to build a deck around them, made to play on day one.",
  "build-and-battle-stadiums": "A Build & Battle Stadium is two Build & Battle kits plus extra packs, for two players.",
  blisters: "Blister packs hold one to three booster packs with a promo card or coin, sold on pegs at most retailers.",
  "sleeved-boosters": "Sleeved boosters are single booster packs in a retail sleeve.",
  "booster-packs": "Single booster packs, loose. Prices are per pack.",
  decks: "Ready-to-play decks: League Battle Decks, Battle Academy and theme decks.",
  "booster-box-cases": "A booster box case is a sealed case of booster boxes (usually six), straight from the distributor.",
  "elite-trainer-box-cases": "A sealed case of Elite Trainer Boxes (usually ten).",
  "booster-bundle-cases": "A sealed case of booster bundles.",
};
