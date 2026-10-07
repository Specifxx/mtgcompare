import type { HubIntro } from "./hub-intros";

// Editorial intros for the catalogue hubs (RiftCompare's hub-intros.ts, written
// for One Piece), merged into HUB_INTROS. Same rules as the tool intros: each
// is page-specific (no sentence repeats across entries), says what the page
// does, what data it runs on and what it will not do, links only to site paths
// as `[label](/path)`, and names no set or figure a constant owns.
export const CATALOGUE_HUB_INTROS: Record<string, HubIntro> = {
  "/market": {
    paragraphs: [
      "The OP Compare Index is one number for the whole One Piece singles market, so you can tell whether a card moved on its own or the market moved with it. It is chained and value-weighted over TCGplayer's market price of every single worth US$1 or more, counting only cards priced on both days, so a new set joining never jolts it.",
      "Below the chart are the figures a market reports (basket value, the average and median card, breadth and volatility), the constituents ranked by price and the value of each set. It is a reference for direction in US dollars, not a price you can buy at; for what a card costs where you live, open it. [This week's movers](/movers) names the cards behind the index's moves.",
    ],
  },
  "/movers": {
    paragraphs: [
      "These are the One Piece singles whose price moved most this week, in three lists: the biggest risers, the biggest drops and the best value against a card's own recent high. A move compares TCGplayer's market price today with the same card about seven days earlier, in US dollars, so it reads the same in every market.",
      "A week is a short window, and a tournament result or a set reveal can spike a card that settles once players adjust. Use the lists to find a card worth a closer look, then open it for the cheapest listing in your market; the [OP Compare Index](/market) shows whether one card moved or the whole market did.",
    ],
  },
  "/price-guide": {
    paragraphs: [
      "Every One Piece Card Game printing in one table, one row per printing, each with the cheapest in-stock price we track in your market, how many stores have it and its recent move. Search it, filter by set, colour, rarity, type, printing or price, and sort any column; a market button re-prices every row for another country.",
      "A price is an item price from a store, TCGplayer or eBay with postage added at checkout, an asking price on a live listing rather than a record of a sale. Where the rows show a TCGplayer figure it is TCGplayer's own US market price. To see why printings of one card cost so differently, read [rarities explained](/blog/one-piece-card-rarities-explained).",
    ],
  },
  "/sets": {
    paragraphs: [
      "One Piece is released in booster sets, extra boosters and premium boosters, with starter decks, promotions and event cards around them. Every set here has its own page with the full card list, a price guide of every printing dearest first, the set's sealed product and a gallery of every card as art.",
      "Sets are listed newest first, with the next release at the top while it is still ahead of us. A set's page prices each card in your market from the stores we track, so the same set can read very differently in another country; [booster box prices](/blog/one-piece-booster-box-prices) compares what a box costs market by market.",
    ],
  },
  "/sealed": {
    paragraphs: [
      "Booster boxes, cases, packs, starter decks, double packs and collections, priced across the stores we track in your market. A tile's price is the cheapest offer you can order now, the item price with postage at the store's checkout, and tapping a tile opens every offer cheapest first with when each was last checked.",
      "Filters and sort apply as you click, and a product every tracked store has sold out says so rather than showing a stale price. If you want particular cards, singles are often cheaper than opening product for them: the [Box EV calculator](/tools/box-ev) weighs a box against the cards in it.",
    ],
  },
  "/leaders": {
    paragraphs: [
      "A Leader is the one card a One Piece deck is built around: it sets the deck's colours and starting Life, and its effect shapes every other card choice. This page lists every Leader with the cheapest price we track for it in your market, so a deck's most important card can be costed first.",
      "Open a Leader for every printing of it and the cards that share its colours. The [cheapest Leaders to start with](/blog/cheapest-one-piece-leaders) ranks the ones that cost least in your market, and the [deck pricer](/deck) totals a whole list once you have chosen.",
    ],
  },
  "/colors": {
    paragraphs: [
      "One Piece cards come in six colours, Red, Green, Blue, Purple, Black and Yellow, and a Leader's colours decide which cards its deck can run. Each colour has a page listing its cards by price, so you can see where a colour's value is concentrated before you build or buy into it.",
      "A card can carry two colours and so appears in both. Prices are the cheapest in-stock listing in your market; for the cards behind a colour's recent moves, see [this week's movers](/movers).",
    ],
  },
};
