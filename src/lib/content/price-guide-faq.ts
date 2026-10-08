// The price guide's FAQ (RiftCompare's PRICE_GUIDE_FAQ, written for Magic: The Gathering):
// rendered as a visible HubFaq and published as FAQPage JSON-LD. Every answer
// states only what the page does: nothing forecasts a price and no figure is one
// a constant owns and could change.
export const PRICE_GUIDE_FAQ: { q: string; a: string }[] = [
  {
    q: "Where do the prices in the Magic price guide come from?",
    a: "Each row's price is the cheapest in-stock listing MTG Compare found in your market across the stores we track, TCGplayer and, where it matches, eBay. It is an asking price on a live listing, not a record of a sale. Prices are read twice a day, and the TCGplayer figure beside it is TCGplayer's own US market price, built from recent sales.",
  },
  {
    q: "Why is one card listed several times?",
    a: "Each printing is its own TCGplayer product with its own price. A card such as Lightning Bolt can have a standard print, a borderless or showcase version, a foil etching and reprints in many sets, so the guide has one row per printing. Filter by treatment to see only borderless, showcase or extended-art cards.",
  },
  {
    q: "What does the 7-day column mean?",
    a: "It is the change in TCGplayer's market price against seven days earlier. It stays blank until a card has a week of recorded history. A 30-day column appears only when enough of the priced cards have a month of history to make it meaningful.",
  },
  {
    q: "Can I see prices in another country?",
    a: "Yes. Use the market buttons above the table: the guide re-prices every row in that market's currency from the stores we track there. A link with a market in it shows that market's prices to anyone who opens it, with a link back to your own.",
  },
  {
    q: "Does the guide include sealed product?",
    a: "No. This table lists single cards only. Booster boxes, bundles, packs and Commander decks have their own page, with each store's offers ranked cheapest first.",
  },
];
