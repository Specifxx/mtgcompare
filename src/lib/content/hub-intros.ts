// ─────────────────────────────────────────────────────────────────────────────
// Editorial intros for the hub and tool pages (RiftCompare's
// lib/content/hub-intros.ts, written for Magic: The Gathering).
// ─────────────────────────────────────────────────────────────────────────────
// Interactive tools whose value is the thing they DO, not the words on them,
// read as an empty page to a visitor who lands from search and to anything
// that judges a page by its content. So each says what the tool does, what
// data it runs on, when to reach for it, and what it will not do — written
// once, checked against the tool's actual behaviour.
//
// Rules for an entry (RiftCompare, "Blog and tools, joined up"):
//  - PAGE-SPECIFIC: no sentence appears in two entries.
//  - Short enough that the tool still starts about one phone screen down.
//  - Facts from code, stated the way the code does them: six markets; prices
//    read twice a day; comparisons ranked by ITEM price (only Best Basket prices
//    whole orders, with measured postage); nothing forecasts a price.
//  - No figure a constant owns and could change, and no set named.
// A paragraph may carry internal links as `[label](/path)` (HubIntro renders
// single-slash paths only). Entries for the catalogue pages (/sets, /sealed,
// /price-guide, /movers, /market) are the catalogue track's to add.

export type HubIntro = { paragraphs: string[] };

import { CATALOGUE_HUB_INTROS } from "./hub-intros-catalogue";

export const HUB_INTROS: Record<string, HubIntro> = {
  ...CATALOGUE_HUB_INTROS,
  // Rendered BELOW the builder: /deck opens on the tool.
  "/deck": {
    paragraphs: [
      "Price a Magic: The Gathering deck or any card list as you build it. Paste an export from your deck builder or type the cards in, and the total updates as you edit: each card's cheapest in-stock price in your selected market, times its quantity. That is a sum of item prices that may span several stores, before postage — a quick answer to what a list costs, not a checkout total.",
      "The build cost is the point. A tournament list tells you what to play; it does not tell you that one card in it is most of the budget, or what the same list costs in another market — switch market and it re-prices there.",
      "Lists are shareable by URL, so a deck you price here can be sent to someone else and re-priced in their market, or published to the deck library with your name on it. When you are ready to buy, \"Buy this deck for less\" hands the list to Best Basket, which prices whole orders with each store's measured postage.",
    ],
  },
  "/trade": {
    paragraphs: [
      "Work out whether a Magic trade is fair before you shake on it. Put the cards on each side in, and it values both piles at the cheapest live price we have recorded for each card, in your market and currency, then shows the gap. Tap a price to type your own, or to pick one store's price if the cheapest copy is not the one on the table.",
      "Values move week to week and nobody has them memorised, so a trade at a local game store is easy to get wrong by accident: a borderless or foil-etched printing can be worth ten times the standard one, and a stack of rares can be worth less than the one mythic across the table.",
      "The valuation is a market snapshot, not an appraisal: condition, sentiment and how much either of you wants the card are things it cannot see. The [rarity](/cards/rarity) and [treatment](/cards) pages show why printings of one card are priced so far apart.",
    ],
  },
  "/tools/best-basket": {
    paragraphs: [
      "The cheapest card is rarely the cheapest order. Postage is charged per store, so a shopping list split across five shops to save a few cents on each card routinely costs more delivered than buying the whole list from two. This works out which combination of stores actually costs least.",
      "Give it the cards you want and it searches store combinations for the lowest total including postage. Any signed-in account sees its own delivered total; with Premium it also shows the best one-store and two-store orders beside it, so you can see what splitting the order actually saves. Usually the answer is not the split with the cheapest individual cards.",
      "Postage is each store's own checkout rate, measured for orders of different sizes and values to addresses across your market, never guessed. A store we have not measured yet is marked as an estimate, and the store's checkout is always final; the questions below cover regions, tracked and untracked letters, and free-postage thresholds in full.",
    ],
  },
  "/tools/deal-finder": {
    paragraphs: [
      "Deal Finder lists the Magic cards a store or an eBay seller in your market is selling for less than TCGplayer's US market price, converted into your currency and ranked by how far below it sits. TCGplayer's market price is a reference built from recent US sales, and an eBay price is one seller's asking price, so a big gap is a reason to look, not a guarantee: the cheap copy is often one seller's only one, and it may be a lower grade.",
    ],
  },
  "/tools/box-ev": {
    paragraphs: [
      "Is a Magic booster box worth more opened than it costs? The calculator values every card a pack can hold at its TCGplayer US market price, converted into your currency, averages each pull pool — common to mythic rare, plus the borderless, showcase and foil chase printings — multiplies each average by how many of that pool a box yields, and sets the total against the box's price.",
      "Wizards of the Coast publishes pull rates only in part, and they differ by booster type. The rates here are estimates, set at the low end on purpose, and every one can be changed to match what you have seen. The box price starts at the cheapest in-stock booster box we track in your market; [sealed product](/sealed) compares where a box costs least, market by market.",
    ],
  },
  "/tools/rising": {
    paragraphs: [
      "Rising Cards is a screen, not a prediction. It ranks the most-searched Magic cards that have a price in your market on six signals: how often each is picked from search, how fast that is rising, where today's price sits in the card's own recent range, how many stores have it in stock, its change on last week, and how much its price usually moves — a card already up sharply is marked down, not rewarded. Every row gives its reason in one line.",
      "Demand and stock are read every day. The price signals use one price a week per card from the history we keep, with today's price added as the newest point, so the history grows once a week and its latest point moves with each import. A card at the top is one worth a look, never a promise of a rise.",
    ],
  },
  "/tools/demand": {
    paragraphs: [
      "Demand Finder counts attention, not prices: how often each Magic card is picked from MTG Compare's search box, and how often it is opened, either its card page or its quick view. Each browser counts a card once a day, bots are not counted, and the server limits how often one address can count a card, so one visitor refreshing cannot move it up. Counts are worldwide; the price beside a card is the cheapest in-stock price we track in your market.",
      "The 7- and 30-day windows are measured against a daily snapshot of the running totals taken that many days ago, and the page says so when the snapshots do not reach back that far yet. A card at the top is one players are looking at, not a price forecast.",
    ],
  },
  "/tools/selling-fees": {
    paragraphs: [
      "Work out what you keep from selling a Magic card on TCGplayer, eBay or another marketplace. Enter the sale price, the postage you charge the buyer, what posting it actually costs you and your marketplace's rates, and the calculator stacks the fees on the amounts each marketplace charges them on. The payout appears once a commission is entered, because without it the biggest fee would be missing.",
      "Commission is the one rate never filled in for you: both marketplaces tier and revise their fees, so a printed percentage goes stale, and your seller dashboard has your real one.",
    ],
  },
  "/tools": {
    paragraphs: [
      "The price tools here run on the same data as the rest of MTG Compare: the prices our twice-daily import reads from stores, TCGplayer and eBay in six markets — the US, Australia, the UK, Singapore, Canada and the EU. Each answers one question: what a card or a whole list costs, whether a box is worth opening, whether a trade is fair, or what you keep after selling.",
      "A price is an item price unless a tool says otherwise; Best Basket is the one that prices whole orders with each store's measured postage. None of them forecasts where a price will go.",
    ],
  },
  "/decks": {
    paragraphs: [
      "Decklists published by players on MTG Compare, each priced in your market: a deck's total is every card's quantity times its cheapest in-stock price there, before postage. A deck with any card unpriced in your market says so instead of showing a partial total, so a missing figure means a gap in the data, not a cheap deck.",
      "Open a deck for the cheapest store per card, how its cost has moved since it was published, and a Budget build that swaps each card for its cheapest printing; \"Buy this deck for less\" hands the list to Best Basket, which prices whole orders with each store's measured postage.",
    ],
  },
};

export const hubIntro = (path: string): string[] => HUB_INTROS[path]?.paragraphs ?? [];
